import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client } from '@opensearch-project/opensearch';
import { ConfigService } from '@nestjs/config';
import { OpensearchIndexableDocument } from 'types/opensearch-index';
import { BulkByScrollTaskStatus } from '@opensearch-project/opensearch/api/_types/_common';

@Injectable()
export class OpensearchService implements OnModuleInit {
  private readonly logger = new Logger(OpensearchService.name);
  private readonly INDEX_NAME = 'user-files-v1-768'; // Versioning indexes is good practice
  private client: Client;

  constructor(private readonly configService: ConfigService) {
    // Initialize Client (Ensure you handle this either here or via a dedicated module)
    this.logger.log(
      'Initializing OpenSearch Client',
      `${this.configService.get<string>('OPENSEARCH_USERNAME')}@${this.configService.get<string>('OPENSEARCH_NODE')}, password: ${this.configService.get<string>('OPENSEARCH_PASSWORD')}`,
    );
    this.client = new Client({
      node: this.configService.get<string>('OPENSEARCH_NODE'),
      //   auth: {
      //     username: this.configService.get<string>('OPENSEARCH_USERNAME'),
      //     password: this.configService.get<string>('OPENSEARCH_PASSWORD'),
      //   },
      //   ssl: {
      //     rejectUnauthorized: false,
      //   },
    });
  }

  async onModuleInit() {
    await this.createIndexIfNotExists();
  }

  async indexDocument(document: OpensearchIndexableDocument) {
    try {
      await this.client.index({
        index: this.INDEX_NAME,
        id: document.id,
        body: {
          ...document,
          createdAt: new Date(),
          updatedAt: new Date(),
          isDeleted: document.isDeleted ?? false,
        },
      });
      this.logger.log(`Document "${document.id}" indexed successfully.`);
    } catch (error) {
      this.logger.error(
        `Failed to index document "${document.id}": ${error.message}`,
        error,
      );
      throw error;
    }
  }

  async queryDocuments(embeddings: number[], topK: number = 10) {
    try {
      const { body } = await this.client.search({
        index: this.INDEX_NAME,
        size: topK,
        body: {
          query: {
            knn: {
              embedding: {
                vector: embeddings,
                k: topK,
              },
            },
          },
        },
      });

      return body.hits.hits.map((hit) => hit._source);
    } catch (error) {
      this.logger.error(`Failed to query documents: ${error.message}`, error);
      throw error;
    }
  }

  async markDocumentAsDeletedByS3Key(filePathPrefix: string) {
    const queryId = await this.client.updateByQuery({
      index: this.INDEX_NAME,
      conflicts: 'proceed',
      wait_for_completion: false,
      body: {
        query: {
          bool: {
            filter: [
              {
                prefix: {
                  'fileSystemPath.raw': filePathPrefix,
                },
              },
              {
                match: {
                  isDeleted: false,
                },
              },
            ],
          },
        },
        script: {
          source: 'ctx._source.isDeleted = true;',
          lang: 'painless',
        },
      },
    });
  }

  async monitorAndThrottleUpdate(taskId: string) {
    // 1. Fetch the current status of the task
    const response = await this.client.tasks.get({ task_id: taskId });
    const taskData = response.body.task;
    const status = taskData.status as BulkByScrollTaskStatus;

    // 2. Extract metrics
    const totalDocs = status.total;
    const processedDocs = status.updated + status.created + status.deleted;

    // Convert nanoseconds to seconds for standard speed calculation
    const runningTimeSec = taskData.running_time_in_nanos / 1_000_000_000;

    // 3. Calculate actual documents processed per second
    const currentSpeed = processedDocs / runningTimeSec;

    console.log(`Progress: ${processedDocs}/${totalDocs}`);
    console.log(`Current Speed: ${currentSpeed.toFixed(2)} docs/sec`);

    // 4. Evaluate and Throttle
    // If processing over 100 docs/sec, slow it down to save JVM memory
    if (currentSpeed > 100) {
      console.log('Speed threshold exceeded. Throttling task...');

      await this.client.updateByQueryRethrottle({
        task_id: taskId,
        requests_per_second: 50, // Force OpenSearch to slow down to 50 docs/sec
      });
    }
  }

  private async createIndexIfNotExists() {
    try {
      // 1. Check if index exists
      const { body: exists } = await this.client.indices.exists({
        index: this.INDEX_NAME,
      });

      if (exists) {
        this.logger.log(
          `Index "${this.INDEX_NAME}" already exists. Skipping creation.`,
        );
        return;
      }

      this.logger.log(
        `Creating index "${this.INDEX_NAME}" with 768-dim Vector mappings...`,
      );

      // 2. Create Index with Settings & Mappings
      await this.client.indices.create({
        index: this.INDEX_NAME,
        body: {
          settings: {
            'index.knn': true, // CRITICAL: Enables Vector Search
            number_of_shards: 1,
            number_of_replicas: 1,
          },
          mappings: {
            properties: {
              // --- Identity & Permissions ---
              id: { type: 'keyword' },
              createdById: { type: 'keyword' },
              parentId: { type: 'keyword' },

              // --- Content (Hybrid Search) ---
              text: {
                type: 'text',
                analyzer: 'standard', // For Full-Text Search ("invoice", "tax")
              },
              embedding: {
                type: 'knn_vector',
                dimension: 768, // <--- UPDATED: Correct size for text-embedding-004
                method: {
                  name: 'hnsw',
                  engine: 'faiss',
                  space_type: 'innerproduct', // <--- UPDATED: Best for Gemini vectors
                  parameters: {
                    ef_construction: 128,
                    m: 24,
                  },
                },
              },

              // --- Metadata ---
              s3Key: { type: 'keyword' },
              mimeType: { type: 'keyword' },
              fileSystemPath: {
                type: 'text',
                fields: {
                  raw: { type: 'keyword' }, // Allows exact path matching
                },
              },
              size: { type: 'long' },
              pageCount: { type: 'integer' }, // Useful for your "Small File" logic
              chunkIndex: { type: 'integer' }, // Helpful for sorting chunks later
              createdAt: { type: 'date' },
              updatedAt: { type: 'date' },
              isDeleted: { type: 'boolean' },
            },
          },
        },
      });

      this.logger.log(`Index "${this.INDEX_NAME}" created successfully.`);
    } catch (error) {
      this.logger.error(
        `Failed to initialize OpenSearch index: ${error.message}`,
        error,
      );
    }
  }
}

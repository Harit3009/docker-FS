import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client } from '@opensearch-project/opensearch';
import { ConfigService } from '@nestjs/config';
import { OpensearchIndexableDocument } from 'types/opensearch-index';

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

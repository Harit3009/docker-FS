import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getJsonMetaGenerationPrompt } from '../ai-retrieval/prompts';

export interface ChatResponse {
  answer: string;
  sources: { id: string; s3Key: string }[];
}

type EmbeddingAPIResponse = {
  embedding: number[];
};

export type MessageType = {
  role: 'user' | 'system' | 'assistant' | 'tool';
  content: string;
};

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    private configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  async onModuleInit() {}

  normalizeEmbeddings(embeddings: number[]): number[] {
    const norm = Math.sqrt(embeddings.reduce((sum, val) => sum + val * val, 0));
    return norm === 0 ? embeddings : embeddings.map((val) => val / norm);
  }

  async generateEmbeddings(
    text: string,
    taskType: 'QUERY' | 'DOCUMENT' = 'DOCUMENT',
  ): Promise<number[]> {
    return new Promise((resolve, reject) => {
      this.httpService
        .post<EmbeddingAPIResponse>(
          this.configService.get<string>('EMBEDDING_API_URL'),
          {
            prompt: `${taskType === 'QUERY' ? `Instruct: Given a document search query, retrieve relevant passages that answer the query\nQuery: ` : ''}${text}`,
            model: this.configService.get<string>('EMBEDDING_MODEL'),
          },
        )
        .subscribe((res) => {
          if (!res.data?.embedding) {
            this.logger.error(
              `Embedding API did not return an embedding for text: ${text}`,
              res.data,
            );
            return reject(new Error('No embedding in response'));
          }

          resolve(this.normalizeEmbeddings(res.data.embedding));
        });
    });
  }

  async generateJSONBDescriptionFromPrologue(
    chunks: string,
    think: boolean = false,
  ) {
    const messages: MessageType[] = [
      {
        role: 'system',
        content: getJsonMetaGenerationPrompt,
      },
      {
        role: 'user',
        content: `Analyze the following text from the beginning of a document and generate the required JSON metadata:<TEXT>${chunks}</TEXT>`,
      },
    ];

    return this.passConversationToAI(messages, {
      think,
      task: 'small',
      format: 'json',
    });
  }

  /**
   * Calculates Dot Product for normalized vectors.
   */
  fastSimilarityBetweenUnitVectors(vecA: number[], vecB: number[]) {
    let score = 0;
    const len = vecA.length;

    for (let i = 0; i < len; i++) {
      score += vecA[i] * vecB[i];
    }

    return score;
  }

  async passConversationToAI(
    messages: MessageType[],
    params: {
      stream?: boolean;
      format?: string;
      temperature?: number;
      think?: boolean;
      task?: 'small' | 'large';
    },
  ) {
    const {
      task = 'small',
      stream = false,
      format,
      temperature = 0.0,
      think = false,
    } = params;
    return new Promise((resolve, reject) => {
      this.httpService
        .post<any>(this.configService.get<string>('CHAT_API_URL'), {
          model: this.configService.get<string>(
            task === 'large' ? 'LARGE_TASK_LLM_MODEL' : 'SMALL_TASK_LLM_MODEL',
          ),
          messages,
          stream,
          format,
          temperature,
          think,
          options: {
            num_ctx: 16384, // Give it a large window for PDF + Thinking + JSON
            num_predict: -1, // -1 tells Ollama "don't stop until the model is done"
            temperature: 0, // Keep it deterministic for metadata extraction
          },
        })
        .subscribe((res) => {
          resolve(res.data);
        });
    });
  }
}

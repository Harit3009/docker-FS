import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpensearchIndexableDocument } from 'types/opensearch-index';

export interface ChatResponse {
  answer: string;
  sources: { id: string; s3Key: string }[];
}

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(private configService: ConfigService) {}

  async onModuleInit() {}

  async generateEmbeddings(
    texts: string[],
    taskType: 'QUERY' | 'DOCUMENT' = 'DOCUMENT',
  ): Promise<number[][]> {
    return [];
  }

  async chatAgent(
    query: string,
    contextDocs: OpensearchIndexableDocument[],
  ): Promise<ChatResponse> {
    // 1. Format Context
    const contextString = contextDocs
      .map((doc) => `[Document ID: ${doc.id}]\nContent: ${doc.text}`)
      .join('\n\n----------------\n\n');

    // 2. Strict System Prompt for JSON
    const systemPrompt = `
      You are a precise documentation assistant.
      Answer the user's question based ONLY on the provided context.
      
      CRITICAL INSTRUCTION: You MUST output valid JSON.
      
      Format:
      {
        "answer": "Your answer here...",
        "referencedDocumentIds": ["id1", "id2"]
      }
      
      Rules:
      1. If the answer is not in the context, return "answer": "I cannot find the answer."
      2. Do not include markdown formatting (like \`\`\`json). Just the raw JSON string.
    `;

    try {
      return {
        answer: 'This is a placeholder answer.',
        sources: contextDocs.map((doc) => ({ id: doc.id, s3Key: doc.s3Key })),
      };
    } catch (error) {
      this.logger.error('Groq API Failed', error);
      throw new Error('Failed to generate response from Groq');
    }
  }
}

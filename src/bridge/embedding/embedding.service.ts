import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { ConfigService } from '@nestjs/config';
import { TaskType } from '@google/generative-ai';
import { OpensearchIndexableDocument } from 'types/opensearch-index';
import Groq from 'groq-sdk';

export interface ChatResponse {
  answer: string;
  sources: { id: string; s3Key: string }[];
}

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private genAIClient: GoogleGenAI;
  private groq: Groq;
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    this.genAIClient = new GoogleGenAI({ apiKey });
    this.groq = new Groq({
      apiKey: this.configService.get<string>('GROQ_API_KEY'),
    });
  }

  async onModuleInit() {}

  async generateEmbeddings(
    texts: string[],
    taskType: TaskType = TaskType.RETRIEVAL_DOCUMENT,
  ): Promise<number[][]> {
    const response = await this.genAIClient.models.embedContent({
      model: 'text-embedding-004',
      contents: texts,
      config: {
        outputDimensionality: 768,
        taskType: taskType,
      },
    });

    return response.embeddings.map((embedding) => embedding.values);
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
      const completion = await this.groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Context:\n${contextString}\n\nUser Question: "${query}"`,
          },
        ],
        model: 'llama-3.3-70b-versatile', // Smartest/Fastest balance on Groq
        temperature: 0, // 0 is best for factual RAG
        response_format: { type: 'json_object' }, // Enforces JSON structure
      });

      // 3. Parse and Map
      const rawContent = completion.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(rawContent);

      // Map IDs back to S3 Keys safely
      const sources = (parsed.referencedDocumentIds || [])
        .map((id: string) => {
          const doc = contextDocs.find((d) => d.id === id);
          return doc ? { id: doc.id, path: doc.fileSystemPath } : null;
        })
        .filter((item) => item !== null);

      return {
        answer: parsed.answer,
        sources: sources,
      };
    } catch (error) {
      this.logger.error('Groq API Failed', error);
      throw new Error('Failed to generate response from Groq');
    }
  }
}

import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const getJsonMetaGenerationPrompt = `You are an expert data extraction and classification engine pipeline. Your task is to analyze the beginning of a document and generate highly accurate, structured JSON metadata. 

Analyze the provided text and extract the following schema. Output strictly valid JSON and absolutely nothing else. Do not include markdown formatting, backticks, or conversational preamble.

Required JSON Schema:
{
  "document_category": "factual" | "fiction" | "unknown",
  "content_format": "paragraphs" | "tabular" | "both" | "unknown",
  "primary_subject": "A 1-2 sentence description of what the overall document is about.",
  "entities": {
    "nouns_of_interest": ["List specific named subjects (people, animals, or unique items) with a brief descriptor, e.g., 'Bruno the dog', 'Daisy the girl'.", "Empty array if none"],
    "locations": ["List of specific places, cities, or facilities", "Empty array if none"],
    "dates_and_times": [
      {
        "date": "The specific date, year, or time extracted",
        "context": "What this date represents (e.g., 'patient's date of birth', 'date of report', 'invoice due date')"
      }
    ],
    "organizations": ["Companies, institutions, or groups", "Empty array if none"]
  },
  "keywords": ["3 to 5 searchable tags or topics"],
  "is_technical_or_academic": boolean
}

Extraction Rules:
1. Differentiate carefully if the text describes real-world factual events/data or creative fiction.
2. For 'content_format', analyze if the text appears to be standard prose (paragraphs), structured data (tabular/lists), or a mix of both.
3. If an entity type is not found in the text, return an empty array '[]'. Do not invent entities.
`;

const getAnswerFromDocPrompt = (
  xml,
) => `You are an expert analytical assistant. Answer the user's query using strictly the provided Documents.

${xml}

INSTRUCTIONS:
1. Document Isolation: Only associate a text chunk with the Context provided within the same <Document> tag.
2. Synthesis: Cross-reference across documents if the query requires it, but cite the source context accurately.
3. Fallback: If the answer is not in the <Documents> block, state it is missing.`;

export interface ChatResponse {
  answer: string;
  sources: { id: string; s3Key: string }[];
}

type EmbeddingAPIResponse = {
  embedding: number[];
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

  async generateJSONBDescriptionFromPrologue(chunks: string) {
    return new Promise((resolve, reject) => {
      this.httpService
        .post<any>(this.configService.get<string>('CHAT_API_URL'), {
          model: this.configService.get<string>('SMALL_TASK_LLM_MODEL'),
          messages: [
            {
              role: 'system',
              content: getJsonMetaGenerationPrompt,
            },
            {
              role: 'user',
              content: `Analyze the following text from the beginning of a document and generate the required JSON metadata:<TEXT>${chunks}</TEXT>`,
            },
          ],
          stream: false,
          format: 'json',
          temperature: 0.0,
          think: false,
        })
        .subscribe((res) => {
          resolve(res.data);
        });
    });
  }

  async chatFromSearchedDocs(query: string, docsXML: string) {
    return new Promise((resolve, reject) => {
      this.httpService
        .post<any>(this.configService.get<string>('CHAT_API_URL'), {
          model: this.configService.get<string>('LARGE_TASK_LLM_MODEL'),
          messages: [
            {
              role: 'system',
              content: getAnswerFromDocPrompt(docsXML),
            },
            {
              role: 'user',
              content: query,
            },
          ],
          stream: false,
          format: 'json',
          temperature: 0.0,
          think: false,
        })
        .subscribe((res) => {
          resolve(res.data);
        });
    });
  }
}

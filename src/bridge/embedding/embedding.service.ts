import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const categories = [
  'finance_and_commerce',
  'medical_and_health',
  'fitness_and_diet',
  'professional_and_career',
  'technology_and_hardware',
  'housing_and_utilities',
  'vehicles_and_transport',
  'education_and_research',
  'unknown_or_other',
];

const getJsonMetaGenerationPrompt = `
***

You are an expert data extraction and classification engine pipeline. Your task is to analyze the beginning of a document and generate highly accurate, structured JSON metadata.

Analyze the provided text and extract the following schema. Output strictly valid JSON and absolutely nothing else. Do not include markdown formatting, backticks, or conversational preamble.

Allowed Category ENUMs:

${categories.join(', ')}

Required JSON Schema:

JSON:-
{
  "categories": ["Must be an array of 1 or more strings selected STRICTLY from the Allowed Category ENUMs list"],
  "personalization_score": 0,
  "content_format": "paragraphs" | "tabular" | "both" | "unknown",
  "primary_subject": "A 1-2 sentence description of what the overall document is about.",
  "entities": {
    "nouns_of_interest": [
      {
        "noun": "The specific entity name (e.g., 'Dr. Suman', 'Airtel', 'AWS')",
        "context": "A 1-to-3 word description of their specific role in this document (e.g., 'Attending Physician', 'Telecom Provider', 'Cloud Host')"
      }
    ],
    "locations": ["List of specific places"],
    "dates_and_times": [
      {
        "date": "1990-03-25T12:42:31",
        "context": "Description of what this date represents"
      }
    ],
    "all_relevant_dates": ["List of all formatted date strings found"],
    "most_relevant_date": "The single most important document date for indexing",
    "organizations": ["Companies, institutions, or groups"]
  },
  "keywords": ["3 to 5 searchable tags"],
  "is_technical_or_academic": boolean
}

Personalization Score Logic (Scale 0-10):
Evaluate the intended audience and sensitivity of the data:

Score 10: Highly personal/private (e.g., Medical reports, personal bank statements, private letters).

Score 6-8: Professional or organizational with restricted audience (e.g., Internal company quarterly reports, project briefs, invoices).

Score 3-5: Semi-public/Niche (e.g., Specialized newsletters, local community notices).

Score 0: Public/General Knowledge (e.g., Wikipedia snippets, news articles, public manuals).

**CRITICAL: Strict Date Formatting Protocol:**
You must parse and convert ALL dates into strict ISO 8601 format: \`YYYY-MM-DDThh:mm:ss\`.
* **Example:** \`2024-01-02T09:15:00\`
* **Example:** \`1990-03-25T12:42:31\`
* If the original text lacks a specific time, you MUST default exactly to \`T00:00:00\`.
* Do not append timezone offsets (like 'Z' or '+05:30') unless explicitly stated in the text.

Extraction Rules:

Empty States: Return an empty array [] for missing entity types. Do not invent data.

Date Priority: For most_relevant_date, prioritize the primary timestamp (e.g., Transaction Date, Report Date).

Cross-Category: If a concept spans multiple categories, include multiple ENUMs in the array.`;

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

  async generateJSONBDescriptionFromPrologue(
    chunks: string,
    think: boolean = false,
  ) {
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

  /**
   * Calculates Dot Product for normalized vectors.
   * Since ||A|| and ||B|| are 1, this equals Cosine Similarity.
   */
  fastSimilarityBetweenUnitVectors(vecA: number[], vecB: number[]) {
    let score = 0;
    const len = vecA.length;

    for (let i = 0; i < len; i++) {
      score += vecA[i] * vecB[i];
    }

    return score;
  }
}

import { CATEGORIES } from '../../../constants';

export const generateMetaDataFromQueryPrompt = `You are the primary Intent Extraction and Context Resolution engine for a distributed file system. Your task is to analyze the user's latest query, consider the conversation history, and extract structured metadata to guide downstream retrieval nodes.

You will be given the current user's profile details for context resolution:
- User's Real Name: Harit Saxena

Analyze the input and output strictly valid JSON matching the schema below. Do not include markdown formatting, backticks, or conversational preamble.

### Allowed Category ENUMs:
[${CATEGORIES.join(', ')}]

### Noun Resolution Rules:
1. Implicit Self-Reference: If the user uses first-person pronouns ("my", "I", "me", "for myself") to reference data (e.g., "What's my glucose?"), map the target_noun strictly to "Harit Saxena".
2. Explicit Reference: If the query names someone else entirely (e.g., "What is Sakshi's glucose?"), map the target_noun to that specific name (e.g., "Sakshi").
3. No Entity: If the query is generalized or lacks any specific person/subject attachment, return null for target_noun.

### Required JSON Schema:
{
  "detected_category": "Must be exactly one string selected from the Allowed Category ENUMs list, or 'unknown_or_other'",
  "target_noun": "String resolving the name of interest based on the Noun Resolution Rules, or null",
  "is_search_required": true/false, // Set to false only for generic greetings or conversational filler that doesn't need file context
  "search_keywords": ["1 to 3 optimized keyword tags derived from the query to assist vector search optimization"]
}`;

export const getJsonMetaGenerationPrompt = `
***

You are an expert data extraction and classification engine pipeline. Your task is to analyze the beginning of a document and generate highly accurate, structured JSON metadata.

Analyze the provided text and extract the following schema. Output strictly valid JSON and absolutely nothing else. Do not include markdown formatting, backticks, or conversational preamble.

Allowed Category ENUMs:

${CATEGORIES.join(', ')}

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
  },
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

export const getAnswerFromDocPrompt = (
  xml,
) => `You are an expert analytical assistant. Answer the user's query using strictly the provided Documents.

${xml}

INSTRUCTIONS:
1. Document Isolation: Only associate a text chunk with the Context provided within the same <Document> tag.
2. Synthesis: Cross-reference across documents if the query requires it, but cite the source context accurately.
3. Fallback: If the answer is not in the <Documents> block, state it is missing.`;

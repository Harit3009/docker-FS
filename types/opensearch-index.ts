export interface OpensearchIndexableDocument {
  id: string;
  createdById: string;
  parentId?: string;
  text: string;
  embedding: number[];
  s3Key: string;
  mimeType: string;
  fileSystemPath: string;
  size: number;
  isDeleted?: boolean;
}

/**
 * Allowed categories for document classification
 */
export enum DocumentCategory {
  Finance = 'finance_and_commerce',
  Medical = 'medical_and_health',
  Fitness = 'fitness_and_diet',
  Career = 'professional_and_career',
  Technology = 'technology_and_hardware',
  Housing = 'housing_and_utilities',
  Transport = 'vehicles_and_transport',
  Education = 'education_and_research',
  Unknown = 'unknown_or_other',
}

/**
 * Represents the strict date format: "D MMMM YYYY HH:MM:SS AM/PM"
 * Example: "25 March 1990 12:42:31 PM"
 */
type FormattedDateString = string;

interface EntityDate {
  date: FormattedDateString;
  context: string;
}

export interface DocumentMetadata {
  id?: string;
  categories: DocumentCategory[];
  personalization_score: number;
  content_format: 'paragraphs' | 'tabular' | 'both' | 'unknown';
  primary_subject: string;
  entities: {
    nouns_of_interest: string[];
    locations: string[];
    dates_and_times: EntityDate[];
    all_relevant_dates: FormattedDateString[];
    most_relevant_date: FormattedDateString;
    organizations: string[];
  };
  keywords: string[];
  is_technical_or_academic: boolean;
  embedding?: number[];
  createdById: string;
}

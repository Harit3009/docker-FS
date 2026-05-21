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

export interface DocumentMetadata {
  id?: string;
  categories: string[];
  personalization_score: number;
  content_format: string;
  primary_subject: string;
  entities: Entities;
  locations: string[];
  dates_and_times: DatesAndTime[];
  all_relevant_dates: string[];
  most_relevant_date: string;
  organizations: string[];
  keywords: string[];
  is_technical_or_academic: boolean;
  embedding?: number[];
}

export interface Entities {
  nouns_of_interest: NounsOfInterest[];
}

export interface NounsOfInterest {
  noun: string;
  context: string;
}

export interface DatesAndTime {
  date: string;
  context: string;
}

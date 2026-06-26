export const PASSPORT_STRATEGIES = {
  INCOMING_JWT_VERIFICATION: 'INCOMING_JWT_VERIFICATION',
  GOOGLE_AUTH_TOKEN: 'GOOGLE_AUTH_TOKEN',
} as const;

export const KAFKA_TOPIC_NAMES = {
  FOLDER_ZIP_UPLOADED: 'Topic.Kafka.Folder_Zip_uploaded',
  FILE_UPLOADED: 'Topic.Kafka.file-uploaded',
  MARK_CHILDREN_FOR_DELETION: 'Topic.Kafka.mark-children-for-delete',
  MARK_CHILDEREN_FOR_DELETE_DLQ: 'Topic.Kafka.mark-children-for-deletion-dlq',
  VECTOR_INDEXING_DLQ: 'Topic.Kafka.vector-indexing-dlq',
} as const;

export const KAFKA_CONSUMER_NAMES = {
  MARK_CHILDREN_FOR_DELETE_CONSUMER:
    'Consumer.Topic.mark-children-for-delete.message.mark_children_for_delete_consumer',
  MAKE_DB_RECORD_CONSUMER:
    'Consumer.Topic.file-uploaded.message.db-record-create-consumers',
  VECTOR_INDEXING_CONSUMER:
    'Consumer.Topic.file-uploaded.message.vector-index-consumer',
  MARK_CHILDREN_FOR_DELETE_IN_OSS_CONSUMER:
    'Consumer.Topic.mark-children-for-delete.message.mark_children_for_delete_in_OSS_consumer',
} as const;

export const CATEGORIES = [
  'finance_and_commerce',
  'medical_and_health',
  'fitness_and_diet',
  'professional_and_career',
  'technology_and_hardware',
  'housing_and_utilities',
  'vehicles_and_transport',
  'education_and_research',
  'unknown_or_other',
] as const;

export const PASSPORT_STRATEGIES = {
  INCOMING_JWT_VERIFICATION: 'INCOMING_JWT_VERIFICATION',
  GOOGLE_AUTH_TOKEN: 'GOOGLE_AUTH_TOKEN',
} as const;

export const KAFKA_TOPIC_NAMES = {
  FOLDER_ZIP_UPLOADED: 'folder-zip-uploaded',
  FILE_UPLOADED: 'file-uploaded',
  MARK_CHILDREN_FOR_DELETION: 'mark-children-for-delete-topic',
  MARK_CHILDEREN_FOR_DELETE_DLQ: 'mark-children-for-deletion-dlq',
};

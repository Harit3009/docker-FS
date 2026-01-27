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

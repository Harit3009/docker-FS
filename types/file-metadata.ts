export interface S3FileMetaData {
  createdbyemail: string;
  createdbyid: string;
  fileid: string;
  filesystempath: string;
  parentid: string;
  overwrite: 'true' | 'false';
  isZippedFolder: 'true' | 'false';
}

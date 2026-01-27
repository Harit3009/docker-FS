import { Readable } from 'stream';

export interface UnzipEntry extends Readable {
  path: string; // e.g. "my-folder/image.png"
  type: 'Directory' | 'File';
  vars: {
    uncompressedSize: number; // Size in bytes
    compressedSize: number;
    lastModifiedTime: Date;
  };
  extra: any;
  autodrain: () => void; // Call this to skip the entry
}

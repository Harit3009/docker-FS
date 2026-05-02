/*
  Warnings:

  - The primary key for the `FileMetadata` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Added the required column `chunkIndex` to the `FileMetadata` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "FileMetadata" DROP CONSTRAINT "FileMetadata_pkey",
ADD COLUMN     "chunkIndex" INTEGER NOT NULL,
ADD CONSTRAINT "FileMetadata_pkey" PRIMARY KEY ("fileId", "chunkIndex");

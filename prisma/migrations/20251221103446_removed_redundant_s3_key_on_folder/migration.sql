/*
  Warnings:

  - You are about to drop the column `s3Key` on the `Folder` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Folder_s3Key_key";

-- AlterTable
ALTER TABLE "Folder" DROP COLUMN "s3Key";

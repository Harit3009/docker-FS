/*
  Warnings:

  - A unique constraint covering the columns `[createdById,fileSystemPath,isDeleted]` on the table `File` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[createdById,fileSystemPath,isDeleted]` on the table `Folder` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "File_createdById_fileSystemPath_key";

-- DropIndex
DROP INDEX "Folder_createdById_fileSystemPath_key";

-- CreateIndex
CREATE UNIQUE INDEX "File_createdById_fileSystemPath_isDeleted_key" ON "File"("createdById", "fileSystemPath", "isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "Folder_createdById_fileSystemPath_isDeleted_key" ON "Folder"("createdById", "fileSystemPath", "isDeleted");

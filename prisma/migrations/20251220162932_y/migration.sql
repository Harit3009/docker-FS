-- DropIndex
DROP INDEX "File_createdById_fileSystemPath_isDeleted_key";

-- DropIndex
DROP INDEX "Folder_createdById_fileSystemPath_isDeleted_key";

-- CreateIndex
CREATE INDEX "File_createdById_fileSystemPath_idx" ON "File"("createdById", "fileSystemPath");

-- CreateIndex
CREATE INDEX "Folder_createdById_fileSystemPath_idx" ON "Folder"("createdById", "fileSystemPath");

-- CreateTable
CREATE TABLE "FileMetadata" (
    "fileId" TEXT NOT NULL,
    "technicalMetadata" JSONB NOT NULL DEFAULT '{}',
    "semanticMetadata" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileMetadata_pkey" PRIMARY KEY ("fileId")
);

-- CreateIndex
CREATE INDEX "FileMetadata_semanticMetadata_idx" ON "FileMetadata" USING GIN ("semanticMetadata");

-- AddForeignKey
ALTER TABLE "FileMetadata" ADD CONSTRAINT "FileMetadata_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

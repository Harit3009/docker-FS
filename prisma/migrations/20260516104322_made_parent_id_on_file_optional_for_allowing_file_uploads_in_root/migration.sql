-- DropForeignKey
ALTER TABLE "File" DROP CONSTRAINT "File_parentId_fkey";

-- AlterTable
ALTER TABLE "File" ALTER COLUMN "parentId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

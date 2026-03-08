-- AlterEnum
ALTER TYPE "GROUP_ROLE" ADD VALUE 'INVITED';

-- CreateIndex
CREATE INDEX "GroupFile_groupId_idx" ON "GroupFile"("groupId");

-- CreateIndex
CREATE INDEX "GroupFolder_groupId_idx" ON "GroupFolder"("groupId");

-- CreateIndex
CREATE INDEX "GroupMember_groupId_idx" ON "GroupMember"("groupId");

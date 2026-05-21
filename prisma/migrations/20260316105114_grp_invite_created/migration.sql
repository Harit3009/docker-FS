/*
  Warnings:

  - The values [INVITED] on the enum `GROUP_ROLE` will be removed. If these variants are still used in the database, this will fail.
  - Added the required column `invitedById` to the `GroupMember` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `GroupMember` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status_remark` to the `GroupMember` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "GROUP_MEMBER_STATUS" AS ENUM ('INVITED', 'BLOCKED_BY_INVITEE', 'BLOCKED_BY_MEMBER', 'BLOCKED_BY_ADMIN', 'BLOCKED_BY_OWNER', 'ACCEPTED', 'REJECTED');

-- AlterEnum
BEGIN;
CREATE TYPE "GROUP_ROLE_new" AS ENUM ('MEMBER', 'ADMIN', 'OWNER');
ALTER TABLE "GroupMember" ALTER COLUMN "role" TYPE "GROUP_ROLE_new" USING ("role"::text::"GROUP_ROLE_new");
ALTER TYPE "GROUP_ROLE" RENAME TO "GROUP_ROLE_old";
ALTER TYPE "GROUP_ROLE_new" RENAME TO "GROUP_ROLE";
DROP TYPE "public"."GROUP_ROLE_old";
COMMIT;

-- AlterTable
ALTER TABLE "GroupMember" ADD COLUMN     "invitedById" TEXT NOT NULL,
ADD COLUMN     "status" "GROUP_MEMBER_STATUS" NOT NULL,
ADD COLUMN     "status_remark" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

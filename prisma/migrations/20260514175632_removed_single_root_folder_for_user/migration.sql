/*
  Warnings:

  - You are about to drop the column `rootFolderId` on the `User` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_rootFolderId_fkey";

-- DropIndex
DROP INDEX "User_rootFolderId_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "rootFolderId";

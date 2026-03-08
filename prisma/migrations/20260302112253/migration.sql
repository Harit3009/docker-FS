/*
  Warnings:

  - A unique constraint covering the columns `[ownerId,name]` on the table `Group` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Group_ownerId_name_key" ON "Group"("ownerId", "name");

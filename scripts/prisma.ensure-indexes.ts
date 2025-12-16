import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { Pool } from 'pg';

config();

type IndexObject = { name: string; description: string; command: string };

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({ adapter });

const partialIndexes: IndexObject[] = [
  {
    name: 'partial-index-on-delete-for-trash',
    description: `A partial index for querying isDeleted record`,
    command: `
  Create index concurrently "partial-index-on-delete-for-trash"  on "File" ("deletedAt","id") where "isDeleted" = True`,
  },
];

async function checkAndCreateIndexes(index: IndexObject) {
  const results = await prisma.$queryRaw<
    any[]
  >`Select * from pg_indexes where indexname = ${index.name}`;

  if (results.length) {
    console.log(results[0]);
    return;
  }

  await prisma.$executeRawUnsafe(index.command);
  console.log('partial index >>>', index.command);
}

async function ensureIndexes() {
  await prisma.$connect();
  const promises = partialIndexes.map((e) => checkAndCreateIndexes(e));
  await Promise.all(promises);
}

ensureIndexes()
  .then(() => {
    console.log('All Indexes created');
    prisma.$disconnect();
  })
  .catch((err) => {
    console.log(err?.stack);
    console.error('an error occured');
  })
  .finally(() => {
    process.exit();
  });

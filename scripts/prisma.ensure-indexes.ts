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
  // 1. TRASH INDEX (Sorting/Searching deleted items)
  {
    name: 'partial_index_file_trash', // Keep names simple and snake_case for PG
    description: `A partial index for querying isDeleted record`,
    // Note: Added UNIQUE is optional here, usually trash doesn't need to be unique
    command: `
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "partial_index_file_trash" 
      ON "File" ("deletedAt", "id") 
      WHERE "isDeleted" = true
    `,
  },

  // 2. FILE UNIQUENESS (Active Files Only)
  {
    name: 'partial_unique_file_active_path',
    description: `Enforce unique path for active files`,
    // FIX: Added 'UNIQUE' and matched the index name to the 'name' property
    command: `
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "partial_unique_file_active_path" 
      ON "File" ("createdById", "fileSystemPath") 
      WHERE "isDeleted" = false
    `,
  },

  // 3. FOLDER UNIQUENESS (Active Folders Only)
  {
    name: 'partial_unique_folder_active_path',
    description: `Enforce unique path for active folders`,
    // FIX: Unique name distinct from File
    command: `
      CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "partial_unique_folder_active_path" 
      ON "Folder" ("createdById", "fileSystemPath","id") 
      WHERE "isDeleted" = false
    `,
  },
  // 4. updatedAt index for traversal via parentId (Folder)
  {
    name: 'pi_parentid_updatedat_folder',
    description: '',
    command: `CREATE INDEX CONCURRENTLY pi_parentid_updatedat_folder 
    ON "Folder" ("createdById","parentId","updatedAt" DESC,"id")
    WHERE "isDeleted" = false;`,
  },

  // 4. updatedAt index for traversal via parentId (File)
  {
    name: 'pi_parentid_updatedat_file',
    description: '',
    command: `CREATE INDEX CONCURRENTLY pi_parentid_updatedat_file 
    ON "File" ("createdById","parentId","updatedAt" DESC,"id")
    WHERE "isDeleted" = false;`,
  },

  // 5. root folder performance updatedAt index (Folder)
  {
    name: 'pi_root_folder_perf_updatedat_folder',
    description: 'Index for root folder performance',
    command: `CREATE INDEX CONCURRENTLY pi_root_folder_perf_updatedat_folder 
    ON "Folder" ("createdById", "updatedAt" DESC, "id" ASC) 
    WHERE "parentId" IS NULL AND "isDeleted" = false;`,
  },

  // 6. root folder performance updatedAt index (File)
  {
    name: 'pi_root_folder_perf_updatedat_file',
    description: 'Index for root folder performance',
    command: `CREATE INDEX CONCURRENTLY pi_root_folder_perf_updatedat_file 
    ON "File" ("createdById", "updatedAt" DESC, "id" ASC) 
    WHERE "parentId" IS NULL AND "isDeleted" = false;`,
  },
  // 7. size index for traversal via parentId (Folder)
  {
    name: 'pi_parentid_size_folder',
    description: '',
    command: `CREATE INDEX CONCURRENTLY pi_parentid_size_folder 
    ON "Folder" ("createdById","parentId","size" DESC,"id")
    WHERE "isDeleted" = false;`,
  },

  // 8. size index for traversal via parentId (File)
  {
    name: 'pi_parentid_size_file',
    description: '',
    command: `CREATE INDEX CONCURRENTLY pi_parentid_size_file 
    ON "File" ("createdById","parentId","size" DESC,"id")
    WHERE "isDeleted" = false;`,
  },

  // 9. root folder performance size index (Folder)
  {
    name: 'pi_root_folder_perf_size_folder',
    description: 'Index for root folder performance',
    command: `CREATE INDEX CONCURRENTLY pi_root_folder_perf_size_folder 
    ON "Folder" ("createdById", "size" DESC, "id" ASC) 
    WHERE "parentId" IS NULL AND "isDeleted" = false;`,
  },

  // 10. root folder performance size index (File)
  {
    name: 'pi_root_folder_perf_size_file',
    description: 'Index for root folder performance',
    command: `CREATE INDEX CONCURRENTLY pi_root_folder_perf_size_file 
    ON "File" ("createdById", "size" DESC, "id" ASC) 
    WHERE "parentId" IS NULL AND "isDeleted" = false;`,
  },
];

async function checkAndCreateIndexes(index: IndexObject) {
  // 1. Check if index exists by name
  const results = await prisma.$queryRaw<any[]>`
    SELECT * FROM pg_indexes WHERE indexname = ${index.name}
  `;

  if (results.length > 0) {
    console.log(`✅ Index already exists: ${index.name}`);
    return;
  }

  console.log(`⏳ Creating index: ${index.name}...`);
  try {
    // 2. Create it
    await prisma.$executeRawUnsafe(index.command);
    console.log(`🎉 Created index: ${index.name}`);
  } catch (err: any) {
    // Handle "Concurrent" limitations or invalid states
    console.error(`❌ Failed to create ${index.name}:`, err.message);
  }
}

async function ensureIndexes() {
  await prisma.$connect();
  console.log('Starting Index Verification...');

  // Run sequentially to prevent DB connection pool exhaustion or locking contention
  for (const index of partialIndexes) {
    await checkAndCreateIndexes(index);
  }
}

ensureIndexes()
  .then(() => {
    console.log('All Index operations completed.');
    return prisma.$disconnect();
  })
  .catch((err) => {
    console.error('Fatal Error:', err);
    process.exit(1);
  });

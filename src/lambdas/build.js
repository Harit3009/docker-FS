import * as esbuild from 'esbuild';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

// 1. Reconstruct __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// FIX: Safely resolve the .env file path relative to this script's location
// Since script is in src/lambdas/, the root is two folders up
const envPath = path.join(__dirname, '..', '..', '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const defineVariables = {};
for (const key in envConfig) {
  console.log(`Injecting ENV: ${key}`);
  defineVariables[`process.env.${key}`] = JSON.stringify(envConfig[key]);
}

const buildPath = path.join(__dirname, 's3_event_trigger.ts');
const distDir = path.join(__dirname, '..', '..', 'lambda-dist'); // Ensure this matches your mounted folder
const outFilePath = path.join(distDir, 'index.js');
const zipFilePath = path.join(distDir, 'function.zip');

// 2. Create the Auto-Deploy Plugin
const autoDeployPlugin = {
  name: 'auto-deploy',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) return;

      try {
        console.log('\n[1/3] Build successful. Zipping...');
        const zip = new AdmZip();
        zip.addLocalFile(outFilePath);
        zip.writeZip(zipFilePath);

        console.log('[2/3] Pushing code to LocalStack...');
        execSync(
          `aws --endpoint-url=http://localhost:4566 --region us-east-1 lambda update-function-code --function-name s3-event-handler --zip-file fileb://${zipFilePath}`,
        );

        console.log('[3/3] ✅ Hot-reload complete! Waiting for changes...');
      } catch (error) {
        console.error(
          '❌ Auto-deploy failed:',
          error.stdout?.toString() || error.message,
        );
      }
    });
  },
};

// 3. Start Watch Mode
async function watch() {
  const ctx = await esbuild.context({
    entryPoints: [buildPath],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: outFilePath,
    plugins: [autoDeployPlugin],
    define: defineVariables, // 🚀 Variables safely injected here
  });

  console.log('🚀 Watching for changes and auto-deploying...');
  await ctx.watch();
}

watch().catch(() => process.exit(1));

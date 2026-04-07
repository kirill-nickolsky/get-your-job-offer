import fs from 'node:fs/promises';
import path from 'node:path';
import { sourceConfigsCollection } from '../src/firestore';

async function loadSeeds(): Promise<Array<Record<string, unknown>>> {
  const argPath = process.argv[2];
  const filePath = argPath
    ? path.resolve(process.cwd(), argPath)
    : path.resolve(process.cwd(), 'scripts/source-configs.sample.json');
  const text = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error('Seed file must contain an array: ' + filePath);
  }
  return parsed;
}

async function main(): Promise<void> {
  const seeds = await loadSeeds();
  for (let i = 0; i < seeds.length; i++) {
    const seed = seeds[i];
    const sourceId = String(seed.source_id || '').trim();
    if (!sourceId) {
      throw new Error('source_id is required in seed entry #' + (i + 1));
    }
    await sourceConfigsCollection().doc(sourceId).set(seed, { merge: true });
    console.log('Seeded source_config:', sourceId);
  }
}

main().catch(function(error) {
  console.error(error);
  process.exit(1);
});

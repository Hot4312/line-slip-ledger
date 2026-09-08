import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const dataDir = path.resolve('data');
const dataFile = path.join(dataDir, 'slips.json');
let queue = Promise.resolve();

async function readAll() {
  try { return JSON.parse(await readFile(dataFile, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

async function writeAll(items) {
  await mkdir(dataDir, { recursive: true });
  const tmp = `${dataFile}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(items, null, 2));
  await rename(tmp, dataFile);
}

export function transact(fn) {
  const operation = queue.then(async () => {
    const items = await readAll();
    const result = await fn(items);
    await writeAll(items);
    return result;
  });
  queue = operation.catch(() => {});
  return operation;
}

export const listSlips = () => queue.then(readAll);


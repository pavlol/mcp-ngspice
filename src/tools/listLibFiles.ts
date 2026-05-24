import { promises as fs } from "fs";
import path from "path";
import { MODELS_DIR } from "../utils/libResolver.js";

export interface LibFileEntry {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface ListLibFilesOutput {
  modelsDir: string;
  count: number;
  files: LibFileEntry[];
}

export async function listLibFiles(): Promise<ListLibFilesOutput> {
  await fs.mkdir(MODELS_DIR, { recursive: true });

  let entries: string[];
  try {
    entries = await fs.readdir(MODELS_DIR);
  } catch {
    entries = [];
  }

  const libEntries = entries.filter((f) => f.toLowerCase().endsWith(".lib"));

  const files = await Promise.all(
    libEntries.map(async (name): Promise<LibFileEntry> => {
      const stat = await fs.stat(path.join(MODELS_DIR, name));
      return {
        name,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    })
  );

  files.sort((a, b) => a.name.localeCompare(b.name));

  return { modelsDir: MODELS_DIR, count: files.length, files };
}

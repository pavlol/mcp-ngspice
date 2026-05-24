import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const PROJECT_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
export const MODELS_DIR = path.join(PROJECT_ROOT, "models");

/**
 * Rewrite relative .lib / .include paths in a netlist to absolute paths
 * when the file is found in the models/ directory.
 *
 * Handles both forms:
 *   .lib filename.lib [modelname]
 *   .include "filename.lib"
 *   .include filename.lib
 */
export async function resolveLibPaths(netlist: string): Promise<string> {
  await fs.mkdir(MODELS_DIR, { recursive: true });

  const lines = netlist.split("\n");
  const resolved: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // .lib <file> [modelname]  — ngspice only supports .include; rewrite to that
    const libMatch = trimmed.match(/^\.lib\s+("?)([^"\s]+)\1(.*)/i);
    if (libMatch) {
      const [, , rawPath] = libMatch;
      const abs = await resolveToAbsolute(rawPath);
      // Rewrite to .include regardless — ngspice does not support .lib
      const target = abs ?? rawPath;
      resolved.push(`.include "${target}"`);
      continue;
    }

    // .include "<file>" or .include <file>
    const incMatch = trimmed.match(/^\.include\s+("?)([^"\s]+)\1/i);
    if (incMatch) {
      const [, , rawPath] = incMatch;
      const abs = await resolveToAbsolute(rawPath);
      resolved.push(abs ? `.include "${abs}"` : line);
      continue;
    }

    resolved.push(line);
  }

  return resolved.join("\n");
}

async function resolveToAbsolute(rawPath: string): Promise<string | null> {
  // Already absolute — nothing to do
  if (path.isAbsolute(rawPath)) return null;

  const candidate = path.join(MODELS_DIR, path.basename(rawPath));
  try {
    await fs.access(candidate);
    return candidate;
  } catch {
    return null;
  }
}

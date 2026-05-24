import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";

// ──────────────────────────────────────────────────────────────
// Schema
// ──────────────────────────────────────────────────────────────

export const ListSimulationsSchema = z.object({
  limit: z
    .number().int().min(1).max(500).default(20)
    .describe("Max simulations to return (default 20)"),
  sort: z
    .enum(["newest", "oldest"]).default("newest")
    .describe("Sort order by run timestamp"),
  filter: z
    .enum(["all", "success", "failed"]).default("all")
    .describe("Filter by outcome"),
});

export type ListSimulationsInput = z.infer<typeof ListSimulationsSchema>;

// ──────────────────────────────────────────────────────────────
// Output types
// ──────────────────────────────────────────────────────────────

export interface SimulationEntry {
  id: string;
  /** ISO 8601 timestamp derived from .log file mtime */
  timestamp: string;
  /** First line of the .cir netlist */
  title: string;
  /** Inferred from the .cir analysis command */
  analysisType: "tran" | "ac" | "dc" | "op" | "unknown";
  success: boolean;
  /** Number of signal variables (columns) */
  variables: number | null;
  /** Number of time/frequency data points (rows) */
  dataRows: number | null;
  /** Reported ngspice CPU time in seconds */
  durationSeconds: number | null;
  rawSizeBytes: number | null;
}

export interface ListSimulationsOutput {
  /** Total simulations found on disk matching the filter */
  total: number;
  /** Number actually returned (≤ limit) */
  returned: number;
  simulations: SimulationEntry[];
}

// ──────────────────────────────────────────────────────────────
// Main function
// ──────────────────────────────────────────────────────────────

const CIRCUITS_DIR = path.resolve("circuits");
const RESULTS_DIR  = path.resolve("results");

export async function listSimulations(
  rawInput: ListSimulationsInput
): Promise<ListSimulationsOutput> {
  // Apply Zod defaults so the function behaves correctly when called directly
  const input = ListSimulationsSchema.parse(rawInput);

  // 1. Find all UUIDs that have a .log file
  let logFiles: string[];
  try {
    const entries = await fs.readdir(RESULTS_DIR);
    logFiles = entries.filter((f) => f.endsWith(".log"));
  } catch {
    return { total: 0, returned: 0, simulations: [] };
  }

  // 2. Stat every .log file to get mtime — do it in parallel
  const statted = await Promise.all(
    logFiles.map(async (filename) => {
      const id = filename.slice(0, -4); // strip .log
      const logPath = path.join(RESULTS_DIR, filename);
      try {
        const stat = await fs.stat(logPath);
        return { id, logPath, mtime: stat.mtime };
      } catch {
        return null;
      }
    })
  );

  // 3. Sort by mtime
  const valid = statted
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) =>
      input.sort === "newest"
        ? b.mtime.getTime() - a.mtime.getTime()
        : a.mtime.getTime() - b.mtime.getTime()
    );

  // 4. Read detail files for ALL candidates so we can produce an accurate total count.
  //    Parallel I/O keeps this fast even for hundreds of simulations.
  const entries = await Promise.all(
    valid.map(({ id, logPath, mtime }) => buildEntry(id, logPath, mtime))
  );

  // 5. Apply success/failed filter to the full set
  const filtered =
    input.filter === "all"
      ? entries
      : entries.filter((e) =>
          input.filter === "success" ? e.success : !e.success
        );

  // 6. Slice to the requested limit
  const simulations = filtered.slice(0, input.limit);

  return {
    total: filtered.length,
    returned: simulations.length,
    simulations,
  };
}

// ──────────────────────────────────────────────────────────────
// Per-simulation detail builder
// ──────────────────────────────────────────────────────────────

async function buildEntry(
  id: string,
  logPath: string,
  mtime: Date
): Promise<SimulationEntry> {
  const cirPath = path.join(CIRCUITS_DIR, `${id}.cir`);
  const rawPath = path.join(RESULTS_DIR, `${id}.raw`);

  const [logText, cirText, rawStat] = await Promise.all([
    readSafe(logPath),
    readSafe(cirPath),
    statSafe(rawPath),
  ]);

  const { title, analysisType } = parseNetlist(cirText);
  const { success, variables, dataRows, durationSeconds } = parseLog(logText);

  return {
    id,
    timestamp: mtime.toISOString(),
    title,
    analysisType,
    success,
    variables,
    dataRows,
    durationSeconds,
    rawSizeBytes: rawStat?.size ?? null,
  };
}

// ──────────────────────────────────────────────────────────────
// Netlist parser — extract title and analysis type
// ──────────────────────────────────────────────────────────────

function parseNetlist(content: string): {
  title: string;
  analysisType: SimulationEntry["analysisType"];
} {
  if (!content) return { title: "(netlist unavailable)", analysisType: "unknown" };

  const lines = content.split("\n").map((l) => l.trim());
  const title = lines[0] ?? "(untitled)";

  let analysisType: SimulationEntry["analysisType"] = "unknown";
  for (const line of lines) {
    const l = line.toLowerCase();
    if (/^\.tran\b/.test(l)) { analysisType = "tran"; break; }
    if (/^\.ac\b/.test(l))   { analysisType = "ac";   break; }
    if (/^\.dc\b/.test(l))   { analysisType = "dc";   break; }
    if (/^\.op\b/.test(l))   { analysisType = "op";   break; }
  }

  return { title, analysisType };
}

// ──────────────────────────────────────────────────────────────
// Log parser — extract outcome metrics
// ──────────────────────────────────────────────────────────────

function parseLog(content: string): {
  success: boolean;
  variables: number | null;
  dataRows: number | null;
  durationSeconds: number | null;
} {
  if (!content) {
    return { success: false, variables: null, dataRows: null, durationSeconds: null };
  }

  const success =
    content.includes("Total analysis time") &&
    !content.includes("Simulation interrupted due to error");

  const colsMatch   = content.match(/No\. of Data Columns\s*:\s*(\d+)/);
  const rowsMatch   = content.match(/No\. of Data Rows\s*:\s*(\d+)/);
  const durMatch    = content.match(/Total analysis time \(seconds\)\s*=\s*([\d.]+)/);

  return {
    success,
    variables:       colsMatch  ? parseInt(colsMatch[1],  10) : null,
    dataRows:        rowsMatch  ? parseInt(rowsMatch[1],  10) : null,
    durationSeconds: durMatch   ? parseFloat(durMatch[1])     : null,
  };
}

// ──────────────────────────────────────────────────────────────
// File helpers
// ──────────────────────────────────────────────────────────────

async function readSafe(filePath: string): Promise<string> {
  try { return await fs.readFile(filePath, "utf8"); }
  catch { return ""; }
}

async function statSafe(filePath: string): Promise<{ size: number } | null> {
  try { return await fs.stat(filePath); }
  catch { return null; }
}

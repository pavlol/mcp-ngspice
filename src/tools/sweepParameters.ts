import { z } from "zod";
import { runNgspice } from "../utils/ngspice.js";
import { validateNetlist } from "../utils/validation.js";
import { parseLog } from "../parsers/logParser.js";
import { parseRawFile, summarizePlot, VariableSummary } from "../parsers/rawParser.js";

// ──────────────────────────────────────────────────────────────
// Schema
// ──────────────────────────────────────────────────────────────

export const SweepParametersSchema = z.object({
  netlist: z.string().describe(
    "Base netlist containing a placeholder token (e.g. {RVAL}) that will be replaced with each sweep value. " +
    "Use {TOKEN} syntax in the netlist, pass the bare name as 'token'."
  ),
  token: z
    .string()
    .min(1)
    .describe(
      "Placeholder name in the netlist (without braces). E.g. token='RVAL' matches '{RVAL}' in the netlist."
    ),
  start: z.number().describe("First parameter value"),
  stop: z.number().describe("Last parameter value"),
  steps: z
    .number()
    .int()
    .min(2)
    .max(200)
    .describe("Number of steps from start to stop, inclusive (min 2, max 200)"),
  scale: z
    .enum(["linear", "log"])
    .default("linear")
    .describe("'linear': evenly spaced values; 'log': evenly spaced on a log10 scale"),
  timeout_per_run: z
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .default(15_000)
    .describe("Timeout per individual simulation in ms (default 15 000)"),
  max_concurrent: z
    .number()
    .int()
    .min(1)
    .max(8)
    .default(3)
    .describe("Max simultaneous ngspice processes (default 3)"),
});

export type SweepParametersInput = z.infer<typeof SweepParametersSchema>;

// ──────────────────────────────────────────────────────────────
// Output types
// ──────────────────────────────────────────────────────────────

export interface SweepRun {
  paramValue: number;
  simulationId: string;
  success: boolean;
  errors: string[];
  warnings: string[];
  /** Per-variable summary for the first plot in this run */
  summary: VariableSummary[];
}

export interface SweepTable {
  /** Parameter value for each successful run (in sweep order) */
  param: number[];
  /** For each circuit variable: its min / max / last value at each sweep point */
  variables: Record<string, { min: number[]; max: number[]; last: number[] }>;
}

export interface SweepParametersOutput {
  token: string;
  scale: "linear" | "log";
  paramValues: number[];
  successCount: number;
  failCount: number;
  runs: SweepRun[];
  /** Cross-run summary table — param axis + per-variable columns */
  table: SweepTable;
}

// ──────────────────────────────────────────────────────────────
// Main function
// ──────────────────────────────────────────────────────────────

export async function sweepParameters(
  input: SweepParametersInput
): Promise<SweepParametersOutput> {
  // Strip braces if the caller included them
  const token = input.token.replace(/^\{|\}$/g, "");
  const placeholder = `{${token}}`;

  if (!input.netlist.includes(placeholder)) {
    throw new Error(
      `Token '${placeholder}' not found in the netlist. ` +
      `Make sure the netlist contains '${placeholder}' where the parameter value should be substituted.`
    );
  }

  const paramValues = generateValues(input.start, input.stop, input.steps, input.scale);

  // Validate using the first substituted netlist to catch structural issues early
  const firstNetlist = substitute(input.netlist, placeholder, paramValues[0]);
  const validation = validateNetlist(firstNetlist);
  if (!validation.valid) {
    throw new Error(`Invalid netlist (checked with ${token}=${paramValues[0]}):\n${validation.errors.join("\n")}`);
  }

  // Build per-value tasks
  const tasks = paramValues.map(
    (value) => () => runOneSweepPoint(input.netlist, placeholder, value, input.timeout_per_run)
  );

  // Execute with bounded concurrency
  const runs = await runConcurrent(tasks, input.max_concurrent);

  // Build cross-run table
  const table = buildTable(runs);

  const successCount = runs.filter((r) => r.success).length;

  return {
    token,
    scale: input.scale,
    paramValues,
    successCount,
    failCount: runs.length - successCount,
    runs,
    table,
  };
}

// ──────────────────────────────────────────────────────────────
// Per-point simulation
// ──────────────────────────────────────────────────────────────

async function runOneSweepPoint(
  baseNetlist: string,
  placeholder: string,
  value: number,
  timeoutMs: number
): Promise<SweepRun> {
  const netlist = substitute(baseNetlist, placeholder, value);
  const result = await runNgspice(netlist, timeoutMs);
  const logParsed = parseLog(result.logOutput);

  let summary: VariableSummary[] = [];
  if (result.success) {
    try {
      const plots = await parseRawFile(result.rawPath);
      if (plots[0]) summary = summarizePlot(plots[0]);
    } catch {
      // Raw file missing or unreadable — leave summary empty
    }
  }

  return {
    paramValue: value,
    simulationId: result.id,
    success: result.success,
    errors: result.success
      ? logParsed.errors
      : [...logParsed.errors, result.error ?? ""].filter(Boolean),
    warnings: logParsed.warnings,
    summary,
  };
}

// ──────────────────────────────────────────────────────────────
// Cross-run table
// ──────────────────────────────────────────────────────────────

function buildTable(runs: SweepRun[]): SweepTable {
  const successful = runs.filter((r) => r.success);

  // Collect all variable names (preserve order from first successful run)
  const varNames: string[] = [];
  const seen = new Set<string>();
  for (const run of successful) {
    for (const s of run.summary) {
      if (!seen.has(s.name)) { varNames.push(s.name); seen.add(s.name); }
    }
  }

  const variables: SweepTable["variables"] = {};
  for (const name of varNames) {
    variables[name] = {
      min:  successful.map((r) => r.summary.find((s) => s.name === name)?.min  ?? NaN),
      max:  successful.map((r) => r.summary.find((s) => s.name === name)?.max  ?? NaN),
      last: successful.map((r) => r.summary.find((s) => s.name === name)?.last ?? NaN),
    };
  }

  return {
    param: successful.map((r) => r.paramValue),
    variables,
  };
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

/** Generate sweep values on a linear or log scale. */
function generateValues(
  start: number,
  stop: number,
  steps: number,
  scale: "linear" | "log"
): number[] {
  if (steps === 1) return [start];

  if (scale === "log") {
    if (start <= 0 || stop <= 0) {
      throw new Error("Log scale requires start and stop to be positive numbers");
    }
    const logStart = Math.log10(start);
    const logStop  = Math.log10(stop);
    return Array.from({ length: steps }, (_, i) => {
      const t = i / (steps - 1);
      return Math.pow(10, logStart + t * (logStop - logStart));
    });
  }

  return Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1);
    return start + t * (stop - start);
  });
}

/** Replace every occurrence of placeholder with the formatted value. */
function substitute(netlist: string, placeholder: string, value: number): string {
  // Use a format that SPICE parses cleanly: avoid unnecessary scientific notation for
  // "human-sized" numbers, use it for very large/small ones.
  const formatted =
    Math.abs(value) === 0
      ? "0"
      : Math.abs(value) >= 0.001 && Math.abs(value) < 1e7
        ? String(+value.toPrecision(8))   // drop trailing zeros
        : value.toExponential(6);

  // Escape regex metacharacters in the placeholder
  const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return netlist.replace(new RegExp(escaped, "g"), formatted);
}

/** Run an array of async tasks with at most `concurrency` running at once. */
async function runConcurrent<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const idx = next++;
      results[idx] = await tasks[idx]();
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

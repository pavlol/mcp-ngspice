import { z } from "zod";
import path from "path";
import { fileURLToPath } from "url";
import { parseRawFile, summarizePlot, RawPlot } from "../parsers/rawParser.js";

export const ParseResultsSchema = z.object({
  simulation_id: z.string().uuid().describe("Simulation ID returned by run_simulation"),
  include_data: z
    .boolean()
    .default(true)
    .describe("Include full time/frequency series in the response (default true). Set false for summary only."),
  max_points: z
    .number()
    .int()
    .min(10)
    .max(100_000)
    .optional()
    .describe("Downsample each series to at most this many points (evenly spaced). Omit for all points."),
});

export type ParseResultsInput = z.infer<typeof ParseResultsSchema>;

export interface ParseResultsOutput {
  simulationId: string;
  plots: ParsedPlotOutput[];
}

interface ParsedPlotOutput {
  plotname: string;
  analysisType: string;
  format: string;
  pointCount: number;
  variables: Array<{ name: string; type: string }>;
  summary: Array<{ name: string; type: string; min: number; max: number; first: number; last: number }>;
  data?: Record<string, number[]>;
  ac?: Record<string, { magnitudeDb: number[]; phase: number[] }>;
}

const PROJECT_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const RESULTS_DIR = path.join(PROJECT_ROOT, "results");

export async function parseResults(input: ParseResultsInput): Promise<ParseResultsOutput> {
  const rawPath = path.join(RESULTS_DIR, `${input.simulation_id}.raw`);

  let plots: RawPlot[];
  try {
    plots = await parseRawFile(rawPath);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse raw file for simulation ${input.simulation_id}: ${msg}`);
  }

  if (plots.length === 0) {
    throw new Error(`Raw file for simulation ${input.simulation_id} contained no plot data`);
  }

  const outputPlots: ParsedPlotOutput[] = plots.map((plot) => {
    const summary = summarizePlot(plot);

    let data: Record<string, number[]> | undefined;
    let ac: Record<string, { magnitudeDb: number[]; phase: number[] }> | undefined;

    if (input.include_data) {
      data = downsample(plot.data, plot.pointCount, input.max_points);
      if (plot.ac) {
        ac = downsampleAc(plot.ac, plot.pointCount, input.max_points);
      }
    }

    return {
      plotname: plot.plotname,
      analysisType: plot.analysisType,
      format: plot.format,
      pointCount: plot.pointCount,
      variables: plot.variables.map((v) => ({ name: v.name, type: v.type })),
      summary,
      ...(data ? { data } : {}),
      ...(ac   ? { ac }   : {}),
    };
  });

  return { simulationId: input.simulation_id, plots: outputPlots };
}

// ──────────────────────────────────────────────────────────────
// Downsampling
// ──────────────────────────────────────────────────────────────

function downsample(
  data: Record<string, number[]>,
  pointCount: number,
  maxPoints?: number
): Record<string, number[]> {
  if (!maxPoints || pointCount <= maxPoints) return data;

  const indices = sampleIndices(pointCount, maxPoints);
  const out: Record<string, number[]> = {};
  for (const [name, series] of Object.entries(data)) {
    out[name] = indices.map((i) => series[i] ?? 0);
  }
  return out;
}

function downsampleAc(
  ac: Record<string, { magnitudeDb: number[]; phase: number[] }>,
  pointCount: number,
  maxPoints?: number
): Record<string, { magnitudeDb: number[]; phase: number[] }> {
  if (!maxPoints || pointCount <= maxPoints) return ac;

  const indices = sampleIndices(pointCount, maxPoints);
  const out: Record<string, { magnitudeDb: number[]; phase: number[] }> = {};
  for (const [name, { magnitudeDb, phase }] of Object.entries(ac)) {
    out[name] = {
      magnitudeDb: indices.map((i) => magnitudeDb[i] ?? 0),
      phase:       indices.map((i) => phase[i]       ?? 0),
    };
  }
  return out;
}

/** Evenly spaced indices always including first and last. */
function sampleIndices(total: number, n: number): number[] {
  const indices: number[] = [];
  for (let k = 0; k < n; k++) {
    indices.push(Math.round((k / (n - 1)) * (total - 1)));
  }
  return [...new Set(indices)];
}

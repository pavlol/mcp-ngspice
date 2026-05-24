import { z } from "zod";
import { runNgspice, SimulationResult } from "../utils/ngspice.js";
import { validateNetlist } from "../utils/validation.js";
import { parseLog } from "../parsers/logParser.js";

export const RunSimulationSchema = z.object({
  netlist: z.string().describe("SPICE netlist content as a string"),
  timeout: z
    .number()
    .int()
    .min(1000)
    .max(300_000)
    .default(30_000)
    .describe("Simulation timeout in milliseconds (default 30s)"),
});

export type RunSimulationInput = z.infer<typeof RunSimulationSchema>;

export interface RunSimulationOutput {
  simulationId: string;
  success: boolean;
  summary: string;
  warnings: string[];
  errors: string[];
  measurements: Record<string, string>;
  logPath: string;
  rawPath: string;
}

export async function runSimulation(input: RunSimulationInput): Promise<RunSimulationOutput> {
  const validation = validateNetlist(input.netlist);
  if (!validation.valid) {
    throw new Error(`Invalid netlist:\n${validation.errors.join("\n")}`);
  }

  const result: SimulationResult = await runNgspice(input.netlist, input.timeout);
  const parsed = parseLog(result.logOutput);

  const summary = result.success
    ? `Simulation completed successfully (id: ${result.id})`
    : `Simulation failed with exit code ${result.exitCode}: ${result.error ?? "unknown error"}`;

  return {
    simulationId: result.id,
    success: result.success,
    summary,
    warnings: parsed.warnings,
    errors: result.success ? parsed.errors : [...parsed.errors, result.error ?? ""].filter(Boolean),
    measurements: parsed.measurements,
    logPath: result.logPath,
    rawPath: result.rawPath,
  };
}

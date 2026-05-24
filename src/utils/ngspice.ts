import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { resolveLibPaths } from "./libResolver.js";

export interface SimulationResult {
  id: string;
  success: boolean;
  exitCode: number;
  logOutput: string;
  netlistPath: string;
  logPath: string;
  rawPath: string;
  error?: string;
}

const NGSPICE_BIN = process.env.NGSPICE_BIN ?? "C:\\Spice64\\bin\\ngspice_con.exe";
// Resolve project root from this file's location (src/utils/ → two levels up)
const PROJECT_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const CIRCUITS_DIR = path.join(PROJECT_ROOT, "circuits");
const RESULTS_DIR = path.join(PROJECT_ROOT, "results");

// Create directories at module load so they exist before the first simulation
await fs.mkdir(CIRCUITS_DIR, { recursive: true });
await fs.mkdir(RESULTS_DIR, { recursive: true });

export async function runNgspice(
  netlistContent: string,
  timeoutMs = 30_000
): Promise<SimulationResult> {
  const id = randomUUID();
  const netlistPath = path.join(CIRCUITS_DIR, `${id}.cir`);
  const logPath = path.join(RESULTS_DIR, `${id}.log`);
  const rawPath = path.join(RESULTS_DIR, `${id}.raw`);

  const resolvedContent = await resolveLibPaths(netlistContent);
  await fs.writeFile(netlistPath, resolvedContent, "utf8");

  return new Promise((resolve) => {
    // -b batch mode, -o log output, -r raw output
    const args = ["-b", "-o", logPath, "-r", rawPath, netlistPath];
    const proc = spawn(NGSPICE_BIN, args, { windowsHide: true });

    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      resolve({
        id, success: false, exitCode: -1,
        logOutput: stderr, netlistPath, logPath, rawPath,
        error: `Simulation timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    proc.on("close", async (code) => {
      clearTimeout(timer);
      let logOutput = "";
      try { logOutput = await fs.readFile(logPath, "utf8"); } catch { /* no log */ }

      const success = code === 0;
      resolve({
        id, success, exitCode: code ?? -1,
        logOutput, netlistPath, logPath, rawPath,
        error: success ? undefined : `ngspice exited with code ${code}`,
      });
    });
  });
}

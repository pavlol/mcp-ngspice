import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { CreateNetlistSchema, createNetlist } from "./tools/createNetlist.js";
import { RunSimulationSchema, runSimulation } from "./tools/runSimulation.js";
import { GetComponentInfoSchema, getComponentInfo } from "./tools/getComponentInfo.js";
import { ParseResultsSchema, parseResults } from "./tools/parseResults.js";
import { SweepParametersSchema, sweepParameters } from "./tools/sweepParameters.js";
import { ListSimulationsSchema, listSimulations } from "./tools/listSimulations.js";

const server = new McpServer({
  name: "mcp-ngspice",
  version: "0.1.0",
});

server.tool(
  "create_netlist",
  "Generate a SPICE netlist string from a structured description of components and analysis commands",
  CreateNetlistSchema.shape,
  async (input) => {
    const netlist = createNetlist(input as Parameters<typeof createNetlist>[0]);
    return {
      content: [{ type: "text", text: netlist }],
    };
  }
);

server.tool(
  "run_simulation",
  "Run an ngspice simulation from a SPICE netlist string. Returns simulation ID, success status, warnings, errors, and .meas results.",
  RunSimulationSchema.shape,
  async (input) => {
    const result = await runSimulation(input as Parameters<typeof runSimulation>[0]);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

server.tool(
  "parse_results",
  "Parse the .raw output file from a completed simulation. Returns variable summaries (min/max) and optionally the full time/frequency series for every signal.",
  ParseResultsSchema.shape,
  async (input) => {
    const result = await parseResults(input as Parameters<typeof parseResults>[0]);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "sweep_parameters",
  "Run a series of simulations sweeping one parameter across a range. " +
  "Write the netlist with a {TOKEN} placeholder where the parameter value goes. " +
  "Returns per-run summaries and a cross-run table showing how each variable changes with the parameter.",
  SweepParametersSchema.shape,
  async (input) => {
    const result = await sweepParameters(input as Parameters<typeof sweepParameters>[0]);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "list_simulations",
  "List past simulations stored on disk. Returns timestamp, circuit title, analysis type, success status, and key metrics. Supports newest/oldest sorting and success/failed filtering.",
  ListSimulationsSchema.shape,
  async (input) => {
    const result = await listSimulations(input as Parameters<typeof listSimulations>[0]);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "get_component_info",
  "Get SPICE syntax, examples, and parameter reference for a component type (R, C, L, V, I, D, Q, M, X)",
  GetComponentInfoSchema.shape,
  async (input) => {
    const info = getComponentInfo(input as Parameters<typeof getComponentInfo>[0]);
    return {
      content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // MCP servers communicate via stdio; stderr is safe for diagnostics
  process.stderr.write("mcp-ngspice server started\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});

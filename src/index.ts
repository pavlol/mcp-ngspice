import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { CreateNetlistSchema, createNetlist } from "./tools/createNetlist.js";
import { RunSimulationSchema, runSimulation } from "./tools/runSimulation.js";
import { GetComponentInfoSchema, getComponentInfo } from "./tools/getComponentInfo.js";
import { ParseResultsSchema, parseResults } from "./tools/parseResults.js";
import { SweepParametersSchema, sweepParameters } from "./tools/sweepParameters.js";
import { ListSimulationsSchema, listSimulations } from "./tools/listSimulations.js";
import { TEMPLATES, getTemplate, listTemplates } from "./templates/circuits.js";
import { SaveLibFileSchema, saveLibFile } from "./tools/saveLibFile.js";
import { listLibFiles } from "./tools/listLibFiles.js";
import { DeleteLibFileSchema, deleteLibFile } from "./tools/deleteLibFile.js";
import { z } from "zod";

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

// ── Model library file tools ──────────────────────────────────

server.tool(
  "save_lib_file",
  "Save a SPICE model library (.lib) file to the local models directory. " +
  "The file is then available for any netlist to reference with .lib or .include directives — " +
  "paths are resolved automatically at simulation time.",
  SaveLibFileSchema.shape,
  async (input) => {
    const result = await saveLibFile(input as Parameters<typeof saveLibFile>[0]);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "list_lib_files",
  "List all SPICE model library files saved in the local models directory.",
  {},
  async () => {
    const result = await listLibFiles();
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

server.tool(
  "delete_lib_file",
  "Delete a SPICE model library file from the local models directory.",
  DeleteLibFileSchema.shape,
  async (input) => {
    const result = await deleteLibFile(input as Parameters<typeof deleteLibFile>[0]);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ── Netlist template resource: netlist://templates/{name} ──────

server.resource(
  "netlist-templates",
  new ResourceTemplate("netlist://templates/{name}", {
    list: async () => ({
      resources: TEMPLATES.map((t) => ({
        uri:         `netlist://templates/${t.name}`,
        name:        t.title,
        description: t.description,
        mimeType:    "text/plain",
      })),
    }),
  }),
  async (uri, { name }) => {
    const tpl = getTemplate(String(name));
    if (!tpl) {
      return {
        contents: [{
          uri:      uri.href,
          mimeType: "text/plain",
          text:     `Template '${name}' not found. Call list_templates to see available names.`,
        }],
      };
    }
    return {
      contents: [{
        uri:      uri.href,
        mimeType: "text/plain",
        text:     tpl.netlist,
      }],
    };
  }
);

// ── Template tools ────────────────────────────────────────────

server.tool(
  "list_templates",
  "List all built-in circuit netlist templates (RC/RL filters, RLC, voltage divider, rectifiers, BJT/MOSFET amplifiers, op-amp stages, CMOS inverter, active filters, Zener regulator). Returns name, title, description, category, and adjustable parameters for each.",
  {},
  async () => ({
    content: [{ type: "text", text: JSON.stringify(listTemplates(), null, 2) }],
  })
);

server.tool(
  "get_template",
  "Retrieve a ready-to-run SPICE netlist for a named circuit template. Use list_templates first to discover available names.",
  {
    name: z.string().describe("Template name, e.g. 'rc-lowpass', 'common-emitter', 'full-wave-bridge'"),
  },
  async ({ name }) => {
    const tpl = getTemplate(String(name));
    if (!tpl) {
      const names = TEMPLATES.map((t) => t.name).join(", ");
      return {
        content: [{
          type: "text",
          text: `Template '${name}' not found. Available templates: ${names}`,
        }],
      };
    }
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          name:        tpl.name,
          title:       tpl.title,
          description: tpl.description,
          category:    tpl.category,
          parameters:  tpl.parameters,
          netlist:     tpl.netlist,
        }, null, 2),
      }],
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

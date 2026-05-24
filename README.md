# mcp-ngspice

An MCP (Model Context Protocol) server that wraps [ngspice](https://ngspice.sourceforge.io/), the open-source SPICE circuit simulator. Lets Claude design, simulate, and analyze electrical circuits through natural language.

## Features

- Generate SPICE netlists from structured component descriptions
- Run ngspice simulations and capture results
- Parse `.raw` output files (ASCII and binary formats)
- Sweep any circuit parameter across a range with parallel execution
- List and filter past simulation runs
- Reference data for all standard SPICE components

## Requirements

- [Node.js](https://nodejs.org/) 18+
- [ngspice](https://ngspice.sourceforge.io/download.html) installed and on PATH (Windows: extracted to `C:\Spice64\`)
- [Claude Desktop](https://claude.ai/download)

## Installation

```bash
git clone https://github.com/pavlol/mcp-ngspice.git
cd mcp-ngspice
npm install
npm run build
```

## Claude Desktop Configuration

Add the server to `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ngspice": {
      "command": "node",
      "args": ["C:\\path\\to\\mcp-ngspice\\dist\\index.js"],
      "cwd": "C:\\path\\to\\mcp-ngspice"
    }
  }
}
```

Restart Claude Desktop after saving the config.

## Tools

| Tool | Description |
|------|-------------|
| `create_netlist` | Generate a `.cir` netlist from a component list and analysis commands |
| `run_simulation` | Run a netlist through ngspice, return simulation ID and log summary |
| `parse_results` | Parse the `.raw` output file for a given simulation ID |
| `sweep_parameters` | Run multiple simulations varying one parameter over a range |
| `list_simulations` | List past simulation runs with filtering and sorting |
| `get_component_info` | SPICE syntax reference for R, C, L, V, I, D, Q, M, X |

See [USER_GUIDE.md](USER_GUIDE.md) for detailed usage examples.

## Development

```bash
npm run dev      # run with tsx (no build step)
npm run build    # compile TypeScript → dist/
```

Simulation netlists are saved to `circuits/`, outputs to `results/`.

## License

MIT

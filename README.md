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

Config for Windows:
Add the server to `%APPDATA%\Claude\claude_desktop_config.json`:
If does not work, add it here:
AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\
OR search and use :
%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\

Modern Windows apps distributed via the Store (even when downloaded from a vendor's own website) are sometimes packaged as MSIX/UWP containers. This packaging system creates two separate AppData paths
So the app writes to and reads from the Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\ path — the other one at AppData\Roaming\Claude\ exists but is never read by the running app.
The UWP container intercepts filesystem calls. When Claude Desktop tries to access AppData\Roaming\Claude\, Windows silently redirects it to the LocalCache\Roaming\Claude\ path inside the package container. The file at AppData\Roaming\Claude\ is a ghost — it exists but the app never sees it.


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
## Create Folders
in your mcp-ngspice create folders:
circuits/
results/

Example:
mkdir -p D:/Development_Soft/mcp_ngspice/circuits
mkdir -p D:/Development_Soft/mcp_ngspice/results

The server expects these folders to already exist — it writes netlists to circuits/ and simulation output to results/. Once the cwd is correctly set and the folders exist, the simulation will run.

The real issue is that the cwd field in Claude Desktop's MCP config is not always passed to the Node.js process on Windows. The server starts from system32 regardless. This is a known Windows-specific behavior with how Claude Desktop spawns subprocesses.
The most robust solution is to make the server resolve its own working directory from the script's location, instead of relying on cwd. Do this in Claude Code CLI:
```
cd D:/Development_Soft/mcp_ngspice
claude

Then tell Claude Code:

"In src/utils/ngspice.ts, the server is trying to create circuits/ and results/ directories relative to process.cwd(), but on Windows Claude Desktop launches the process from system32 instead of the project root. Fix this by resolving the project root from import.meta.url instead of process.cwd(). The project root should be two levels up from src/utils/ngspice.ts — use fileURLToPath and path.resolve to get the absolute path, then use that as the base for all circuits/ and results/ directory operations. Also ensure both directories are created automatically on startup if they don't exist."
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

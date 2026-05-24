# ngspice MCP Server Project

## Project Overview
Build an MCP (Model Context Protocol) server that wraps ngspice, the open-source SPICE circuit simulator, enabling Claude to design, simulate, and analyze electrical circuits programmatically.

## Developer Context
- **Developer**: Paul (Pavlo Lyakhov), software developer and part-time B.Sc. Electrical Engineering student at HTW Dresden (HTWD)
- **OS**: Windows (Git Bash / PowerShell)
- **Background**: Backend development, AWS infrastructure, Node.js, Python, Prisma ORM
- **Related projects**: Selebri (Next.js/AWS platform), Autodesk Fusion MCP integration
- **Use cases**: HTWD coursework automation, circuit design with Claude, potential monetization

## Tech Stack Decisions
- **Language**: Node.js (TypeScript) for the MCP server
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Circuit simulator**: ngspice (must be installed separately on the system)
- **Output parsing**: Custom parser for ngspice `.raw` (binary) and `.log` files
- **Optional Python**: PySpice / PyLTSpice for advanced simulation workflows

## Architecture

```
Claude (MCP Client)
    │ (MCP Protocol via stdio)
    ▼
MCP Server (Node.js/TypeScript)
    ├── Tools:
    │   ├── create_netlist(components, connections, analysis)
    │   ├── run_simulation(netlist_content, timeout)
    │   ├── parse_results(simulation_id)
    │   ├── sweep_parameters(netlist, parameter, range)
    │   ├── list_simulations()
    │   └── get_component_info(component_type)
    │
    ├── Resources:
    │   ├── simulation://results/{id}
    │   └── netlist://templates/{name}
    │
    └── Subprocess calls to ngspice CLI
         └── ngspice -b circuit.cir → .raw + .log output
```

## Implementation Plan

### Phase 1: Foundation
1. Initialize Node.js project with TypeScript
2. Install MCP SDK (`@modelcontextprotocol/sdk`)
3. Create basic MCP server skeleton (stdio transport)
4. Implement `create_netlist` tool (generates .cir files from structured input)
5. Implement `run_simulation` tool (calls ngspice subprocess, captures output)
6. Basic `.log` file parser for simulation results

### Phase 2: Core Features
7. Implement `.raw` binary file parser (voltage/current waveform data)
8. Implement `parse_results` tool (returns structured simulation data)
9. Implement `sweep_parameters` tool (automated parameter variations)
10. Implement `get_component_info` tool (reference data for R, C, L, D, Q, etc.)
11. Add netlist templates for common circuits (RC filter, voltage divider, amplifier)
12. Error handling and validation

### Phase 3: Polish & Monetization
13. Add netlist validation before simulation
14. Support for `.include` and `.lib` model files
15. README and documentation
16. npm package publishing
17. GitHub repository setup
18. Example circuits and usage guide

## Key Technical Notes

### ngspice CLI Usage
```bash
# Batch mode (non-interactive, for automation)
ngspice -b circuit.cir -o output.log

# The .raw file is generated automatically alongside the .log
# .raw contains binary waveform data
# .log contains simulation summary, warnings, errors
```

### SPICE Netlist Format
```spice
Circuit Title (first line is always the title)
* Comments start with asterisk

* Components: TYPE NAME NODE+ NODE- VALUE
V1 1 0 DC 5          ; Voltage source
R1 1 2 1k            ; Resistor
C1 2 0 100n          ; Capacitor
L1 2 3 10m           ; Inductor
D1 3 0 DMODEL        ; Diode
Q1 4 3 0 2N3904      ; BJT transistor

* Analysis commands
.dc V1 0 10 0.1      ; DC sweep
.ac dec 50 1 1Meg     ; AC frequency sweep
.tran 1u 10m          ; Transient analysis

.end                  ; Required terminator
```

### Component Name Prefixes
- V = Voltage source
- I = Current source
- R = Resistor
- C = Capacitor
- L = Inductor
- D = Diode
- Q = BJT transistor
- M = MOSFET
- X = Subcircuit

### Node Convention
- Node 0 = Ground (always)
- Nodes can be numbers (1, 2, 3) or names (Vout, In, Bias)

## File Structure Target
```
mcp_ngspice/
├── CLAUDE.md              # This file
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # MCP server entry point
│   ├── tools/
│   │   ├── createNetlist.ts
│   │   ├── runSimulation.ts
│   │   ├── parseResults.ts
│   │   ├── sweepParameters.ts
│   │   └── getComponentInfo.ts
│   ├── parsers/
│   │   ├── logParser.ts    # Parse .log output
│   │   └── rawParser.ts    # Parse .raw binary waveform data
│   ├── templates/
│   │   └── circuits.ts     # Pre-built circuit templates
│   └── utils/
│       ├── ngspice.ts      # ngspice subprocess wrapper
│       └── validation.ts   # Netlist validation
├── circuits/               # Working directory for .cir files
├── results/                # Simulation output storage
├── examples/               # Example usage
└── README.md
```

## Style & Conventions
- TypeScript strict mode
- ES modules (type: "module" in package.json)
- Async/await for all I/O operations
- Descriptive error messages (user-friendly, not stack traces)
- JSDoc comments on public functions
- Use `zod` for input validation on tool parameters

## Current Status
- [ ] ngspice not yet installed on Windows
- [ ] Project directory created: mcp_ngspice/
- [ ] Claude Code CLI running in project directory
- [ ] Phase 1 implementation not started

## Next Steps
1. Install ngspice on Windows (download from https://ngspice.sourceforge.io/)
2. Verify ngspice works: `ngspice --version`
3. Initialize npm project: `npm init -y`
4. Install dependencies: MCP SDK, TypeScript, zod
5. Create src/index.ts with basic MCP server skeleton

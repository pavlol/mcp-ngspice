# mcp-ngspice User Guide

A practical guide to using the ngspice MCP server with Claude. Each section shows the tool, its parameters, and a realistic example conversation.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [create_netlist](#create_netlist)
3. [run_simulation](#run_simulation)
4. [parse_results](#parse_results)
5. [sweep_parameters](#sweep_parameters)
6. [list_simulations](#list_simulations)
7. [get_component_info](#get_component_info)
8. [list_templates](#list_templates)
9. [get_template](#get_template)
10. [save_lib_file](#save_lib_file)
11. [list_lib_files](#list_lib_files)
12. [delete_lib_file](#delete_lib_file)
13. [End-to-End Workflows](#end-to-end-workflows)

---

## Quick Start

After installing and configuring the server, just describe what you want to simulate in plain English:

> "Simulate an RC low-pass filter with R=1kΩ and C=100nF driven by a 5V step. Show me the output voltage over 5ms."

Claude will call `create_netlist` → `run_simulation` → `parse_results` automatically and present the results.

---

## create_netlist

Generates a SPICE netlist string from a structured description. Use this when you want to inspect or edit the netlist before simulating.

**Parameters**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `title` | yes | Circuit title (first line of the netlist) |
| `components` | yes | Array of components: `name`, `nodes`, `value`, optional `model` |
| `analysis` | yes | Array of SPICE analysis command strings |
| `options` | no | Optional `.options` lines |

**Example — voltage divider**

> "Generate a netlist for a voltage divider: 10V source, R1=4kΩ from supply to mid-point, R2=1kΩ from mid-point to ground. Run an operating point analysis."

```
create_netlist({
  title: "Voltage Divider",
  components: [
    { name: "V1", nodes: ["1", "0"], value: "DC 10" },
    { name: "R1", nodes: ["1", "2"], value: "4k" },
    { name: "R2", nodes: ["2", "0"], value: "1k" }
  ],
  analysis: [".op"]
})
```

Output netlist:
```spice
Voltage Divider
V1 1 0 DC 10
R1 1 2 4k
R2 2 0 1k

.op
.end
```

---

## run_simulation

Runs a SPICE netlist through ngspice. Returns a simulation ID you can pass to `parse_results`.

**Parameters**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `netlist` | — | Full SPICE netlist as a string |
| `timeout` | 30000 | Timeout in milliseconds (1000–300000) |

**Example — RC transient**

> "Run this RC filter simulation for up to 20 seconds."

```
run_simulation({
  netlist: `RC Low-pass Filter
V1 1 0 PULSE(0 5 0 1n 1n 0.5m 1m)
R1 1 2 1k
C1 2 0 100n
.tran 10u 2m
.end`,
  timeout: 20000
})
```

Response:
```json
{
  "simulationId": "a1b2c3d4-...",
  "success": true,
  "summary": "Simulation completed successfully",
  "warnings": [],
  "errors": [],
  "measurements": {}
}
```

**Using `.meas` to extract values**

Add `.meas` directives to your netlist to capture specific quantities:

```spice
RC Filter with Measurements
V1 1 0 PULSE(0 5 0 1n 1n 0.5m 1m)
R1 1 2 1k
C1 2 0 100n
.tran 10u 2m
.meas tran vmax MAX v(2)
.meas tran trise TRIG v(2) VAL=0.5 RISE=1 TARG v(2) VAL=4.5 RISE=1
.end
```

The `measurements` field in the response will contain `vmax` and `trise`.

---

## parse_results

Parses the `.raw` waveform file for a completed simulation. Returns per-variable summaries and optionally the full time-series data.

**Parameters**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `simulation_id` | — | UUID from `run_simulation` response |
| `include_data` | true | Include full waveform arrays |
| `max_points` | — | Downsample to at most N points (evenly spaced) |

**Example — get full waveform**

> "Parse the results and show me the output voltage waveform."

```
parse_results({
  simulation_id: "a1b2c3d4-...",
  include_data: true,
  max_points: 200
})
```

Response excerpt:
```json
{
  "plots": [{
    "plotname": "Transient Analysis",
    "analysisType": "tran",
    "pointCount": 486,
    "summary": [
      { "name": "time",  "min": 0,      "max": 0.002,  "last": 0.002  },
      { "name": "v(1)",  "min": 0,      "max": 5,      "last": 5      },
      { "name": "v(2)",  "min": 0,      "max": 4.967,  "last": 4.967  },
      { "name": "i(v1)", "min": -0.005, "max": 0.00497,"last": 0      }
    ],
    "data": {
      "time":  [0, 1e-5, 2e-5, ...],
      "v(2)":  [0, 0.049, 0.098, ...]
    }
  }]
}
```

**AC analysis — frequency response**

For AC simulations, `parse_results` also returns `ac` data with magnitude (dB) and phase (degrees):

```json
{
  "ac": {
    "v(2)": {
      "magnitudeDb": [−0.0002, −0.014, −0.13, −1.45, −6.99, −20.0, ...],
      "phase":       [−0.1, −0.9, −5.7, −32, −63, −84, ...]
    }
  }
}
```

The −3 dB point (cutoff frequency) is where `magnitudeDb ≈ −3`.

---

## sweep_parameters

Runs a family of simulations varying one parameter. Write the netlist with a `{TOKEN}` placeholder; the tool substitutes each sweep value and runs the simulations in parallel.

**Parameters**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `netlist` | — | Netlist with `{TOKEN}` placeholder |
| `token` | — | Placeholder name without braces (e.g. `"RVAL"`) |
| `start` | — | First value |
| `stop` | — | Last value |
| `steps` | — | Number of steps, inclusive (2–200) |
| `scale` | `"linear"` | `"linear"` or `"log"` |
| `timeout_per_run` | 15000 | Per-simulation timeout in ms |
| `max_concurrent` | 3 | Max parallel ngspice processes |

**Example — find the resistor value that sets output to 3.3V**

> "I need exactly 3.3V at the mid-point of a voltage divider with a 5V supply and R1=10kΩ. Sweep R2 from 1kΩ to 20kΩ in 10 steps to find the right value."

```
sweep_parameters({
  netlist: `Divider R2 sweep
V1 1 0 DC 5
R1 1 2 10k
R2 2 0 {R2}
.op
.end`,
  token: "R2",
  start: 1000,
  stop: 20000,
  steps: 10,
  scale: "linear"
})
```

Response excerpt:
```json
{
  "table": {
    "param": [1000, 3222, 5444, 7666, 9888, 12111, 14333, 16555, 18777, 20000],
    "variables": {
      "v(2)": {
        "last": [0.455, 1.24, 1.96, 2.51, 2.90, 3.18, 3.38, 3.53, 3.65, 3.72]
      }
    }
  }
}
```

Claude can interpolate from the table: R2 ≈ 13kΩ gives v(2) ≈ 3.3V. Refine with a tighter sweep if needed.

**Example — RC filter cutoff frequency sweep (log scale)**

> "Sweep the capacitor from 1nF to 10μF on a log scale to see how the RC time constant changes."

```
sweep_parameters({
  netlist: `RC time constant sweep
V1 1 0 DC 5
R1 1 2 1k
C1 2 0 {CVAL}
.tran 10u 5m
.end`,
  token: "CVAL",
  start: 1e-9,
  stop: 1e-5,
  steps: 9,
  scale: "log",
  max_concurrent: 3
})
```

---

## list_simulations

Lists past simulation runs stored in the `results/` directory.

**Parameters**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `limit` | 20 | Max results to return (1–500) |
| `sort` | `"newest"` | `"newest"` or `"oldest"` |
| `filter` | `"all"` | `"all"`, `"success"`, or `"failed"` |

**Example — find recent failed simulations**

> "Show me any simulations that failed in the last session."

```
list_simulations({
  filter: "failed",
  limit: 10
})
```

**Example — list all transient runs to compare**

> "List the 5 most recent successful simulations."

```
list_simulations({
  filter: "success",
  sort: "newest",
  limit: 5
})
```

Response:
```json
{
  "total": 24,
  "returned": 5,
  "simulations": [
    {
      "id": "a1b2c3d4-...",
      "timestamp": "2026-05-24T10:52:01.000Z",
      "title": "RC Low-pass Filter",
      "analysisType": "tran",
      "success": true,
      "variables": 4,
      "dataRows": 486,
      "durationSeconds": 0.0038,
      "rawSizeBytes": 29317
    },
    ...
  ]
}
```

---

## get_component_info

Returns SPICE syntax, examples, and key parameters for a component type. Useful when writing netlists manually.

**Parameter:** `component_type` — one of `R`, `C`, `L`, `V`, `I`, `D`, `Q`, `M`, `X`

**Example**

> "What's the SPICE syntax for a BJT transistor?"

```
get_component_info({ component_type: "Q" })
```

Response:
```json
{
  "name": "BJT Transistor",
  "prefix": "Q",
  "syntax": "Qname collector base emitter model",
  "example": "Q1 4 3 0 2N3904",
  "common_models": ["2N3904 (NPN)", "2N3906 (PNP)", "BC547"],
  "note": "Requires .model or .lib include for model parameters"
}
```

---

## list_templates

Lists all built-in circuit netlist templates without returning the full netlist text. Use this to discover available template names before calling `get_template`.

**Parameters:** none

**Example**

> "What circuit templates are available?"

```
list_templates()
```

Response excerpt:
```json
[
  {
    "name": "rc-lowpass",
    "title": "RC Low-Pass Filter",
    "description": "First-order RC low-pass filter with AC frequency sweep and transient step response.",
    "category": "filter",
    "parameters": [
      { "name": "R1", "description": "Series resistance — sets cutoff frequency with C1", "defaultValue": "1k", "unit": "Ω" },
      { "name": "C1", "description": "Shunt capacitance — sets cutoff frequency with R1", "defaultValue": "100n", "unit": "F" }
    ]
  },
  {
    "name": "common-emitter",
    "title": "BJT Common-Emitter Amplifier",
    "category": "amplifier",
    ...
  },
  ...
]
```

Available templates by category:

| Category | Names |
|----------|-------|
| filter | `rc-lowpass`, `rc-highpass`, `rl-lowpass`, `series-rlc`, `sallen-key-lowpass` |
| passive | `voltage-divider` |
| rectifier | `half-wave-rectifier`, `full-wave-bridge` |
| amplifier | `common-emitter` |
| mosfet | `nmos-common-source`, `nmos-source-follower`, `cmos-inverter` |
| opamp | `inverting-amplifier`, `non-inverting-amplifier`, `voltage-follower`, `summing-amplifier`, `integrator`, `differentiator` |
| power | `zener-regulator`, `buck-converter`, `boost-converter` |

---

## get_template

Retrieves the full SPICE netlist for a named template. The returned netlist is ready to pass directly to `run_simulation`.

**Parameters**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `name` | yes | Template slug from `list_templates`, e.g. `"rc-lowpass"` |

**Example — get and run a filter template**

> "Give me the RC low-pass filter template and simulate it."

```
get_template({ name: "rc-lowpass" })
```

Response:
```json
{
  "name": "rc-lowpass",
  "title": "RC Low-Pass Filter",
  "description": "First-order RC low-pass filter with AC frequency sweep and transient step response.",
  "category": "filter",
  "parameters": [...],
  "netlist": "RC Low-Pass Filter\n* fc = 1 / (2*pi*R1*C1) = 1592 Hz with defaults\n..."
}
```

Pass the `netlist` field directly to `run_simulation`:

```
run_simulation({ netlist: <template.netlist> })
```

**Example — modify a template before running**

Get the template, edit one value in the netlist string, then simulate:

> "Use the common-emitter template but change Rc to 10kΩ."

1. `get_template({ name: "common-emitter" })` — retrieve netlist
2. Replace `Rc vcc col 4.7k` with `Rc vcc col 10k` in the returned netlist string
3. `run_simulation({ netlist: modifiedNetlist })`
4. `parse_results({ simulation_id: ... })` — inspect new operating point

**Example — sweep a template parameter**

> "Use the RC low-pass template and sweep C1 from 10nF to 1µF to see how the cutoff shifts."

1. `get_template({ name: "rc-lowpass" })` — get base netlist
2. Replace the literal `100n` with `{CVAL}` in the netlist
3. Call `sweep_parameters` with `token: "CVAL"`, `start: 10e-9`, `stop: 1e-6`, `steps: 10`, `scale: "log"`

---

## save_lib_file

Saves a SPICE model library file to the local `models/` directory. Once saved, any netlist can reference the model with `.lib filename.lib` or `.include filename.lib` — the server resolves relative paths to the models directory automatically at simulation time.

> **Note:** ngspice uses `.include` internally. The server transparently rewrites `.lib` directives to `.include` so you can write either form in your netlists.

**Parameters**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `name` | yes | File name, e.g. `"bc547.lib"`. A `.lib` extension is added if omitted. |
| `content` | yes | Full text content of the model file |

**Example — save a transistor model**

> "Save this BC547 model so I can use it in netlists without defining it inline."

```
save_lib_file({
  name: "bc547.lib",
  content: `.MODEL BC547 NPN(Is=10f Bf=200 Vaf=80 Rb=100 Rc=1
+ Cjc=5p Cje=12p Tf=300p Tr=30n)`
})
```

Response:
```json
{
  "path": "D:\\...\\models\\bc547.lib",
  "sizeBytes": 87
}
```

After saving, reference it in any netlist:
```spice
BJT stage with BC547
.lib bc547.lib
Vcc vcc 0 DC 12
Q1 col base 0 BC547
Rc vcc col 4.7k
Rb vcc base 100k
.op
.end
```

---

## list_lib_files

Lists all `.lib` model files saved in the local models directory.

**Parameters:** none

**Example**

> "What model files do I have available?"

```
list_lib_files()
```

Response:
```json
{
  "modelsDir": "D:\\...\\models",
  "count": 2,
  "files": [
    { "name": "bc547.lib",  "sizeBytes": 87,  "modifiedAt": "2026-05-24T11:00:00.000Z" },
    { "name": "lm741.lib",  "sizeBytes": 312, "modifiedAt": "2026-05-24T11:05:00.000Z" }
  ]
}
```

---

## delete_lib_file

Deletes a model file from the local models directory.

**Parameters**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `name` | yes | File name to delete, e.g. `"bc547.lib"` |

**Example**

```
delete_lib_file({ name: "bc547.lib" })
```

Response:
```json
{ "deleted": "D:\\...\\models\\bc547.lib" }
```

---

## End-to-End Workflows

### Workflow 1: Design a low-pass filter for audio

> "Design an RC low-pass filter with a cutoff frequency of 1 kHz. Verify it with an AC sweep from 10 Hz to 100 kHz and show the Bode plot data."

1. **Calculate**: f_c = 1/(2π·R·C) = 1 kHz → with R=1kΩ, C ≈ 159 nF (use 160 nF)
2. **Simulate**:

```spice
RC Low-pass 1kHz
V1 1 0 AC 1
R1 1 2 1k
C1 2 0 160n
.ac dec 20 10 100k
.end
```

3. `run_simulation` → get ID
4. `parse_results` with `include_data: true` → check `ac.v(2).magnitudeDb` for −3 dB point near 1 kHz

---

### Workflow 2: BJT common-emitter amplifier bias

> "Set up a 2N3904 common-emitter stage with Vcc=12V. Sweep R_base from 10kΩ to 200kΩ to find the bias point that puts the collector at 6V."

```spice
CE Amplifier bias sweep
Vcc 1 0 DC 12
Rb 1 2 {RB}
.model 2N3904 NPN(Is=2.52n Rs=0.568 Bf=300 Vaf=90)
Q1 3 2 0 2N3904
Rc 1 3 1k
.op
.end
```

```
sweep_parameters({
  token: "RB",
  start: 10000,
  stop: 200000,
  steps: 20,
  scale: "log"
})
```

Look at `table.variables["v(3)"].last` to find the R_base that gives v(collector) = 6V.

---

### Workflow 3: Buck converter — sweep duty cycle for target output voltage

> "I need a 3.3 V rail from a 12 V supply. Find the duty cycle."

`Vout = Vin × D` (ideal), so D = 3.3/12 = 0.275 → pulse width = 2.75 µs.

1. `get_template({ name: "buck-converter" })` — get base netlist
2. Replace `4.2u` (the pulse width in `Vpwm`) with `2.75u`
3. `run_simulation({ netlist: ... })` (allow up to 30 s)
4. `parse_results({ simulation_id: ..., include_data: false })` — read `v(out)` min/max; ripple = max − min

Or use `sweep_parameters` to sweep the pulse width directly:

```
sweep_parameters({
  netlist: <template with PULSE(0 12 0 10n 10n {PW} 10u)>,
  token: "PW",
  start: 1e-6,
  stop: 9e-6,
  steps: 9,
  scale: "linear"
})
```

---

### Workflow 4: MOSFET common-source amplifier

> "Set up an N-channel MOSFET common-source amplifier and find the AC gain."

1. `get_template({ name: "nmos-common-source" })` — retrieve the 2N7000 CS amplifier netlist
2. `run_simulation({ netlist: ... })` — simulate `.op`, `.ac`, and `.tran`
3. `parse_results({ simulation_id: ..., include_data: false })` — check `.op` results for drain voltage (bias point)
4. `parse_results({ simulation_id: ..., include_data: true })` — check `ac.v(out).magnitudeDb` for midband gain

To sweep Rd and observe gain vs. operating point:
```
sweep_parameters({ token: "Rd", start: 1000, stop: 10000, steps: 10 })
```
replacing `3.3k` with `{Rd}` in the netlist.

---

### Workflow 5: CMOS inverter switching characteristics

> "Show me the DC transfer curve and propagation delay of the CMOS inverter."

1. `get_template({ name: "cmos-inverter" })` — includes both `.dc` sweep and `.tran` analysis
2. `run_simulation({ netlist: ... })`
3. `parse_results(...)` — the DC plot gives the transfer characteristic (input vs. output voltage); the transient plot shows rise/fall times

Add `.meas` statements to quantify:
```spice
.meas tran tphl TRIG v(in) VAL=2.5 RISE=1 TARG v(out) VAL=2.5 FALL=1
.meas tran tplh TRIG v(in) VAL=2.5 FALL=1 TARG v(out) VAL=2.5 RISE=1
```

---

### Workflow 6: Sallen-Key filter design

> "Design a 2nd-order Butterworth low-pass filter with a 5 kHz cutoff."

1. `get_template({ name: "sallen-key-lowpass" })` — default fc ≈ 1592 Hz
2. Scale components: fc = 1/(2π·R·C), so for 5 kHz with C=100n: R = 318Ω (use 330Ω)
3. Edit R1, R2 in the netlist to 330 (keep Rf/Rg ratio for Q=0.707)
4. `run_simulation(...)` → `parse_results(...)` — verify -3 dB point near 5 kHz in `ac` data

---

### Workflow 7: Start from a template

> "Simulate the full-wave bridge rectifier template and tell me the DC output voltage and ripple."

1. `list_templates()` — confirm `full-wave-bridge` exists
2. `get_template({ name: "full-wave-bridge" })` — retrieve the ready-to-run netlist
3. `run_simulation({ netlist: ... })` — simulate; get `simulationId`
4. `parse_results({ simulation_id: ..., include_data: false })` — check `summary` for `v(vout)` min/max → ripple = max − min

---

### Workflow 8: Use an external model library

> "I have a manufacturer SPICE model for the BC547. Save it and simulate a common-emitter stage."

1. `save_lib_file({ name: "bc547.lib", content: "<model text>" })` — store it once
2. Write a netlist that references `.lib bc547.lib` (no inline `.MODEL` needed)
3. `run_simulation({ netlist: ... })` — path resolved automatically
4. `parse_results(...)` — inspect operating point

When you no longer need the model: `delete_lib_file({ name: "bc547.lib" })`.

---

### Workflow 9: Iterate on a design

1. Run initial simulation → `list_simulations` to confirm it's saved
2. `parse_results` to inspect waveforms
3. Adjust a component value → `run_simulation` again
4. `list_simulations` to compare the two run IDs side-by-side
5. `parse_results` on both to diff the summaries

---

## SPICE Quick Reference

### Node convention
- Node `0` is always ground
- Nodes can be numbers (`1`, `2`, `3`) or names (`Vout`, `Bias`)

### Value suffixes
| Suffix | Multiplier |
|--------|-----------|
| `f` | 1e−15 (femto) |
| `p` | 1e−12 (pico) |
| `n` | 1e−9 (nano) |
| `u` | 1e−6 (micro) |
| `m` | 1e−3 (milli) |
| `k` | 1e3 (kilo) |
| `Meg` | 1e6 (mega) |
| `G` | 1e9 (giga) |

> Note: `M` means **milli** in SPICE (not mega). Use `Meg` for megaohms/megahertz.

### Common analysis commands
```spice
.op                        Operating point (DC voltages and currents)
.dc V1 0 10 0.1            DC sweep: source V1 from 0V to 10V in 0.1V steps
.tran 1u 10m               Transient: timestep 1µs, run for 10ms
.ac dec 50 1 1Meg          AC sweep: 50 points/decade, 1Hz to 1MHz
```

### Source waveforms
```spice
V1 1 0 DC 5                Constant 5V
V1 1 0 AC 1                AC source, 1V magnitude (for .ac analysis)
V1 1 0 PULSE(0 5 0 1n 1n 0.5m 1m)   Pulse: lo=0 hi=5 delay=0 rise=1ns fall=1ns pw=0.5ms period=1ms
V1 1 0 SIN(0 1 1k)         Sine: offset=0 amplitude=1 freq=1kHz
```

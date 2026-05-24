// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export interface TemplateParameter {
  name: string;
  description: string;
  defaultValue: string;
  unit: string;
}

export interface NetlistTemplate {
  /** URL-safe slug used as the resource name, e.g. "rc-lowpass" */
  name: string;
  /** Human-readable circuit name */
  title: string;
  /** One-sentence description */
  description: string;
  category: "filter" | "amplifier" | "rectifier" | "passive" | "opamp" | "power";
  /** Key adjustable values — use with sweep_parameters by substituting these in the netlist */
  parameters: TemplateParameter[];
  /** Ready-to-run SPICE netlist */
  netlist: string;
}

// ──────────────────────────────────────────────────────────────
// Template library
// ──────────────────────────────────────────────────────────────

export const TEMPLATES: NetlistTemplate[] = [

  // ── Passive filters ──────────────────────────────────────────

  {
    name: "rc-lowpass",
    title: "RC Low-Pass Filter",
    description: "First-order RC low-pass filter with AC frequency sweep and transient step response.",
    category: "filter",
    parameters: [
      { name: "R1", description: "Series resistance — sets cutoff frequency with C1", defaultValue: "1k", unit: "Ω" },
      { name: "C1", description: "Shunt capacitance — sets cutoff frequency with R1", defaultValue: "100n", unit: "F" },
    ],
    netlist: `RC Low-Pass Filter
* fc = 1 / (2*pi*R1*C1) = 1592 Hz with defaults
* V(out) rolls off at -20 dB/decade above fc
*
* Adjust R1 and C1 to change the cutoff frequency.

V1 in 0 AC 1 PULSE(0 1 0 1n 1n 0.5m 1m)
R1 in out 1k
C1 out 0 100n

.ac dec 20 10 100k
.tran 5u 3m
.end
`,
  },

  {
    name: "rc-highpass",
    title: "RC High-Pass Filter",
    description: "First-order RC high-pass filter with AC frequency sweep and transient response.",
    category: "filter",
    parameters: [
      { name: "R1", description: "Shunt resistance — sets cutoff frequency with C1", defaultValue: "1k", unit: "Ω" },
      { name: "C1", description: "Series capacitance — sets cutoff frequency with R1", defaultValue: "100n", unit: "F" },
    ],
    netlist: `RC High-Pass Filter
* fc = 1 / (2*pi*R1*C1) = 1592 Hz with defaults
* V(out) rolls off at -20 dB/decade below fc

V1 in 0 AC 1 PULSE(0 1 0 1n 1n 0.5m 1m)
C1 in out 100n
R1 out 0 1k

.ac dec 20 10 100k
.tran 5u 3m
.end
`,
  },

  {
    name: "rl-lowpass",
    title: "RL Low-Pass Filter",
    description: "First-order RL low-pass filter — useful for power-supply chokes and EMI filtering.",
    category: "filter",
    parameters: [
      { name: "L1", description: "Series inductance", defaultValue: "10m", unit: "H" },
      { name: "R1", description: "Load resistance (also sets cutoff frequency)", defaultValue: "100", unit: "Ω" },
    ],
    netlist: `RL Low-Pass Filter
* fc = R1 / (2*pi*L1) = 1592 Hz with defaults

V1 in 0 AC 1 PULSE(0 1 0 1n 1n 0.5m 1m)
L1 in out 10m
R1 out 0 100

.ac dec 20 10 100k
.tran 10u 5m
.end
`,
  },

  {
    name: "series-rlc",
    title: "Series RLC Band-Pass",
    description: "Series RLC circuit showing resonance peak, bandwidth, and Q factor.",
    category: "filter",
    parameters: [
      { name: "R1", description: "Series resistance — controls Q factor (lower R → higher Q)", defaultValue: "10", unit: "Ω" },
      { name: "L1", description: "Inductance — sets resonant frequency with C1", defaultValue: "10m", unit: "H" },
      { name: "C1", description: "Capacitance — sets resonant frequency with L1", defaultValue: "10u", unit: "F" },
    ],
    netlist: `Series RLC Band-Pass
* f0 = 1 / (2*pi*sqrt(L1*C1)) = 503 Hz with defaults
* Q  = (1/R1) * sqrt(L1/C1)
* BW = R1 / (2*pi*L1)

V1 1 0 AC 1
R1 1 2 10
L1 2 3 10m
C1 3 0 10u

* Measure voltage across R1 (band-pass output)
.ac dec 30 10 10k
.end
`,
  },

  // ── Passive networks ─────────────────────────────────────────

  {
    name: "voltage-divider",
    title: "Resistive Voltage Divider",
    description: "Two-resistor voltage divider with DC operating point and DC sweep.",
    category: "passive",
    parameters: [
      { name: "R1", description: "Top resistor", defaultValue: "10k", unit: "Ω" },
      { name: "R2", description: "Bottom resistor — Vout = Vin * R2/(R1+R2)", defaultValue: "10k", unit: "Ω" },
      { name: "V1", description: "Supply voltage", defaultValue: "10", unit: "V" },
    ],
    netlist: `Resistive Voltage Divider
* Vout = V1 * R2 / (R1 + R2) = 5V with defaults

V1 1 0 DC 10
R1 1 2 10k
R2 2 0 10k

.op
.dc V1 0 15 0.5
.end
`,
  },

  // ── Rectifiers ───────────────────────────────────────────────

  {
    name: "half-wave-rectifier",
    title: "Half-Wave Rectifier",
    description: "Single-diode half-wave rectifier with smoothing capacitor and transient analysis.",
    category: "rectifier",
    parameters: [
      { name: "C1", description: "Smoothing capacitor — larger values reduce ripple", defaultValue: "100u", unit: "F" },
      { name: "R1", description: "Load resistance", defaultValue: "1k", unit: "Ω" },
    ],
    netlist: `Half-Wave Rectifier
* Peak output ≈ Vpeak - 0.7V (diode drop)
* Ripple depends on C1, R1, and frequency

.model D1N4007 D(Is=10n Rs=0.1 N=1.1 BV=1000 CJO=25p)

V1 1 0 SIN(0 10 50)
D1 1 2 D1N4007
C1 2 0 100u
R1 2 0 1k

.tran 100u 100m
.end
`,
  },

  {
    name: "full-wave-bridge",
    title: "Full-Wave Bridge Rectifier",
    description: "Diode bridge rectifier with filter capacitor — converts AC to DC.",
    category: "rectifier",
    parameters: [
      { name: "C1", description: "Filter capacitor", defaultValue: "470u", unit: "F" },
      { name: "R1", description: "Load resistance", defaultValue: "100", unit: "Ω" },
    ],
    netlist: `Full-Wave Bridge Rectifier
* Four diodes form a bridge; C1 smooths the pulsating DC.
* Peak output ≈ Vpeak - 1.4V (two diode drops)

.model DBRIDGE D(Is=10n Rs=0.05 N=1.1 BV=400 CJO=25p)

V1 ac1 ac2 SIN(0 12 50)
D1 ac1 vout DBRIDGE
D2 0   ac1  DBRIDGE
D3 ac2 vout DBRIDGE
D4 0   ac2  DBRIDGE
C1 vout 0 470u
R1 vout 0 100

.tran 200u 100m
.end
`,
  },

  // ── Amplifiers — BJT ─────────────────────────────────────────

  {
    name: "common-emitter",
    title: "BJT Common-Emitter Amplifier",
    description: "NPN common-emitter stage with voltage-divider bias, emitter degeneration, and bypass capacitor.",
    category: "amplifier",
    parameters: [
      { name: "R1", description: "Upper bias resistor", defaultValue: "100k", unit: "Ω" },
      { name: "R2", description: "Lower bias resistor", defaultValue: "22k", unit: "Ω" },
      { name: "Rc", description: "Collector resistor — sets gain with Re", defaultValue: "4.7k", unit: "Ω" },
      { name: "Re", description: "Emitter degeneration resistor", defaultValue: "1k", unit: "Ω" },
    ],
    netlist: `BJT Common-Emitter Amplifier
* Vcc = 12V, 2N3904 NPN
* Av ≈ -Rc / Re (without bypass cap)
* Av ≈ -Rc / re' (with bypass cap, re' = 26mV/Ic)

.model 2N3904 NPN(Is=2.52n Rs=0.568 Bf=300 Vaf=90 Ikf=0.1 Xtb=1.5
+  Br=4 Rc=0.6 Cjc=4p Mjc=0.338 Vjc=0.75 Fc=0.5
+  Cje=8p Mje=0.387 Vje=0.75 Tr=239n Tf=301p Itf=0.4 Vtf=4)

Vcc vcc 0 DC 12
Vin in 0 AC 0.01 SIN(0 0.01 1k)

* Bias network
R1 vcc base 100k
R2 base 0   22k

* Transistor
Q1 col base emit 2N3904

* Collector and emitter resistors
Rc vcc col 4.7k
Re emit 0  1k

* Bypass capacitor (shorts Re at signal frequencies)
Ce emit 0 100u

* Input and output coupling capacitors
Cin  in   base 10u
Cout col  out  10u
Rload out 0    10k

.op
.ac dec 20 10 1Meg
.tran 5u 5m
.end
`,
  },

  // ── Amplifiers — Op-Amp ──────────────────────────────────────

  {
    name: "inverting-amplifier",
    title: "Inverting Op-Amp Amplifier",
    description: "Inverting amplifier using an ideal op-amp model. Gain = -Rf/Rin.",
    category: "opamp",
    parameters: [
      { name: "Rin", description: "Input resistor", defaultValue: "10k", unit: "Ω" },
      { name: "Rf",  description: "Feedback resistor — Gain = -Rf/Rin", defaultValue: "100k", unit: "Ω" },
    ],
    netlist: `Inverting Op-Amp Amplifier
* Av = -Rf / Rin = -10 with defaults
* Uses behavioral ideal op-amp (VCVS with high gain + feedback)

* Ideal op-amp: high-gain VCVS
* E1: Vout = A*(V+ - V-), A=100k (approximates ideal)
* Feedback through Rf closes the loop.

Vs in 0 AC 0.1 SIN(0 0.1 1k)
Rin in inv 10k
Rf  inv out 100k

* Inverting input is inv, non-inverting is tied to ground
E1 out 0 0 inv 100k

Rload out 0 10k

.op
.ac dec 20 1 1Meg
.tran 5u 5m
.end
`,
  },

  {
    name: "non-inverting-amplifier",
    title: "Non-Inverting Op-Amp Amplifier",
    description: "Non-inverting amplifier using an ideal op-amp model. Gain = 1 + Rf/Rg.",
    category: "opamp",
    parameters: [
      { name: "Rg", description: "Ground resistor", defaultValue: "10k", unit: "Ω" },
      { name: "Rf", description: "Feedback resistor — Gain = 1 + Rf/Rg", defaultValue: "90k", unit: "Ω" },
    ],
    netlist: `Non-Inverting Op-Amp Amplifier
* Av = 1 + Rf/Rg = 10 with defaults
* Uses behavioral ideal op-amp (VCVS with high gain + feedback)

Vs in 0 AC 0.1 SIN(0 0.1 1k)

* Feedback divider
Rf inv out 90k
Rg inv 0  10k

* Ideal op-amp: Vout = A*(Vin_plus - Vin_minus)
E1 out 0 in inv 100k

Rload out 0 10k

.op
.ac dec 20 1 1Meg
.tran 5u 5m
.end
`,
  },

  // ── Power / regulation ───────────────────────────────────────

  {
    name: "zener-regulator",
    title: "Zener Diode Voltage Regulator",
    description: "Simple shunt Zener regulator maintaining a fixed output voltage despite supply and load variation.",
    category: "power",
    parameters: [
      { name: "Rs", description: "Series current-limiting resistor", defaultValue: "470", unit: "Ω" },
      { name: "Vz", description: "Zener breakdown voltage (set by model BV parameter)", defaultValue: "5.1", unit: "V" },
    ],
    netlist: `Zener Diode Voltage Regulator
* Vout ≈ Vz = 5.1V (Zener breakdown voltage)
* Rs limits current: Irs = (Vin - Vz) / Rs

.model ZENER D(Is=1n Rs=5 N=1 BV=5.1 IBV=10m)

Vin 1 0 DC 12
Rs  1 2 470

* Zener connected in reverse (cathode to output rail)
Dz 0 2 ZENER

Rload 2 0 1k

.op
.dc Vin 0 20 0.1
.end
`,
  },

];

// ──────────────────────────────────────────────────────────────
// Lookup helpers
// ──────────────────────────────────────────────────────────────

export function getTemplate(name: string): NetlistTemplate | undefined {
  return TEMPLATES.find((t) => t.name === name);
}

export function listTemplates(): Array<Omit<NetlistTemplate, "netlist">> {
  return TEMPLATES.map(({ netlist: _, ...meta }) => meta);
}

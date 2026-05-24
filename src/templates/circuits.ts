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
  category: "filter" | "amplifier" | "rectifier" | "passive" | "opamp" | "power" | "mosfet";
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

  // ── Switched-mode power supplies ─────────────────────────────

  {
    name: "buck-converter",
    title: "Buck Converter (Step-Down SMPS)",
    description: "Synchronous buck converter: Vout = Vin × D. Voltage-controlled switch, freewheeling diode, LC output filter. 100 kHz switching.",
    category: "power",
    parameters: [
      { name: "D",     description: "Duty cycle: edit Vpwm pulse-width pw = D × 10µs (e.g. 4.2µs → D=0.42 → Vout≈5V)", defaultValue: "4.2u", unit: "s (pulse width)" },
      { name: "Vin",   description: "Input supply voltage",        defaultValue: "12",   unit: "V" },
      { name: "L1",    description: "Output filter inductor",      defaultValue: "100u", unit: "H" },
      { name: "C1",    description: "Output filter capacitor",     defaultValue: "100u", unit: "F" },
      { name: "Rload", description: "Load resistance",             defaultValue: "10",   unit: "Ω" },
    ],
    netlist: `Buck Converter (Step-Down SMPS)
* Vin=12V, D=42% → Vout≈5V, fsw=100kHz
* Vout = Vin * D  (ideal); losses reduce Vout slightly
* Adjust duty cycle by changing Vpwm pulse width: pw = D * 10us
*
* IC values start near steady state for faster convergence.
* Use parse_results to read v(out) min/max/last — ripple = max - min.

.model SW_IDEAL SW(Ron=10m Roff=10Meg Vt=6 Vh=0)
.model DFWD D(Is=10n Rs=0.02 N=1.05 Tt=10n CJO=50p)

Vin 1 0 DC 12

* PWM drive: period=10µs (100kHz), pulse width=4.2µs (D≈42%)
Vpwm gate 0 PULSE(0 12 0 10n 10n 4.2u 10u)

* High-side switch: closes when V(gate) > 6V
S1 1 sw gate 0 SW_IDEAL

* Freewheeling diode: conducts when switch is open
D1 0 sw DFWD

* Output LC filter with small inductor ESR
L1   sw  lx  100u IC=0.5
Resr lx  out 0.1
C1   out 0   100u IC=5

Rload out 0 10

.tran 100n 2m UIC
.end
`,
  },

  {
    name: "boost-converter",
    title: "Boost Converter (Step-Up SMPS)",
    description: "Boost converter: Vout = Vin / (1−D). Low-side switch charges inductor; diode transfers energy to output cap. 100 kHz switching.",
    category: "power",
    parameters: [
      { name: "D",     description: "Duty cycle: edit Vpwm pulse-width pw = D × 10µs (e.g. 5.8µs → D=0.58 → Vout≈12V)", defaultValue: "5.8u", unit: "s (pulse width)" },
      { name: "Vin",   description: "Input supply voltage",        defaultValue: "5",    unit: "V" },
      { name: "L1",    description: "Energy-storage inductor",     defaultValue: "100u", unit: "H" },
      { name: "C1",    description: "Output filter capacitor",     defaultValue: "100u", unit: "F" },
      { name: "Rload", description: "Load resistance",             defaultValue: "20",   unit: "Ω" },
    ],
    netlist: `Boost Converter (Step-Up SMPS)
* Vin=5V, D=58% → Vout≈12V, fsw=100kHz
* Vout = Vin / (1 - D)  (ideal); diode drop reduces Vout slightly
* Adjust duty cycle by changing Vpwm pulse width: pw = D * 10us
*
* IC values start near steady state for faster convergence.
* Use parse_results to read v(out) min/max — ripple = max - min.

.model SW_IDEAL SW(Ron=10m Roff=10Meg Vt=2.5 Vh=0)
.model DFWD D(Is=10n Rs=0.02 N=1.05 Tt=10n CJO=50p)

Vin 1 0 DC 5

* PWM drive: period=10µs (100kHz), pulse width=5.8µs (D≈58%)
Vpwm gate 0 PULSE(0 5 0 10n 10n 5.8u 10u)

* Low-side switch: closes when V(gate) > 2.5V, charges L1
S1 sw 0 gate 0 SW_IDEAL

* Inductor stores energy when S1 closed, releases when S1 opens
L1 1 sw 100u IC=1.4

* Output diode and filter cap
D1  sw  out DFWD
C1  out 0   100u IC=12

Rload out 0 20

.tran 100n 2m UIC
.end
`,
  },

  // ── MOSFET circuits ──────────────────────────────────────────

  {
    name: "nmos-common-source",
    title: "NMOS Common-Source Amplifier",
    description: "N-channel enhancement MOSFET common-source amplifier with gate-divider bias, source degeneration, and bypass capacitor.",
    category: "mosfet",
    parameters: [
      { name: "Rd", description: "Drain resistor — sets DC operating point and gain", defaultValue: "3.3k", unit: "Ω" },
      { name: "Rs", description: "Source degeneration resistor", defaultValue: "1k", unit: "Ω" },
      { name: "R1", description: "Upper gate-bias resistor", defaultValue: "1Meg", unit: "Ω" },
      { name: "R2", description: "Lower gate-bias resistor — sets Vg with R1", defaultValue: "330k", unit: "Ω" },
    ],
    netlist: `NMOS Common-Source Amplifier
* 2N7000 N-channel enhancement MOSFET, Vto = 2.1V
* Av ≈ -gm*Rd  (with Cs bypassing Rs)
* Bias: Vg = Vdd * R2/(R1+R2) ≈ 3.7V, sets Vgs > Vto

.model 2N7000 NMOS(Level=1 Vto=2.1 Kp=80m W=1 L=1 Lambda=0.02)

Vdd vdd 0 DC 15

R1 vdd gate 1Meg
R2 gate 0  330k

M1 drain gate source 0 2N7000

Rd vdd drain 3.3k
Rs source 0   1k
Cs source 0   100u

Vin in 0 AC 0.1 SIN(0 0.1 1k)
Cin  in    gate  1u
Cout drain out   1u
Rload out  0     10k

.op
.ac dec 20 10 1Meg
.tran 5u 5m
.end
`,
  },

  {
    name: "nmos-source-follower",
    title: "NMOS Source Follower (Common-Drain)",
    description: "N-channel MOSFET source follower: voltage gain ≈ 1, high input impedance, low output impedance — useful as a buffer.",
    category: "mosfet",
    parameters: [
      { name: "Rs", description: "Source resistor — sets drain current and output impedance", defaultValue: "2.2k", unit: "Ω" },
      { name: "R1", description: "Upper gate-bias resistor", defaultValue: "1Meg", unit: "Ω" },
      { name: "R2", description: "Lower gate-bias resistor", defaultValue: "330k", unit: "Ω" },
    ],
    netlist: `NMOS Source Follower (Common-Drain)
* Drain tied to Vdd; output taken from source node
* Vout ≈ Vin - Vgs  →  Av ≈ 1 (slightly less)
* High Zin, low Zout — use as impedance buffer

.model 2N7000 NMOS(Level=1 Vto=2.1 Kp=80m W=1 L=1 Lambda=0.02)

Vdd vdd 0 DC 15

R1 vdd gate 1Meg
R2 gate 0   330k

* Drain to Vdd; output from source
M1 vdd gate source 0 2N7000
Rs source 0 2.2k

Vin in 0 AC 1 SIN(0 1 1k)
Cin  in     gate   1u
Cout source out    1u
Rload out   0      10k

.op
.ac dec 20 10 1Meg
.tran 5u 5m
.end
`,
  },

  {
    name: "cmos-inverter",
    title: "CMOS Inverter",
    description: "CMOS inverter with NMOS pull-down and PMOS pull-up. Shows DC transfer characteristic and transient switching.",
    category: "mosfet",
    parameters: [
      { name: "Vdd", description: "Supply voltage", defaultValue: "5", unit: "V" },
      { name: "Kn", description: "NMOS transconductance (Kp parameter)", defaultValue: "200u", unit: "A/V²" },
      { name: "Kp", description: "PMOS transconductance (Kp parameter, W=2× for symmetry)", defaultValue: "100u", unit: "A/V²" },
    ],
    netlist: `CMOS Inverter
* Logic threshold ≈ Vdd/2 when NMOS and PMOS strengths are matched
* NMOS Kp=200u, W=10u; PMOS Kp=100u, W=20u → symmetric switching

.model NMOS1 NMOS(Level=1 Vto=1.0 Kp=200u W=10u L=1u Lambda=0.02)
.model PMOS1 PMOS(Level=1 Vto=-1.0 Kp=100u W=20u L=1u Lambda=0.02)

Vdd vdd 0 DC 5
Vin in 0 PULSE(0 5 1u 1n 1n 5u 10u)

* PMOS: source=vdd, drain=out
Mp out in vdd vdd PMOS1
* NMOS: drain=out, source=0
Mn out in 0 0 NMOS1

Rprobe out 0 1Meg

.tran 10n 25u
.dc Vin 0 5 0.05
.end
`,
  },

  // ── Op-Amp — additional stages ───────────────────────────────

  {
    name: "voltage-follower",
    title: "Op-Amp Voltage Follower",
    description: "Unity-gain op-amp buffer. Vout = Vin. Infinite input impedance, near-zero output impedance.",
    category: "opamp",
    parameters: [],
    netlist: `Op-Amp Voltage Follower
* Av = 1 (unity gain); Vout = Vin
* Ideal op-amp model: VCVS with direct output feedback

Vs in 0 AC 1 SIN(0 1 1k)

* Unity gain: output fed back to inverting input
E1 out 0 in out 100k

Rload out 0 10k

.op
.ac dec 20 1 1Meg
.tran 5u 5m
.end
`,
  },

  {
    name: "summing-amplifier",
    title: "Inverting Summing Amplifier",
    description: "Three-input inverting summing amplifier. Vout = -(Rf/Rin) × (Va + Vb + Vc) with equal input resistors.",
    category: "opamp",
    parameters: [
      { name: "Rin", description: "Input resistors (Ra, Rb, Rc) — equal for unity-weight summing", defaultValue: "10k", unit: "Ω" },
      { name: "Rf",  description: "Feedback resistor — Gain = -Rf/Rin", defaultValue: "30k", unit: "Ω" },
    ],
    netlist: `Inverting Summing Amplifier
* Vout = -(Rf/Rin) * (Va + Vb + Vc)
* Gain = -Rf/Rin = -3 with defaults (30k / 10k)

Va a 0 AC 0.1 SIN(0 0.1 1k)
Vb b 0 DC 0.2
Vc c 0 SIN(0 0.05 3k)

Ra a inv 10k
Rb b inv 10k
Rc c inv 10k
Rf inv out 30k

E1 out 0 0 inv 100k

Rload out 0 10k

.op
.ac dec 20 1 10k
.tran 5u 5m
.end
`,
  },

  {
    name: "integrator",
    title: "Op-Amp Integrator",
    description: "Inverting integrator: Vout = -(1/R1·Cf) ∫Vin dt. Rf prevents DC saturation by limiting low-frequency gain to -Rf/R1.",
    category: "opamp",
    parameters: [
      { name: "R1", description: "Input resistor — sets integration rate with Cf", defaultValue: "10k", unit: "Ω" },
      { name: "Cf", description: "Feedback capacitor — integration capacitor", defaultValue: "100n", unit: "F" },
      { name: "Rf", description: "Bleed resistor — limits DC gain to -Rf/R1", defaultValue: "100k", unit: "Ω" },
    ],
    netlist: `Op-Amp Integrator
* Vout = -(1/(R1*Cf)) * integral(Vin) dt
* Time constant τ = R1*Cf = 1ms with defaults
* Rf limits DC gain to -Rf/R1 = -10 (prevents saturation)

Vs in 0 SIN(0 1 1k) AC 1

R1 in inv 10k
Cf inv out 100n
Rf inv out 100k

E1 out 0 0 inv 100k

Rload out 0 100k

.op
.ac dec 20 1 100k
.tran 2u 5m
.end
`,
  },

  {
    name: "differentiator",
    title: "Op-Amp Differentiator",
    description: "Practical inverting differentiator: Vout ≈ -R1·C1 × dVin/dt. Rs limits high-frequency gain to prevent oscillation.",
    category: "opamp",
    parameters: [
      { name: "C1", description: "Input capacitor — sets differentiation rate with R1", defaultValue: "100n", unit: "F" },
      { name: "R1", description: "Feedback resistor — gain = -R1/Rs at high frequencies", defaultValue: "10k", unit: "Ω" },
      { name: "Rs", description: "Input series resistor — limits HF gain to -R1/Rs", defaultValue: "100", unit: "Ω" },
    ],
    netlist: `Op-Amp Differentiator
* Vout = -R1*C1 * dVin/dt  (at frequencies where Rs << 1/ωC1)
* Time constant τ = R1*C1 = 1ms with defaults
* Rs limits HF gain to -R1/Rs = -100 to prevent oscillation

Vs in 0 SIN(0 1 100) AC 1

Rs in  n1  100
C1 n1  inv 100n
R1 inv out 10k

E1 out 0 0 inv 100k

Rload out 0 100k

.op
.ac dec 20 1 100k
.tran 50u 20m
.end
`,
  },

  {
    name: "sallen-key-lowpass",
    title: "Sallen-Key Active Low-Pass Filter",
    description: "2nd-order Butterworth low-pass filter (Q=0.707, -40 dB/decade). Non-inverting op-amp topology with gain K=1.586.",
    category: "filter",
    parameters: [
      { name: "R1", description: "Filter resistor (R1 = R2 = R for equal-component design)", defaultValue: "1k", unit: "Ω" },
      { name: "C1", description: "Filter capacitor (C1 = C2 = C for equal-component design)", defaultValue: "100n", unit: "F" },
      { name: "Rf", description: "Gain-setting feedback resistor — K = 1+Rf/Rg = 1.586 → Q=0.707", defaultValue: "5.86k", unit: "Ω" },
    ],
    netlist: `Sallen-Key Active Low-Pass Filter (Butterworth)
* 2nd order Butterworth: Q = 0.707, -40 dB/decade rolloff above fc
* fc = 1/(2*pi*R*C) = 1592 Hz with R=1k, C=100n
* Gain K = 1 + Rf/Rg = 1.586 sets Butterworth Q = 1/(3-K)

Vs in 0 AC 1 PULSE(0 1 0 1n 1n 5m 10m)

R1  in  n1  1k
R2  n1  n2  1k
C1  n1  out 100n
C2  n2  0   100n

* Non-inverting amplifier K = 1 + Rf/Rg = 1.586
Rf  inv out 5.86k
Rg  inv 0   10k
E1  out 0   n2 inv 100k

Rload out 0 100k

.ac dec 30 10 100k
.tran 5u 10m
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

import { z } from "zod";

export const GetComponentInfoSchema = z.object({
  component_type: z
    .enum(["R", "C", "L", "V", "I", "D", "Q", "M", "X"])
    .describe("Component type prefix"),
});

const COMPONENT_INFO: Record<string, object> = {
  R: {
    name: "Resistor",
    prefix: "R",
    syntax: "Rname node+ node- value",
    example: "R1 1 2 1k",
    units: "Ohms (Ω). Suffix: k=1e3, Meg=1e6, m=1e-3",
    spice_params: ["value", "tc1 (temp coeff)", "tc2"],
  },
  C: {
    name: "Capacitor",
    prefix: "C",
    syntax: "Cname node+ node- value [IC=v0]",
    example: "C1 2 0 100n IC=0",
    units: "Farads (F). Suffix: n=1e-9, u=1e-6, p=1e-12",
    spice_params: ["value", "IC (initial condition)"],
  },
  L: {
    name: "Inductor",
    prefix: "L",
    syntax: "Lname node+ node- value [IC=i0]",
    example: "L1 2 3 10m",
    units: "Henries (H). Suffix: m=1e-3, u=1e-6, n=1e-9",
    spice_params: ["value", "IC (initial condition)"],
  },
  V: {
    name: "Voltage Source",
    prefix: "V",
    syntax: "Vname node+ node- type value",
    example: "V1 1 0 DC 5  |  V2 1 0 SIN(0 1 1k)",
    types: ["DC value", "AC mag phase", "SIN(off amp freq td theta)", "PULSE(v1 v2 td tr tf pw per)"],
  },
  I: {
    name: "Current Source",
    prefix: "I",
    syntax: "Iname node+ node- type value",
    example: "I1 1 0 DC 1m",
    types: ["DC value", "AC mag", "SIN(…)", "PULSE(…)"],
  },
  D: {
    name: "Diode",
    prefix: "D",
    syntax: "Dname anode cathode model",
    example: "D1 3 0 1N4148",
    common_models: ["1N4148 (signal)", "1N4007 (rectifier)", "ZENER"],
    note: "Requires .model statement: .model 1N4148 D(Is=2.52n Rs=0.568 N=1.752)",
  },
  Q: {
    name: "BJT Transistor",
    prefix: "Q",
    syntax: "Qname collector base emitter model",
    example: "Q1 4 3 0 2N3904",
    common_models: ["2N3904 (NPN)", "2N3906 (PNP)", "BC547"],
    note: "Requires .model or .lib include for model parameters",
  },
  M: {
    name: "MOSFET",
    prefix: "M",
    syntax: "Mname drain gate source bulk model [W=w L=l]",
    example: "M1 out in 0 0 NMOS W=10u L=1u",
    note: "Requires .model: .model NMOS NMOS(level=1 Vth0=0.7)",
  },
  X: {
    name: "Subcircuit Instance",
    prefix: "X",
    syntax: "Xname node1 node2 … subckt_name [params]",
    example: "Xamp in out VCC GND opamp741",
    note: "References a .subckt definition elsewhere in the netlist or an included file",
  },
};

export function getComponentInfo(
  input: z.infer<typeof GetComponentInfoSchema>
): object {
  return COMPONENT_INFO[input.component_type] ?? { error: "Unknown component type" };
}

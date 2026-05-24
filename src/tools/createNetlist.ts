import { z } from "zod";

export const CreateNetlistSchema = z.object({
  title: z.string().describe("Circuit title (first line of the netlist)"),
  components: z
    .array(
      z.object({
        name: z.string().describe("Component name, e.g. R1, C1, V1"),
        nodes: z.array(z.string()).describe("Node connections, e.g. ['1','2']"),
        value: z.string().describe("Component value, e.g. '1k', '100n', 'DC 5'"),
        model: z.string().optional().describe("Model name for diodes/transistors"),
      })
    )
    .describe("List of circuit components"),
  analysis: z
    .array(z.string())
    .describe("SPICE analysis commands, e.g. ['.tran 1u 10m', '.dc V1 0 10 0.1']"),
  options: z.array(z.string()).optional().describe("Optional .options lines"),
});

export type CreateNetlistInput = z.infer<typeof CreateNetlistSchema>;

export function createNetlist(input: CreateNetlistInput): string {
  const lines: string[] = [];

  lines.push(input.title);

  for (const comp of input.components) {
    const nodes = comp.nodes.join(" ");
    const model = comp.model ? ` ${comp.model}` : "";
    lines.push(`${comp.name} ${nodes}${model} ${comp.value}`);
  }

  lines.push("");

  for (const cmd of input.analysis) {
    lines.push(cmd.startsWith(".") ? cmd : `.${cmd}`);
  }

  if (input.options?.length) {
    for (const opt of input.options) {
      lines.push(opt.startsWith(".options") ? opt : `.options ${opt}`);
    }
  }

  lines.push(".end");

  return lines.join("\n") + "\n";
}

import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";
import { MODELS_DIR } from "../utils/libResolver.js";

export const SaveLibFileSchema = z.object({
  name: z
    .string()
    .regex(/^[\w\-. ]+$/i, "Name must be alphanumeric with dashes, dots, or spaces")
    .describe("File name, e.g. 'bc547.lib' or '2N3904.lib'. A .lib extension is added if omitted."),
  content: z.string().describe("Full content of the SPICE model library file"),
});

export type SaveLibFileInput = z.infer<typeof SaveLibFileSchema>;

export interface SaveLibFileOutput {
  path: string;
  sizeBytes: number;
}

export async function saveLibFile(input: SaveLibFileInput): Promise<SaveLibFileOutput> {
  await fs.mkdir(MODELS_DIR, { recursive: true });

  let { name } = input;
  if (!name.toLowerCase().endsWith(".lib")) name += ".lib";

  const filePath = path.join(MODELS_DIR, name);
  await fs.writeFile(filePath, input.content, "utf8");
  const stat = await fs.stat(filePath);

  return { path: filePath, sizeBytes: stat.size };
}

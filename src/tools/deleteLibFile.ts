import { z } from "zod";
import { promises as fs } from "fs";
import path from "path";
import { MODELS_DIR } from "../utils/libResolver.js";

export const DeleteLibFileSchema = z.object({
  name: z.string().describe("File name to delete, e.g. 'bc547.lib'"),
});

export type DeleteLibFileInput = z.infer<typeof DeleteLibFileSchema>;

export interface DeleteLibFileOutput {
  deleted: string;
}

export async function deleteLibFile(input: DeleteLibFileInput): Promise<DeleteLibFileOutput> {
  const filePath = path.join(MODELS_DIR, path.basename(input.name));

  // Prevent path traversal — basename strips any ../ components
  try {
    await fs.unlink(filePath);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(`Model file '${input.name}' not found in models directory`);
    }
    throw err;
  }

  return { deleted: filePath };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateNetlist(content: string): ValidationResult {
  const errors: string[] = [];
  const lines = content.split("\n").map((l) => l.trim());

  if (lines.length < 2) {
    errors.push("Netlist must have at least a title line and .end");
  }

  if (!lines.some((l) => /^\.end\s*$/i.test(l))) {
    errors.push("Netlist is missing the required .end statement");
  }

  const hasAnalysis = lines.some((l) =>
    /^\.(dc|ac|tran|op|noise|tf|sens|disto|pz)\b/i.test(l)
  );
  if (!hasAnalysis) {
    errors.push("Netlist has no analysis command (.dc, .ac, .tran, .op, etc.)");
  }

  return { valid: errors.length === 0, errors };
}

export interface ParsedLog {
  warnings: string[];
  errors: string[];
  info: string[];
  measurements: Record<string, string>;
}

export function parseLog(logContent: string): ParsedLog {
  const warnings: string[] = [];
  const errors: string[] = [];
  const info: string[] = [];
  const measurements: Record<string, string> = {};

  for (const raw of logContent.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    if (/^warning:/i.test(line)) {
      warnings.push(line.replace(/^warning:\s*/i, ""));
    } else if (/^error:/i.test(line) || /^fatal:/i.test(line)) {
      errors.push(line);
    } else if (/^\.meas/i.test(line) || /\s*=\s*/.test(line)) {
      // capture .meas results like: v(out)_max = 4.99 at 0.005
      const m = line.match(/^(\S+)\s*=\s*(.+)$/);
      if (m) measurements[m[1]] = m[2].trim();
    } else {
      info.push(line);
    }
  }

  return { warnings, errors, info, measurements };
}

import { promises as fs } from "fs";

// ──────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────

export interface RawVariable {
  index: number;
  name: string;
  type: string;
}

export interface RawPlot {
  /** Circuit title from the netlist */
  title: string;
  date: string;
  /** e.g. "Transient Analysis", "AC Analysis", "Operating Point" */
  plotname: string;
  /** Derived from plotname */
  analysisType: "tran" | "ac" | "dc" | "op" | "unknown";
  /** "ascii" (Values:) or "binary" (Binary:) */
  format: "ascii" | "binary";
  /** ngspice flags: e.g. ["real"] or ["complex"] */
  flags: string[];
  variables: RawVariable[];
  pointCount: number;
  /**
   * Real-valued data for every variable.
   * For AC (complex) variables this holds the magnitude.
   * axis variable (time / frequency / swept voltage) is included.
   */
  data: Record<string, number[]>;
  /**
   * Only present for AC analysis (complex flag).
   * magnitudeDb = 20*log10(|H|), phase in degrees.
   */
  ac?: Record<string, { magnitudeDb: number[]; phase: number[] }>;
}

// ──────────────────────────────────────────────────────────────
// Main entry point
// ──────────────────────────────────────────────────────────────

/**
 * Parse an ngspice .raw file (ASCII or binary, single or multi-plot).
 * Returns one RawPlot per analysis section found in the file.
 */
export async function parseRawFile(rawPath: string): Promise<RawPlot[]> {
  const buf = await fs.readFile(rawPath);
  return parsePlots(buf);
}

// ──────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────

const CRLF = Buffer.from("\r\n");
const LF   = Buffer.from("\n");

/** Return the byte offset of the first occurrence of needle starting at fromOffset. */
function indexOfBuf(haystack: Buffer, needle: Buffer, from = 0): number {
  return haystack.indexOf(needle, from);
}

/** Classify analysis type from plotname string. */
function inferAnalysisType(plotname: string): RawPlot["analysisType"] {
  const p = plotname.toLowerCase();
  if (p.includes("transient"))                        return "tran";
  if (p.includes("operating point"))                  return "op";
  if (p.includes("dc transfer") || p === "dc")        return "dc";
  // "AC Analysis" or "AC frequency sweep" — but NOT "DC transfer characteristic"
  if (/\bac\b/.test(p) || p.includes("frequency"))   return "ac";
  if (p.includes("transfer") || p.includes("dc"))     return "dc";
  return "unknown";
}

// ──────────────────────────────────────────────────────────────
// Multi-plot driver
// ──────────────────────────────────────────────────────────────

function parsePlots(buf: Buffer): RawPlot[] {
  const plots: RawPlot[] = [];
  let offset = 0;

  while (offset < buf.length) {
    const result = parseSinglePlot(buf, offset);
    if (!result) break;
    plots.push(result.plot);
    offset = result.nextOffset;
  }

  return plots;
}

// ──────────────────────────────────────────────────────────────
// Single-plot parser
// ──────────────────────────────────────────────────────────────

interface PlotResult {
  plot: RawPlot;
  /** Byte offset where the NEXT plot section starts (or buf.length if done). */
  nextOffset: number;
}

function parseSinglePlot(buf: Buffer, startOffset: number): PlotResult | null {
  // Locate the data-section marker within this slice
  const binaryMarker  = locateMarker(buf, "Binary:", startOffset);
  const valuesMarker  = locateMarker(buf, "Values:", startOffset);

  // Determine which marker comes first
  const useBinary =
    binaryMarker !== -1 &&
    (valuesMarker === -1 || binaryMarker < valuesMarker);

  const markerOffset = useBinary ? binaryMarker : valuesMarker;
  if (markerOffset === -1) return null; // no data section found

  // The header runs from startOffset up to and including the marker line
  const headerEnd  = skipLine(buf, markerOffset); // byte after the marker's newline
  const headerText = buf.subarray(startOffset, markerOffset).toString("ascii");

  const { title, date, plotname, command, flags, pointCount, varCount, variables } =
    parseHeader(headerText);

  const isComplex = flags.includes("complex");
  let nextOffset: number;
  let data: Record<string, number[]>;
  let ac: RawPlot["ac"] | undefined;

  if (useBinary) {
    const bytesPerScalar = flags.includes("single") ? 4 : 8;
    const scalarsPerPoint = varCount * (isComplex ? 2 : 1);
    const binaryByteCount = pointCount * scalarsPerPoint * bytesPerScalar;
    const binBuf = buf.subarray(headerEnd, headerEnd + binaryByteCount);

    if (isComplex) {
      ({ data, ac } = parseBinaryComplex(binBuf, variables, pointCount, bytesPerScalar));
    } else {
      data = parseBinaryReal(binBuf, variables, pointCount, bytesPerScalar);
    }

    nextOffset = headerEnd + binaryByteCount;
  } else {
    // ASCII Values: section runs until the next "Title:" or end of buffer
    const nextTitle = locateTitleAfter(buf, headerEnd);
    const valuesEnd = nextTitle === -1 ? buf.length : nextTitle;
    const valuesText = buf.subarray(headerEnd, valuesEnd).toString("ascii");

    if (isComplex) {
      ({ data, ac } = parseAsciiComplex(valuesText, variables));
    } else {
      data = parseAsciiReal(valuesText, variables);
    }

    nextOffset = nextTitle === -1 ? buf.length : nextTitle;
  }

  void command; // included in header, not exposed on RawPlot

  return {
    plot: {
      title,
      date,
      plotname,
      analysisType: inferAnalysisType(plotname),
      format: useBinary ? "binary" : "ascii",
      flags,
      variables,
      pointCount,
      data,
      ...(ac ? { ac } : {}),
    },
    nextOffset,
  };
}

// ──────────────────────────────────────────────────────────────
// Marker / offset helpers
// ──────────────────────────────────────────────────────────────

/** Find the byte offset of `keyword:` at the start of a line, after startOffset. */
function locateMarker(buf: Buffer, keyword: string, startOffset: number): number {
  const kw = Buffer.from(keyword);
  let pos = startOffset;
  while (pos < buf.length) {
    const idx = buf.indexOf(kw, pos);
    if (idx === -1) return -1;
    // Verify it's at the start of a line
    if (idx === 0 || buf[idx - 1] === 0x0a /* \n */) return idx;
    pos = idx + 1;
  }
  return -1;
}

/** Find the next "Title:" that starts at a line boundary, after fromOffset. */
function locateTitleAfter(buf: Buffer, fromOffset: number): number {
  return locateMarker(buf, "Title:", fromOffset);
}

/** Return the byte offset immediately after the line containing `pos`. */
function skipLine(buf: Buffer, pos: number): number {
  // Skip to end of this line (\n)
  const nl = buf.indexOf(LF, pos);
  if (nl === -1) return buf.length;
  return nl + 1;
}

// ──────────────────────────────────────────────────────────────
// Header parser
// ──────────────────────────────────────────────────────────────

interface HeaderInfo {
  title: string;
  date: string;
  plotname: string;
  command: string;
  flags: string[];
  pointCount: number;
  varCount: number;
  variables: RawVariable[];
}

function parseHeader(headerText: string): HeaderInfo {
  const kv: Record<string, string> = {};
  const variables: RawVariable[] = [];
  let inVars = false;

  for (const rawLine of headerText.split("\n")) {
    const line = rawLine.replace(/\r$/, "");

    if (inVars) {
      if (line.startsWith("\t")) {
        // "\t<index>\t<name>\t<type>[\t<units>]"
        const parts = line.trim().split(/\t+/);
        variables.push({
          index: parseInt(parts[0] ?? "0", 10),
          name: (parts[1] ?? "").toLowerCase(),
          type: parts[2] ?? "",
        });
        continue;
      } else {
        inVars = false;
      }
    }

    if (/^Variables:/i.test(line)) {
      inVars = true;
      continue;
    }

    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (m) kv[m[1].trim().toLowerCase()] = m[2].trim();
  }

  return {
    title:      kv["title"]    ?? "",
    date:       kv["date"]     ?? "",
    plotname:   kv["plotname"] ?? "",
    command:    kv["command"]  ?? "",
    flags:     (kv["flags"]    ?? "real").split(/\s+/).filter(Boolean),
    pointCount: parseInt(kv["no. points"]    ?? "0", 10),
    varCount:   parseInt(kv["no. variables"] ?? String(variables.length), 10),
    variables,
  };
}

// ──────────────────────────────────────────────────────────────
// Binary parsers
// ──────────────────────────────────────────────────────────────

function parseBinaryReal(
  buf: Buffer,
  variables: RawVariable[],
  pointCount: number,
  bytesPerScalar: number
): Record<string, number[]> {
  const data: Record<string, number[]> = {};
  for (const v of variables) data[v.name] = [];

  const readScalar =
    bytesPerScalar === 4
      ? (o: number) => buf.readFloatLE(o)
      : (o: number) => buf.readDoubleLE(o);

  let offset = 0;
  for (let p = 0; p < pointCount; p++) {
    for (const v of variables) {
      if (offset + bytesPerScalar > buf.length) break;
      data[v.name].push(readScalar(offset));
      offset += bytesPerScalar;
    }
  }

  return data;
}

function parseBinaryComplex(
  buf: Buffer,
  variables: RawVariable[],
  pointCount: number,
  bytesPerScalar: number
): { data: Record<string, number[]>; ac: RawPlot["ac"] } {
  const re: Record<string, number[]> = {};
  const im: Record<string, number[]> = {};
  for (const v of variables) { re[v.name] = []; im[v.name] = []; }

  const readScalar =
    bytesPerScalar === 4
      ? (o: number) => buf.readFloatLE(o)
      : (o: number) => buf.readDoubleLE(o);

  let offset = 0;
  for (let p = 0; p < pointCount; p++) {
    for (const v of variables) {
      if (offset + bytesPerScalar * 2 > buf.length) break;
      re[v.name].push(readScalar(offset));
      im[v.name].push(readScalar(offset + bytesPerScalar));
      offset += bytesPerScalar * 2;
    }
  }

  return buildComplexResult(variables, re, im);
}

// ──────────────────────────────────────────────────────────────
// ASCII parsers
// ──────────────────────────────────────────────────────────────

/**
 * ngspice ASCII Values format:
 *
 *   <pointIndex>\t\t<var0_value>
 *   \t<var1_value>
 *   \t<var2_value>
 *   <pointIndex+1>\t\t<var0_value>
 *   ...
 */
function parseAsciiReal(
  valuesText: string,
  variables: RawVariable[]
): Record<string, number[]> {
  const data: Record<string, number[]> = {};
  for (const v of variables) data[v.name] = [];

  let varIdx = 0;

  for (const rawLine of valuesText.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line) continue;

    if (line.startsWith("\t")) {
      // Continuation variable on this data point
      const val = parseFloat(line.trim());
      if (!isNaN(val) && varIdx < variables.length) {
        data[variables[varIdx].name].push(val);
        varIdx++;
      }
    } else {
      // New data point: "<index>\t\t<var0_value>"
      const parts = line.split(/\t+/);
      // parts[0] = point index; last non-empty part is the value
      const valStr = parts[parts.length - 1];
      const val = parseFloat(valStr);
      if (!isNaN(val) && variables.length > 0) {
        data[variables[0].name].push(val);
        varIdx = 1;
      }
    }
  }

  return data;
}

function parseAsciiComplex(
  valuesText: string,
  variables: RawVariable[]
): { data: Record<string, number[]>; ac: RawPlot["ac"] } {
  // ngspice ASCII complex format: each value is "<real>,<imag>"
  const re: Record<string, number[]> = {};
  const im: Record<string, number[]> = {};
  for (const v of variables) { re[v.name] = []; im[v.name] = []; }

  let varIdx = 0;

  const parseComplex = (s: string): [number, number] => {
    const m = s.match(/([-\d.e+]+),\s*([-\d.e+]+)/i);
    if (m) return [parseFloat(m[1]), parseFloat(m[2])];
    const real = parseFloat(s);
    return [isNaN(real) ? 0 : real, 0];
  };

  for (const rawLine of valuesText.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line) continue;

    if (line.startsWith("\t")) {
      const [r, i] = parseComplex(line.trim());
      if (varIdx < variables.length) {
        re[variables[varIdx].name].push(r);
        im[variables[varIdx].name].push(i);
        varIdx++;
      }
    } else {
      const parts = line.split(/\t+/);
      const valStr = parts[parts.length - 1];
      const [r, i] = parseComplex(valStr);
      if (variables.length > 0) {
        re[variables[0].name].push(r);
        im[variables[0].name].push(i);
        varIdx = 1;
      }
    }
  }

  return buildComplexResult(variables, re, im);
}

// ──────────────────────────────────────────────────────────────
// Shared complex → magnitude/phase builder
// ──────────────────────────────────────────────────────────────

function buildComplexResult(
  variables: RawVariable[],
  re: Record<string, number[]>,
  im: Record<string, number[]>
): { data: Record<string, number[]>; ac: RawPlot["ac"] } {
  const data: Record<string, number[]> = {};
  const ac: Record<string, { magnitudeDb: number[]; phase: number[] }> = {};

  for (const v of variables) {
    const r = re[v.name];
    const i = im[v.name];

    // Axis variable (frequency, time): store real part only
    if (v.type === "frequency" || v.type === "time") {
      data[v.name] = r;
      continue;
    }

    const mag = r.map((rv, idx) => Math.sqrt(rv * rv + i[idx] * i[idx]));
    data[v.name] = mag;
    ac[v.name] = {
      magnitudeDb: mag.map((m) => (m > 0 ? 20 * Math.log10(m) : -Infinity)),
      phase: r.map((rv, idx) => Math.atan2(i[idx], rv) * (180 / Math.PI)),
    };
  }

  return { data, ac };
}

// ──────────────────────────────────────────────────────────────
// Convenience: quick summary for a parsed plot
// ──────────────────────────────────────────────────────────────

export interface VariableSummary {
  name: string;
  type: string;
  min: number;
  max: number;
  first: number;
  last: number;
}

export function summarizePlot(plot: RawPlot): VariableSummary[] {
  return plot.variables.map((v) => {
    const series = plot.data[v.name] ?? [];
    return {
      name: v.name,
      type: v.type,
      min:   series.length ? Math.min(...series) : 0,
      max:   series.length ? Math.max(...series) : 0,
      first: series[0]  ?? 0,
      last:  series[series.length - 1] ?? 0,
    };
  });
}

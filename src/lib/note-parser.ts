/**
 * Single-note parser. Extracts structured fields from one set of DOCX paragraphs.
 * Mirrors _NoteParser from parse_notes.py.
 */

import type { WbsAssessment, Goal } from "../models.js";

const MONTH_MAP: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04",
  may: "05", june: "06", july: "07", august: "08",
  september: "09", october: "10", november: "11", december: "12",
  jan: "01", feb: "02", mar: "03", apr: "04",
  jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Parse a date string in various formats to YYYY-MM-DD, or return null. */
function parseNoteDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // MM/DD/YYYY or M/D/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    return `${mdy[3]}-${mdy[1].padStart(2, "0")}-${mdy[2].padStart(2, "0")}`;
  }

  // Month DD, YYYY or Month DD YYYY
  const named = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (named) {
    const mon = MONTH_MAP[named[1].toLowerCase()];
    if (mon) return `${named[3]}-${mon}-${named[2].padStart(2, "0")}`;
  }

  // VA CPRS format: "MMM DD,YYYY@HH:MM" or "MMM ,YYYY@HH:MM" (day de-identified)
  // Runs may concatenate without spaces, e.g. "DEC08, 2025@11:00"
  // Year may be truncated in de-identified notes (e.g. "202") — require 4 digits.
  const cprs = s.match(/([A-Za-z]{3})\s*(\d*),?\s*(\d{3,4})@/);
  if (cprs) {
    const mon = MONTH_MAP[cprs[1].toLowerCase()];
    if (mon && cprs[3].length === 4) {
      const day = cprs[2] ? cprs[2].padStart(2, "0") : "01";
      return `${cprs[3]}-${mon}-${day}`;
    }
  }

  return null;
}

interface RawNote {
  source: string;
  session_number: number | null;
  session_date: string | null;       // YYYY-MM-DD parsed from note heading
  visit_type: string | null;
  patient_name: string | null;
  values: string[];
  vision: string | null;
  strengths: string[];
  wbs: Partial<WbsAssessment> | null;
  map: string | null;
  long_term_goals: Partial<Goal>[];
  short_term_goals: Partial<Goal>[];
  is_final_session: boolean;
  discharge_plan: string | null;
}

export class NoteParser {
  private readonly paras: string[];
  private readonly n: number;
  private readonly source: string;

  constructor(paras: string[], source = "") {
    this.paras = paras;
    this.n = paras.length;
    this.source = source;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private nextNonempty(idx: number): [number, string] {
    for (let i = idx + 1; i < this.n; i++) {
      if (this.paras[i]) return [i, this.paras[i]];
    }
    return [-1, ""];
  }

  private findIntInWindow(start: number, window = 10): number | null {
    for (let i = start + 1; i < Math.min(start + window, this.n); i++) {
      const text = this.paras[i];
      if (/^\d+$/.test(text)) return parseInt(text, 10);
    }
    return null;
  }

  private collectUntil(start: number, stopRe: RegExp | null, maxLines = 20): string {
    const parts: string[] = [];
    for (let i = start; i < Math.min(start + maxLines, this.n); i++) {
      const text = this.paras[i];
      if (!text) break;
      if (stopRe && stopRe.test(text)) break;
      parts.push(text);
    }
    return parts.join(" ");
  }

  // ---------------------------------------------------------------------------
  // Section parsers
  // ---------------------------------------------------------------------------

  private parseWbs(avgIdx: number): Partial<WbsAssessment> {
    const avgMatch = this.paras[avgIdx].match(/WBS Average Score:\s*([\d.]+)/);
    const average = avgMatch ? parseFloat(avgMatch[1]) : undefined;

    let satisfied: number | undefined;
    let involved: number | undefined;
    let functioning: number | undefined;

    for (let j = avgIdx; j < Math.min(avgIdx + 25, this.n); j++) {
      const p = this.paras[j];
      if (/1\.\s*Fully satisfied/i.test(p)) {
        const [, v] = this.nextNonempty(j);
        const n = parseInt(v, 10);
        if (!isNaN(n)) satisfied = n;
      } else if (/2\.\s*Regularly involved/i.test(p)) {
        const [, v] = this.nextNonempty(j);
        const n = parseInt(v, 10);
        if (!isNaN(n)) involved = n;
      } else if (/3\.\s*Functioning your best/i.test(p)) {
        const [, v] = this.nextNonempty(j);
        const n = parseInt(v, 10);
        if (!isNaN(n)) functioning = n;
      }
    }

    return { average, satisfied, involved, functioning };
  }

  private parseMap(mapIdx: number): string | null {
    const segments: string[] = [];
    let current: string[] = [];

    let i = mapIdx + 1;
    while (i < this.n) {
      const p = this.paras[i];

      if (/^(Veteran was seen|VETERANS GOALS|PLAN|ADDITIONAL)/.test(p)) break;
      if (/^Veteran described:/i.test(p)) { i++; continue; }

      if (p) {
        current.push(p);
      } else if (current.length) {
        segments.push(current.join(" "));
        current = [];
      }
      i++;
    }

    if (current.length) segments.push(current.join(" "));
    return segments.join("\n\n").trim() || null;
  }

  private parseLongTermGoals(sectionIdx: number, sectionEnd: number): Partial<Goal>[] {
    const goals: Partial<Goal>[] = [];
    let current: Partial<Goal & { text: string }> = {};

    let i = sectionIdx + 1;
    while (i < sectionEnd) {
      const p = this.paras[i];

      if (/Collaboratively identified new long-term/.test(p)) {
        const [j] = this.nextNonempty(i);
        if (j > 0) {
          const textParts: string[] = [];
          let k = j;
          while (k < sectionEnd && this.paras[k] && !/Utilized (Importance|Confidence) Ruler/.test(this.paras[k])) {
            textParts.push(this.paras[k]);
            k++;
          }
          current.text = textParts.join(" ");
        }
      } else if (p.includes("Utilized Importance Ruler:")) {
        const val = this.findIntInWindow(i);
        if (val !== null) current.importance = val;
        // Collect rationale note after "…important…because:" label (include label line)
        for (let j = i + 1; j < Math.min(i + 15, sectionEnd); j++) {
          if (/important.*because|because.*important/i.test(this.paras[j])) {
            const body = this.collectUntil(j + 1, /Utilized (Importance|Confidence) Ruler:/i, 10);
            current.importance_note = body ? `${this.paras[j]} ${body}` : this.paras[j];
            break;
          }
        }
      } else if (p.includes("Utilized Confidence Ruler:")) {
        const val = this.findIntInWindow(i);
        if (val !== null) current.confidence = val;
        // Collect rationale note after "…confident…because:" label (include label line)
        for (let j = i + 1; j < Math.min(i + 15, sectionEnd); j++) {
          if (/confident.*because|because.*confident/i.test(this.paras[j])) {
            const body = this.collectUntil(j + 1, /Utilized (Importance|Confidence) Ruler:|Collaboratively identified/i, 10);
            current.confidence_note = body ? `${this.paras[j]} ${body}` : this.paras[j];
            break;
          }
        }
      }

      i++;
    }

    if (current.text) goals.push(current);
    return goals;
  }

  private parseShortTermGoals(sectionIdx: number, sectionEnd: number): Partial<Goal>[] {
    const goals: Partial<Goal>[] = [];
    let current: Partial<Goal> | null = null;

    let i = sectionIdx + 1;
    while (i < sectionEnd) {
      const p = this.paras[i];

      if (/^Goal \d+:/.test(p)) {
        if (current?.text) goals.push(current);
        current = { goal_type: "short-term", importance: undefined, confidence: undefined, lifecycle_status: "active" };

        const textParts: string[] = [];
        let j = i + 1;
        while (j < sectionEnd && this.paras[j] && !/Utilized (Importance|Confidence) Ruler|Veteran reports goal was:/.test(this.paras[j])) {
          textParts.push(this.paras[j]);
          j++;
        }
        current.text = textParts.join(" ");
      } else if (current !== null) {
        if (p.includes("Utilized Importance Ruler:")) {
          const val = this.findIntInWindow(i);
          if (val !== null) current.importance = val;
          for (let j = i + 1; j < Math.min(i + 15, sectionEnd); j++) {
            if (/important.*because|because.*important/i.test(this.paras[j])) {
              const body = this.collectUntil(j + 1, /Utilized (Importance|Confidence) Ruler:|^Goal \d+:/i, 10);
              current.importance_note = body ? `${this.paras[j]} ${body}` : this.paras[j];
              break;
            }
          }
        } else if (p.includes("Utilized Confidence Ruler:")) {
          const val = this.findIntInWindow(i);
          if (val !== null) current.confidence = val;
          for (let j = i + 1; j < Math.min(i + 15, sectionEnd); j++) {
            if (/confident.*because|because.*confident/i.test(this.paras[j])) {
              const body = this.collectUntil(j + 1, /Utilized (Importance|Confidence) Ruler:|^Goal \d+:|Veteran reports goal was:/i, 10);
              current.confidence_note = body ? `${this.paras[j]} ${body}` : this.paras[j];
              break;
            }
          }
        } else if (p.includes("Veteran reports goal was:")) {
          const [, statusText] = this.nextNonempty(i);
          if (statusText) {
            const normalized = statusText.toLowerCase().replace(/\s+/g, "-");
            current.lifecycle_status = normalized === "met" ? "completed"
              : normalized === "not-met" ? "cancelled"
              : "active";
          }
        }
      }

      i++;
    }

    if (current?.text) goals.push(current);
    return goals;
  }

  private parsePlan(planSectionIdx: number): string | null {
    const parts: string[] = [];
    let collecting = false;

    for (let i = planSectionIdx + 1; i < this.n; i++) {
      const p = this.paras[i];
      if (p === "Plan:") { collecting = true; continue; }
      if (!collecting) continue;
      if (/^(Arranged follow-up|Veteran agreed to follow-up)/.test(p)) continue;
      if (p === "In-person visit") continue;
      if (p) {
        parts.push(p);
      } else if (parts.length > 0) {
        break;
      }
    }

    return parts.join(" ").trim() || null;
  }

  // ---------------------------------------------------------------------------
  // Main entry point
  // ---------------------------------------------------------------------------

  parse(): RawNote {
    const result: RawNote = {
      source: this.source,
      session_number: null,
      session_date: null,
      visit_type: null,
      patient_name: null,
      values: [],
      vision: null,
      strengths: [],
      wbs: null,
      map: null,
      long_term_goals: [],
      short_term_goals: [],
      is_final_session: false,
      discharge_plan: null,
    };

    // First pass: find section boundaries
    let ltStart = -1, ltEnd = -1, stStart = -1, stEnd = -1;
    for (let idx = 0; idx < this.n; idx++) {
      const p = this.paras[idx];
      if (/^Long-Term S\.M\.A\.R\.T\./.test(p)) {
        ltStart = idx;
      } else if (/^Short-Term S\.M\.A\.R\.T\./.test(p)) {
        if (ltStart >= 0 && ltEnd < 0) ltEnd = idx;
        stStart = idx;
      } else if (/^Today's coaching session aligns/.test(p)) {
        if (stStart >= 0 && stEnd < 0) stEnd = idx;
      } else if (/^ADDITIONAL SESSION INFORMATION/.test(p)) {
        if (stStart >= 0 && stEnd < 0) stEnd = idx;
      }
    }

    if (ltEnd < 0 && ltStart >= 0) ltEnd = stStart > ltStart ? stStart : this.n;
    if (stEnd < 0 && stStart >= 0) stEnd = this.n;

    // Second pass: sequential extraction
    for (let i = 0; i < this.n; i++) {
      const p = this.paras[i];

      if (/^\*Session number:/.test(p)) {
        const [, val] = this.nextNonempty(i);
        const n = parseInt(val, 10);
        if (!isNaN(n)) result.session_number = n;

      } else if (/^\*?Date of Note:/i.test(p)) {
        // Value may be on the same line ("Date of Note: 01/15/2024") or next paragraph
        const inline = p.match(/^\*?Date of Note:\s*(.+)/i);
        const raw = inline ? inline[1] : this.nextNonempty(i)[1];
        const d = parseNoteDate(raw);
        if (d) result.session_date = d;

      } else if (/^\*Type of Visit:/.test(p)) {
        const [, val] = this.nextNonempty(i);
        result.visit_type = val ? val.toLowerCase() : null;

      } else if (/^What really matters to /.test(p)) {
        const m = p.match(/^What really matters to (.+?)\.?\s*$/);
        if (m) result.patient_name = m[1].trim();

      } else if (/^Additional information/.test(p)) {
        const blockLines: string[] = [];
        let j = i + 1;
        while (j < this.n && this.paras[j] && !/^(Time spent|Well-Being|What really matters|Mission|VETERANS|ADDITIONAL SESSION|PLAN)/.test(this.paras[j])) {
          blockLines.push(this.paras[j]);
          j++;
        }
        const block = blockLines.join(" ");

        const mVals = block.match(/Veteran's values:\s*(.+?)(?:Vision for future:|$)/is);
        if (mVals) {
          const raw = mVals[1].trim().replace(/,$/, "");
          result.values = raw.split(",").map((v) => v.trim()).filter(Boolean);
        }

        const mVis = block.match(/Vision for future:\s*(.+?)$/is);
        if (mVis) result.vision = mVis[1].trim();

        for (const line of blockLines) {
          const mStr = line.match(/^Strengths discussed and identified:\s*(.+)/i);
          if (mStr) {
            result.strengths = mStr[1].split(",").map((s) => s.trim()).filter(Boolean);
            break;
          }
        }

      } else if (p.includes("WBS Average Score:")) {
        result.wbs = this.parseWbs(i);
        if (result.wbs) {
          if (result.session_number !== null) result.wbs.session_number = result.session_number;
          if (result.session_date !== null) result.wbs.session_date = result.session_date;
        }

      } else if (p.includes("Mission, Aspiration, Purpose (MAP)")) {
        const mapText = this.parseMap(i);
        if (mapText) result.map = mapText;

      } else if (p.includes("This was a final coaching session")) {
        result.is_final_session = true;

      } else if (ltStart >= 0 && i === ltStart) {
        result.long_term_goals = this.parseLongTermGoals(ltStart, ltEnd);

      } else if (stStart >= 0 && i === stStart) {
        result.short_term_goals = this.parseShortTermGoals(stStart, stEnd);

      } else if (/^PLAN$/.test(p)) {
        result.discharge_plan = this.parsePlan(i);
      }
    }

    return result;
  }
}

export type { RawNote };

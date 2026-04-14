/**
 * Merges multiple parsed notes into a single PhpData object.
 * Most-recent-wins strategy, mirroring merge_notes() from parse_notes.py.
 */

import type { PhpData, Patient, WbsAssessment, ActionStep, Goal } from "../models.js";
import type { RawNote } from "./note-parser.js";

function parsePatientName(nameStr: string): Patient {
  const parts = nameStr.trim().split(/\s+/);
  if (parts.length >= 2) {
    return { given: parts.slice(0, -1), family: parts[parts.length - 1] };
  }
  return { given: [nameStr], family: "" };
}

export function mergeNotes(parsed: RawNote[]): PhpData {
  const sorted = [...parsed].sort((a, b) => (a.session_number ?? 0) - (b.session_number ?? 0));

  let patient: Patient | undefined;
  let values: string[] = [];
  let vision: string | undefined;
  let strengths: string[] = [];
  let wbs: Partial<WbsAssessment> | undefined;
  let mapData: Partial<{ mission: string; aspiration: string; purpose: string }> = {};
  let whatMattersMost: string | undefined;
  let isFinal = false;
  let dischargePlan: string | undefined;

  // Long-term goals: keyed by text fingerprint (first 60 chars)
  const ltGoals = new Map<string, Partial<Goal & { text: string }>>();
  // Short-term goals: keyed by index
  const stGoals = new Map<number, Partial<ActionStep & { status: string; text: string }>>();

  for (const note of sorted) {
    if (note.patient_name && !patient) {
      patient = parsePatientName(note.patient_name);
    }
    if (note.values.length > 0) values = note.values;
    if (note.vision) vision = note.vision;
    if (note.strengths.length > 0) strengths = note.strengths;
    if (note.wbs) wbs = note.wbs;
    if (note.map) {
      for (const [k, v] of Object.entries(note.map)) {
        if (v) (mapData as Record<string, string>)[k] = v;
      }
    }
    if (note.what_matters_most) whatMattersMost = note.what_matters_most;
    if (note.is_final_session) isFinal = true;
    if (note.discharge_plan) dischargePlan = note.discharge_plan;

    // Long-term goals: merge by text fingerprint
    for (const goal of note.long_term_goals) {
      const text = (goal.text ?? "").trim();
      if (!text) continue;
      const key = text.slice(0, 60);
      const existing = ltGoals.get(key) ?? {};
      for (const field of ["text", "importance", "confidence", "lifecycle_status", "start_date"] as const) {
        const v = (goal as Record<string, unknown>)[field];
        if (v != null) (existing as Record<string, unknown>)[field] = v;
      }
      ltGoals.set(key, existing);
    }

    // Short-term goals: merge by position index
    for (let idx = 0; idx < note.short_term_goals.length; idx++) {
      const step = note.short_term_goals[idx];
      const existing = stGoals.get(idx) ?? {};
      for (const field of ["text", "importance", "confidence", "status", "start_date", "end_date"] as const) {
        const v = (step as Record<string, unknown>)[field];
        if (v != null) (existing as Record<string, unknown>)[field] = v;
      }
      stGoals.set(idx, existing);
    }
  }

  // Build action steps list (sorted by index)
  const actionSteps: ActionStep[] = [];
  for (const idx of [...stGoals.keys()].sort((a, b) => a - b)) {
    const s = stGoals.get(idx)!;
    if (!s.text) continue;
    actionSteps.push({
      text: s.text,
      importance: s.importance,
      confidence: s.confidence,
      status: s.status,
      start_date: s.start_date,
      end_date: s.end_date,
    });
  }

  // Build goals list; attach action steps to the first long-term goal
  const goals: Goal[] = [];
  let goalIdx = 0;
  for (const [, g] of ltGoals) {
    if (!g.text) continue;
    goals.push({
      text: g.text,
      importance: g.importance,
      confidence: g.confidence,
      lifecycle_status: g.lifecycle_status ?? "active",
      start_date: g.start_date,
      action_steps: goalIdx === 0 ? actionSteps : [],
    });
    goalIdx++;
  }

  return {
    patient,
    what_matters_most: whatMattersMost,
    map: Object.keys(mapData).length > 0
      ? { mission: mapData.mission, aspiration: mapData.aspiration, purpose: mapData.purpose }
      : undefined,
    values,
    vision,
    strengths,
    wbs: wbs as WbsAssessment | undefined,
    goals,
    is_final_session: isFinal,
    discharge_plan: dischargePlan,
  };
}

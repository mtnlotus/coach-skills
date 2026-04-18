/**
 * FHIR R4 bundle builder. Assembles a PCO IG collection Bundle from PhpData.
 * Mirrors generate_fhir.py resource builders.
 */

import type { PhpData, Goal, ActionStep } from "../models.js";
// Minimal FHIR R4 shape types for bundle construction.
// We define these locally to avoid fighting @smile-cdr/fhirts class-vs-interface
// complexity; the output is plain JSON that validates against the FHIR spec.

interface IReference { reference: string }
interface ICoding { system?: string; code?: string; display?: string }
interface ICodeableConcept { coding?: ICoding[]; text?: string }
interface IHumanName { family?: string; given?: string[] }
interface IPeriod { start?: string; end?: string }
interface IExtension { url: string; valueReference?: IReference }
interface IMeta { profile?: string[] }

interface IObservation_Component {
  code: ICodeableConcept;
  valueInteger?: number;
}

interface IAnnotation {
  text: string;
}

interface IPatient {
  resourceType: "Patient";
  name?: IHumanName[];
  birthDate?: string;
}

interface IObservation {
  resourceType: "Observation";
  meta?: IMeta;
  status: string;
  code: ICodeableConcept;
  subject: IReference;
  focus?: IReference[];
  effectiveDateTime?: string;
  valueString?: string;
  component?: IObservation_Component[];
  note?: IAnnotation[];
}

interface IGoal {
  resourceType: "Goal";
  meta?: IMeta;
  lifecycleStatus: string;
  description: { text: string };
  subject: IReference;
  startDate?: string;
}

interface IServiceRequest {
  resourceType: "ServiceRequest";
  status: string;
  intent: string;
  code: ICodeableConcept;
  subject: IReference;
  extension?: IExtension[];
  occurrencePeriod?: IPeriod;
}

type IResource = IPatient | IObservation | IGoal | IServiceRequest;

interface IBundle_Entry {
  fullUrl: string;
  resource: IResource;
}

interface IBundle {
  resourceType: "Bundle";
  type: string;
  entry: IBundle_Entry[];
}

// ---------------------------------------------------------------------------
// Code system constants (from fhir-templates/fhir-bundle.json)
// ---------------------------------------------------------------------------

const SNOMED_SYSTEM = "http://snomed.info/sct";
const WHAT_MATTERS_CODE = "247751003"; // temporary — LOINC TBD

const WBS_SYSTEM = "http://mtnlotus.com/fhir/whole-health-cards/CodeSystem/well-being-signs";
const WBS_PANEL_CODE = "well-being-signs";

const PCO_READINESS_SYSTEM = "http://hl7.org/fhir/us/pco/CodeSystem/readiness-assessment-concepts";
const PCO_GAS_GOAL_PROFILE = "http://hl7.org/fhir/us/pco/StructureDefinition/pco-gas-goal-profile";
const PCO_READINESS_PROFILE = "http://hl7.org/fhir/us/pco/StructureDefinition/pco-readiness-assessment";
const PERTAINSTOGOAL_URL = "http://hl7.org/fhir/StructureDefinition/resource-pertainsToGoal";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ref(resourceIndex: number): IReference {
  return { reference: `resource:${resourceIndex}` };
}

export function toDatetime(dateStr: string): string {
  // If it looks like a plain date (YYYY-MM-DD), convert to UTC datetime string
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return `${dateStr}T00:00:00Z`;
  }
  return dateStr; // already a datetime; pass through
}

function srStatus(status: string | undefined): IServiceRequest["status"] {
  const mapping: Record<string, IServiceRequest["status"]> = {
    met: "completed",
    "not-met": "stopped",
    "in-progress": "active",
  };
  return mapping[status ?? ""] ?? "active";
}

// ---------------------------------------------------------------------------
// Resource builders
// ---------------------------------------------------------------------------

function buildPatient(php: PhpData): IPatient {
  const resource: IPatient = { resourceType: "Patient" };
  if (php.patient) {
    const name: IHumanName = {};
    if (php.patient.family) name.family = php.patient.family;
    if (php.patient.given?.length) name.given = php.patient.given;
    if (Object.keys(name).length) resource.name = [name];
    if (php.patient.birth_date) resource.birthDate = php.patient.birth_date;
  }
  return resource;
}

function mapText(php: PhpData): string | null {
  const parts: string[] = [];
  if (php.map) {
    if (php.map.mission) parts.push(php.map.mission);
    if (php.map.aspiration) parts.push(php.map.aspiration);
    if (php.map.purpose) parts.push(php.map.purpose);
  }
  if (php.what_matters_most) parts.push(php.what_matters_most);
  return parts.join(" ").trim() || null;
}

function buildWhatMattersObs(
  php: PhpData,
  patientIdx: number,
  obsDate: string | undefined,
): IObservation | null {
  const parts: string[] = [];
  if (php.map) {
    if (php.map.mission) parts.push(`Mission: ${php.map.mission}`);
    if (php.map.aspiration) parts.push(`Aspiration: ${php.map.aspiration}`);
    if (php.map.purpose) parts.push(`Purpose: ${php.map.purpose}`);
  }
  if (php.what_matters_most) parts.push(php.what_matters_most);
  const text = parts.join(" ").trim() || undefined;
  if (!text) return null;

  const resource: IObservation = {
    resourceType: "Observation",
    status: "final",
    code: { coding: [{ system: SNOMED_SYSTEM, code: WHAT_MATTERS_CODE }] },
    subject: ref(patientIdx),
  };
  if (obsDate) resource.effectiveDateTime = toDatetime(obsDate);
  resource.valueString = text;
  return resource;
}

function buildWbsObs(
  php: PhpData,
  patientIdx: number,
  obsDate: string | undefined,
): IObservation | null {
  const wbs = php.wbs;
  if (!wbs) return null;

  const components: IObservation_Component[] = [];
  for (const [code, value] of [
    ["satisfied", wbs.satisfied],
    ["involved", wbs.involved],
    ["functioning", wbs.functioning],
  ] as [string, number | undefined][]) {
    if (value !== undefined) {
      components.push({
        code: { coding: [{ system: WBS_SYSTEM, code }] },
        valueInteger: value,
      });
    }
  }

  const resource: IObservation = {
    resourceType: "Observation",
    status: "final",
    code: { coding: [{ system: WBS_SYSTEM, code: WBS_PANEL_CODE }] },
    subject: ref(patientIdx),
  };
  const effective = wbs.session_date ?? obsDate;
  if (effective) resource.effectiveDateTime = toDatetime(effective);
  if (components.length) resource.component = components;
  return resource;
}

function buildGoal(goal: Goal, patientIdx: number, noteDate?: string): IGoal {
  const resource: IGoal = {
    resourceType: "Goal",
    meta: { profile: [PCO_GAS_GOAL_PROFILE] },
    lifecycleStatus: goal.lifecycle_status as IGoal["lifecycleStatus"],
    description: { text: goal.text },
    subject: ref(patientIdx),
  };
  resource.startDate = goal.start_date ?? noteDate;
  return resource;
}

function buildReadinessObs(
  goal: Goal,
  patientIdx: number,
  goalIdx: number,
  obsDate: string | undefined,
): IObservation | null {
  if (goal.importance === undefined && goal.confidence === undefined) return null;

  const components: IObservation_Component[] = [];
  if (goal.importance !== undefined) {
    components.push({
      code: { coding: [{ code: "importance", display: "Importance of change", system: PCO_READINESS_SYSTEM }] },
      valueInteger: goal.importance,
    });
  }
  if (goal.confidence !== undefined) {
    components.push({
      code: { coding: [{ code: "confidence", display: "Confidence to change", system: PCO_READINESS_SYSTEM }] },
      valueInteger: goal.confidence,
    });
  }

  const resource: IObservation = {
    resourceType: "Observation",
    meta: { profile: [PCO_READINESS_PROFILE] },
    status: "final",
    code: { coding: [{ code: "readiness-assessment", display: "Readiness assessment", system: PCO_READINESS_SYSTEM }] },
    subject: ref(patientIdx),
    focus: [ref(goalIdx)],
  };
  if (obsDate) resource.effectiveDateTime = toDatetime(obsDate);
  if (components.length) resource.component = components;
  const annotations: IAnnotation[] = [];
  if (goal.importance_note) annotations.push({ text: goal.importance_note });
  if (goal.confidence_note) annotations.push({ text: goal.confidence_note });
  if (annotations.length) resource.note = annotations;
  return resource;
}

function buildServiceRequest(
  step: ActionStep,
  patientIdx: number,
  goalIdx: number,
  noteDate?: string,
): IServiceRequest {
  const resource: IServiceRequest = {
    resourceType: "ServiceRequest",
    status: srStatus(step.status),
    intent: "order",
    code: { text: step.text },
    subject: ref(patientIdx),
    extension: [{ url: PERTAINSTOGOAL_URL, valueReference: ref(goalIdx) }],
  };
  const periodStart = step.start_date ?? noteDate;
  if (periodStart || step.end_date) {
    const period: IPeriod = {};
    if (periodStart) period.start = toDatetime(periodStart);
    if (step.end_date) period.end = toDatetime(step.end_date);
    resource.occurrencePeriod = period;
  }
  return resource;
}

// ---------------------------------------------------------------------------
// Bundle assembler
// ---------------------------------------------------------------------------

function makeAdder(entries: IBundle_Entry[]) {
  return function add(resource: IResource | null): number {
    const idx = entries.length;
    if (resource !== null) {
      entries.push({ fullUrl: `resource:${idx}`, resource });
    }
    return idx;
  };
}

/** Build a bundle from a single merged PhpData (legacy / single-note path). */
export function buildBundle(php: PhpData, sessionDate?: string): IBundle {
  const entries: IBundle_Entry[] = [];
  const add = makeAdder(entries);

  const patientIdx = add(buildPatient(php));
  add(buildWhatMattersObs(php, patientIdx, sessionDate));

  const wbsResource = buildWbsObs(php, patientIdx, sessionDate);
  if (wbsResource) add(wbsResource);

  for (const goal of php.goals) {
    const goalIdx = add(buildGoal(goal, patientIdx, sessionDate));
    const readiness = buildReadinessObs(goal, patientIdx, goalIdx, sessionDate);
    if (readiness) add(readiness);
    for (const step of goal.action_steps) {
      add(buildServiceRequest(step, patientIdx, goalIdx, sessionDate));
    }
  }

  return { resourceType: "Bundle", type: "collection", entry: entries };
}

/**
 * Build a bundle from an array of per-note PhpData objects (sorted by session order).
 * Includes full history: one WBS Observation per note (if present), MAP/goal resources
 * deduplicated — only the first occurrence of each unique MAP statement or goal is included.
 */
export function buildBundleFromNotes(notes: PhpData[], sessionDate?: string): IBundle {
  const entries: IBundle_Entry[] = [];
  const add = makeAdder(entries);

  // Single Patient from the first note that carries patient data
  const patientPhp = notes.find((n) => n.patient) ?? notes[0];
  const patientIdx = add(buildPatient(patientPhp));

  let seenMapKey: string | null = null;
  // Maps goal text fingerprint → the index of its Goal resource in the bundle
  const seenGoalKeys = new Map<string, number>();

  for (const note of notes) {
    // Prefer session_date parsed from the note, then WBS session_date, then CLI date
    const noteDate = note.session_date ?? note.wbs?.session_date ?? sessionDate;

    // MAP / Sense of Purpose — include only when content changes across notes
    const key = mapText(note);
    if (key && key !== seenMapKey) {
      seenMapKey = key;
      add(buildWhatMattersObs(note, patientIdx, noteDate));
    }

    // WBS — include every session that has scores
    const wbsResource = buildWbsObs(note, patientIdx, noteDate);
    if (wbsResource) add(wbsResource);

    // Goals — Goal resource and readiness only on first occurrence;
    // action steps are added for every note that carries them so that
    // updated short-term goals for an existing long-term goal appear in history.
    for (const goal of note.goals) {
      const goalKey = goal.text.slice(0, 60);
      const existingGoalIdx = seenGoalKeys.get(goalKey);

      if (existingGoalIdx === undefined) {
        // New goal: emit Goal + readiness + action steps
        const goalIdx = add(buildGoal(goal, patientIdx, noteDate));
        seenGoalKeys.set(goalKey, goalIdx);
        const readiness = buildReadinessObs(goal, patientIdx, goalIdx, noteDate);
        if (readiness) add(readiness);
        for (const step of goal.action_steps) {
          add(buildServiceRequest(step, patientIdx, goalIdx, noteDate));
        }
      } else {
        // Existing goal: emit updated readiness (if scores present) and new action steps,
        // both referencing the original Goal resource.
        const readiness = buildReadinessObs(goal, patientIdx, existingGoalIdx, noteDate);
        if (readiness) add(readiness);
        for (const step of goal.action_steps) {
          add(buildServiceRequest(step, patientIdx, existingGoalIdx, noteDate));
        }
      }
    }
  }

  return { resourceType: "Bundle", type: "collection", entry: entries };
}

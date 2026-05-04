/**
 * FHIR R4 bundle builder. Assembles a PCO IG collection Bundle from PhpData.
 * Mirrors generate_fhir.py resource builders.
 */
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
const GOAL_TYPE_SYSTEM = "http://mtnlotus.com/fhir/whole-health-cards/CodeSystem/goal-type";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ref(resourceIndex) {
    return { reference: `resource:${resourceIndex}` };
}
export function toDatetime(dateStr) {
    // If it looks like a plain date (YYYY-MM-DD), convert to UTC datetime string
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return `${dateStr}T00:00:00Z`;
    }
    return dateStr; // already a datetime; pass through
}
// ---------------------------------------------------------------------------
// Resource builders
// ---------------------------------------------------------------------------
function buildPatient(php) {
    const resource = { resourceType: "Patient" };
    if (php.patient) {
        const name = {};
        if (php.patient.family)
            name.family = php.patient.family;
        if (php.patient.given?.length)
            name.given = php.patient.given;
        if (Object.keys(name).length)
            resource.name = [name];
        if (php.patient.birth_date)
            resource.birthDate = php.patient.birth_date;
    }
    return resource;
}
function mapText(php) {
    return php.map ?? null;
}
function buildWhatMattersObs(php, patientIdx, obsDate) {
    const text = php.map?.trim() || undefined;
    if (!text)
        return null;
    const resource = {
        resourceType: "Observation",
        status: "final",
        code: { coding: [{ system: SNOMED_SYSTEM, code: WHAT_MATTERS_CODE }] },
        subject: ref(patientIdx),
    };
    if (obsDate)
        resource.effectiveDateTime = toDatetime(obsDate);
    resource.valueString = text;
    return resource;
}
function buildWbsObs(php, patientIdx, obsDate) {
    const wbs = php.wbs;
    if (!wbs)
        return null;
    const components = [];
    for (const [code, value] of [
        ["satisfied", wbs.satisfied],
        ["involved", wbs.involved],
        ["functioning", wbs.functioning],
    ]) {
        if (value !== undefined) {
            components.push({
                code: { coding: [{ system: WBS_SYSTEM, code }] },
                valueInteger: value,
            });
        }
    }
    const resource = {
        resourceType: "Observation",
        status: "final",
        code: { coding: [{ system: WBS_SYSTEM, code: WBS_PANEL_CODE }] },
        subject: ref(patientIdx),
    };
    const effective = wbs.session_date ?? obsDate;
    if (effective)
        resource.effectiveDateTime = toDatetime(effective);
    if (components.length)
        resource.component = components;
    return resource;
}
function buildGoal(goal, patientIdx, noteDate) {
    const resource = {
        resourceType: "Goal",
        meta: { profile: [PCO_GAS_GOAL_PROFILE] },
        lifecycleStatus: goal.lifecycle_status,
        description: { text: goal.text },
        subject: ref(patientIdx),
        category: [{ coding: [{ system: GOAL_TYPE_SYSTEM, code: goal.goal_type }] }],
    };
    resource.startDate = goal.start_date ?? noteDate;
    return resource;
}
function buildReadinessObs(goal, patientIdx, goalIdx, obsDate) {
    if (goal.importance === undefined && goal.confidence === undefined)
        return null;
    const components = [];
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
    const resource = {
        resourceType: "Observation",
        meta: { profile: [PCO_READINESS_PROFILE] },
        status: "final",
        code: { coding: [{ code: "readiness-assessment", display: "Readiness assessment", system: PCO_READINESS_SYSTEM }] },
        subject: ref(patientIdx),
        focus: [ref(goalIdx)],
    };
    if (obsDate)
        resource.effectiveDateTime = toDatetime(obsDate);
    if (components.length)
        resource.component = components;
    const annotations = [];
    if (goal.importance_note)
        annotations.push({ text: goal.importance_note });
    if (goal.confidence_note)
        annotations.push({ text: goal.confidence_note });
    if (annotations.length)
        resource.note = annotations;
    return resource;
}
// ---------------------------------------------------------------------------
// Bundle assembler
// ---------------------------------------------------------------------------
function makeAdder(entries) {
    return function add(resource) {
        const idx = entries.length;
        if (resource !== null) {
            entries.push({ fullUrl: `resource:${idx}`, resource });
        }
        return idx;
    };
}
/** Build a bundle from a single merged PhpData (legacy / single-note path). */
export function buildBundle(php, sessionDate) {
    const entries = [];
    const add = makeAdder(entries);
    const patientIdx = add(buildPatient(php));
    add(buildWhatMattersObs(php, patientIdx, sessionDate));
    const wbsResource = buildWbsObs(php, patientIdx, sessionDate);
    if (wbsResource)
        add(wbsResource);
    for (const goal of php.goals) {
        const goalIdx = add(buildGoal(goal, patientIdx, sessionDate));
        const readiness = buildReadinessObs(goal, patientIdx, goalIdx, sessionDate);
        if (readiness)
            add(readiness);
    }
    return { resourceType: "Bundle", type: "collection", entry: entries };
}
/**
 * Build a bundle from an array of per-note PhpData objects (sorted by session order).
 * Includes full history: one WBS Observation per note (if present), MAP/goal resources
 * deduplicated — only the first occurrence of each unique MAP statement or goal is included.
 */
export function buildBundleFromNotes(notes, sessionDate) {
    const entries = [];
    const add = makeAdder(entries);
    // Single Patient from the first note that carries patient data
    const patientPhp = notes.find((n) => n.patient) ?? notes[0];
    const patientIdx = add(buildPatient(patientPhp));
    let seenMapKey = null;
    // Maps goal text fingerprint → the index of its Goal resource in the bundle
    const seenGoalKeys = new Map();
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
        if (wbsResource)
            add(wbsResource);
        // Goals — Goal resource and readiness only on first occurrence;
        // action steps are added for every note that carries them so that
        // updated short-term goals for an existing long-term goal appear in history.
        for (const goal of note.goals) {
            const goalKey = goal.text.slice(0, 60);
            const existingGoalIdx = seenGoalKeys.get(goalKey);
            if (existingGoalIdx === undefined) {
                // New goal: emit Goal + readiness
                const goalIdx = add(buildGoal(goal, patientIdx, noteDate));
                seenGoalKeys.set(goalKey, goalIdx);
                const readiness = buildReadinessObs(goal, patientIdx, goalIdx, noteDate);
                if (readiness)
                    add(readiness);
            }
            else {
                // Existing goal: emit updated readiness referencing the original Goal resource
                const readiness = buildReadinessObs(goal, patientIdx, existingGoalIdx, noteDate);
                if (readiness)
                    add(readiness);
            }
        }
    }
    return { resourceType: "Bundle", type: "collection", entry: entries };
}

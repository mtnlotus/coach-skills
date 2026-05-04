/**
 * Merges multiple parsed notes into a single PhpData object.
 * Most-recent-wins strategy, mirroring merge_notes() from parse_notes.py.
 */
const GOAL_FIELDS = [
    "text", "importance", "confidence", "importance_note",
    "confidence_note", "lifecycle_status", "start_date", "end_date",
];
/**
 * Convert a single RawNote to a PhpData object without merging.
 * Used to preserve per-note history for FHIR bundle generation.
 */
export function rawNoteToPhpData(note) {
    const patient = note.patient_name ? parsePatientName(note.patient_name) : undefined;
    const goals = [];
    for (const g of note.long_term_goals) {
        if (!g.text)
            continue;
        goals.push({
            text: g.text,
            goal_type: "long-term",
            importance: g.importance,
            confidence: g.confidence,
            importance_note: g.importance_note,
            confidence_note: g.confidence_note,
            lifecycle_status: g.lifecycle_status ?? "active",
            start_date: g.start_date,
        });
    }
    for (const s of note.short_term_goals) {
        if (!s.text)
            continue;
        goals.push({
            text: s.text,
            goal_type: "short-term",
            importance: s.importance,
            confidence: s.confidence,
            importance_note: s.importance_note,
            confidence_note: s.confidence_note,
            lifecycle_status: s.lifecycle_status ?? "active",
            start_date: s.start_date,
            end_date: s.end_date,
        });
    }
    return {
        patient,
        session_date: note.session_date ?? undefined,
        map: note.map ?? undefined,
        values: note.values,
        vision: note.vision ?? undefined,
        strengths: note.strengths,
        wbs: (note.wbs ?? undefined),
        goals,
        is_final_session: note.is_final_session,
        discharge_plan: note.discharge_plan ?? undefined,
    };
}
function parsePatientName(nameStr) {
    const trimmed = nameStr.trim();
    // EHR format: FAMILY,GIVEN (comma, no space) — e.g. "SMITH,JOHN"
    if (/^[^,\s]+,[^,\s]/.test(trimmed)) {
        const commaIdx = trimmed.indexOf(",");
        const family = trimmed.slice(0, commaIdx).trim();
        const given = trimmed.slice(commaIdx + 1).trim();
        return { given: given ? [given] : [], family };
    }
    // Space-separated: "John Smith" → given: ["John"], family: "Smith"
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
        return { given: parts.slice(0, -1), family: parts[parts.length - 1] };
    }
    return { given: [trimmed], family: "" };
}
/** Sort RawNotes by session_date (when available) then session_number. */
export function sortNotes(notes) {
    return [...notes].sort((a, b) => {
        if (a.session_date && b.session_date)
            return a.session_date.localeCompare(b.session_date);
        return (a.session_number ?? 0) - (b.session_number ?? 0);
    });
}
export function mergeNotes(parsed) {
    const sorted = sortNotes(parsed);
    let patient;
    let sessionDate;
    let values = [];
    let vision;
    let strengths = [];
    let wbs;
    let mapText;
    let isFinal = false;
    let dischargePlan;
    // Long-term goals: keyed by text fingerprint (first 60 chars)
    const ltGoals = new Map();
    // Short-term goals: keyed by position index
    const stGoals = new Map();
    for (const note of sorted) {
        if (note.patient_name && !patient) {
            patient = parsePatientName(note.patient_name);
        }
        if (note.session_date)
            sessionDate = note.session_date;
        if (note.values.length > 0)
            values = note.values;
        if (note.vision)
            vision = note.vision;
        if (note.strengths.length > 0)
            strengths = note.strengths;
        if (note.wbs)
            wbs = note.wbs;
        if (note.map)
            mapText = note.map;
        if (note.is_final_session)
            isFinal = true;
        if (note.discharge_plan)
            dischargePlan = note.discharge_plan;
        for (const goal of note.long_term_goals) {
            const text = (goal.text ?? "").trim();
            if (!text)
                continue;
            const key = text.slice(0, 60);
            const existing = ltGoals.get(key) ?? {};
            for (const field of GOAL_FIELDS) {
                const v = goal[field];
                if (v != null)
                    existing[field] = v;
            }
            ltGoals.set(key, existing);
        }
        for (let idx = 0; idx < note.short_term_goals.length; idx++) {
            const step = note.short_term_goals[idx];
            const existing = stGoals.get(idx) ?? {};
            for (const field of GOAL_FIELDS) {
                const v = step[field];
                if (v != null)
                    existing[field] = v;
            }
            stGoals.set(idx, existing);
        }
    }
    const goals = [];
    for (const [, g] of ltGoals) {
        if (!g.text)
            continue;
        goals.push({
            text: g.text,
            goal_type: "long-term",
            importance: g.importance,
            confidence: g.confidence,
            importance_note: g.importance_note,
            confidence_note: g.confidence_note,
            lifecycle_status: g.lifecycle_status ?? "active",
            start_date: g.start_date,
        });
    }
    for (const idx of [...stGoals.keys()].sort((a, b) => a - b)) {
        const s = stGoals.get(idx);
        if (!s.text)
            continue;
        goals.push({
            text: s.text,
            goal_type: "short-term",
            importance: s.importance,
            confidence: s.confidence,
            importance_note: s.importance_note,
            confidence_note: s.confidence_note,
            lifecycle_status: s.lifecycle_status ?? "active",
            start_date: s.start_date,
            end_date: s.end_date,
        });
    }
    return {
        patient,
        session_date: sessionDate,
        map: mapText,
        values,
        vision,
        strengths,
        wbs: wbs,
        goals,
        is_final_session: isFinal,
        discharge_plan: dischargePlan,
    };
}

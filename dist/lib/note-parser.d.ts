/**
 * Single-note parser. Extracts structured fields from one set of DOCX paragraphs.
 * Mirrors _NoteParser from parse_notes.py.
 */
import type { WbsAssessment, Goal } from "../models.js";
interface RawNote {
    source: string;
    session_number: number | null;
    session_date: string | null;
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
export declare class NoteParser {
    private readonly paras;
    private readonly n;
    private readonly source;
    constructor(paras: string[], source?: string);
    private nextNonempty;
    private findIntInWindow;
    private collectUntil;
    private parseWbs;
    private parseMap;
    private parseLongTermGoals;
    private parseShortTermGoals;
    private parsePlan;
    parse(): RawNote;
}
export type { RawNote };

/**
 * Zod schemas and inferred TypeScript types for the Personal Health Plan (PHP)
 * intermediate schema. Mirrors models.py exactly.
 */
import { z } from "zod";
export const PatientSchema = z.object({
    family: z.string(),
    given: z.array(z.string()),
    birth_date: z.string().optional(), // YYYY-MM-DD
});
export const WbsAssessmentSchema = z.object({
    session_number: z.number().int().optional(),
    session_date: z.string().optional(), // YYYY-MM-DD
    satisfied: z.number().int().optional(), // Q1: Fully satisfied (0-10)
    involved: z.number().int().optional(), // Q2: Regularly involved (0-10)
    functioning: z.number().int().optional(), // Q3: Functioning best (0-10)
    average: z.number().optional(),
});
// MAP (Mission, Aspiration, Purpose) — full text, may contain line breaks
export const MapSchema = z.string();
export const GoalSchema = z.object({
    text: z.string(),
    goal_type: z.enum(["long-term", "short-term"]).default("long-term"),
    importance: z.number().int().optional(), // most recent readiness ruler value
    confidence: z.number().int().optional(), // most recent readiness ruler value
    importance_note: z.string().optional(), // readiness ruler importance rationale
    confidence_note: z.string().optional(), // readiness ruler confidence rationale
    lifecycle_status: z.string().default("active"), // "active" | "completed" | "cancelled"
    start_date: z.string().optional(), // YYYY-MM-DD
    end_date: z.string().optional(), // YYYY-MM-DD
});
export const PhpDataSchema = z.object({
    patient: PatientSchema.optional(),
    session_date: z.string().optional(), // YYYY-MM-DD date of this note
    map: MapSchema.optional(), // Mission, Aspiration, Purpose full text
    values: z.array(z.string()).default([]),
    vision: z.string().optional(),
    strengths: z.array(z.string()).default([]),
    wbs: WbsAssessmentSchema.optional(), // most recent WBS scores
    goals: z.array(GoalSchema).default([]),
    is_final_session: z.boolean().default(false),
    discharge_plan: z.string().optional(),
});

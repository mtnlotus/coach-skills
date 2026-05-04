/**
 * Zod schemas and inferred TypeScript types for the Personal Health Plan (PHP)
 * intermediate schema. Mirrors models.py exactly.
 */
import { z } from "zod";
export declare const PatientSchema: z.ZodObject<{
    family: z.ZodString;
    given: z.ZodArray<z.ZodString, "many">;
    birth_date: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    family: string;
    given: string[];
    birth_date?: string | undefined;
}, {
    family: string;
    given: string[];
    birth_date?: string | undefined;
}>;
export declare const WbsAssessmentSchema: z.ZodObject<{
    session_number: z.ZodOptional<z.ZodNumber>;
    session_date: z.ZodOptional<z.ZodString>;
    satisfied: z.ZodOptional<z.ZodNumber>;
    involved: z.ZodOptional<z.ZodNumber>;
    functioning: z.ZodOptional<z.ZodNumber>;
    average: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    session_number?: number | undefined;
    session_date?: string | undefined;
    satisfied?: number | undefined;
    involved?: number | undefined;
    functioning?: number | undefined;
    average?: number | undefined;
}, {
    session_number?: number | undefined;
    session_date?: string | undefined;
    satisfied?: number | undefined;
    involved?: number | undefined;
    functioning?: number | undefined;
    average?: number | undefined;
}>;
export declare const MapSchema: z.ZodString;
export declare const GoalSchema: z.ZodObject<{
    text: z.ZodString;
    goal_type: z.ZodDefault<z.ZodEnum<["long-term", "short-term"]>>;
    importance: z.ZodOptional<z.ZodNumber>;
    confidence: z.ZodOptional<z.ZodNumber>;
    importance_note: z.ZodOptional<z.ZodString>;
    confidence_note: z.ZodOptional<z.ZodString>;
    lifecycle_status: z.ZodDefault<z.ZodString>;
    start_date: z.ZodOptional<z.ZodString>;
    end_date: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    text: string;
    goal_type: "long-term" | "short-term";
    lifecycle_status: string;
    importance?: number | undefined;
    confidence?: number | undefined;
    importance_note?: string | undefined;
    confidence_note?: string | undefined;
    start_date?: string | undefined;
    end_date?: string | undefined;
}, {
    text: string;
    goal_type?: "long-term" | "short-term" | undefined;
    importance?: number | undefined;
    confidence?: number | undefined;
    importance_note?: string | undefined;
    confidence_note?: string | undefined;
    lifecycle_status?: string | undefined;
    start_date?: string | undefined;
    end_date?: string | undefined;
}>;
export declare const PhpDataSchema: z.ZodObject<{
    patient: z.ZodOptional<z.ZodObject<{
        family: z.ZodString;
        given: z.ZodArray<z.ZodString, "many">;
        birth_date: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        family: string;
        given: string[];
        birth_date?: string | undefined;
    }, {
        family: string;
        given: string[];
        birth_date?: string | undefined;
    }>>;
    session_date: z.ZodOptional<z.ZodString>;
    map: z.ZodOptional<z.ZodString>;
    values: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    vision: z.ZodOptional<z.ZodString>;
    strengths: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    wbs: z.ZodOptional<z.ZodObject<{
        session_number: z.ZodOptional<z.ZodNumber>;
        session_date: z.ZodOptional<z.ZodString>;
        satisfied: z.ZodOptional<z.ZodNumber>;
        involved: z.ZodOptional<z.ZodNumber>;
        functioning: z.ZodOptional<z.ZodNumber>;
        average: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        session_number?: number | undefined;
        session_date?: string | undefined;
        satisfied?: number | undefined;
        involved?: number | undefined;
        functioning?: number | undefined;
        average?: number | undefined;
    }, {
        session_number?: number | undefined;
        session_date?: string | undefined;
        satisfied?: number | undefined;
        involved?: number | undefined;
        functioning?: number | undefined;
        average?: number | undefined;
    }>>;
    goals: z.ZodDefault<z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        goal_type: z.ZodDefault<z.ZodEnum<["long-term", "short-term"]>>;
        importance: z.ZodOptional<z.ZodNumber>;
        confidence: z.ZodOptional<z.ZodNumber>;
        importance_note: z.ZodOptional<z.ZodString>;
        confidence_note: z.ZodOptional<z.ZodString>;
        lifecycle_status: z.ZodDefault<z.ZodString>;
        start_date: z.ZodOptional<z.ZodString>;
        end_date: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        text: string;
        goal_type: "long-term" | "short-term";
        lifecycle_status: string;
        importance?: number | undefined;
        confidence?: number | undefined;
        importance_note?: string | undefined;
        confidence_note?: string | undefined;
        start_date?: string | undefined;
        end_date?: string | undefined;
    }, {
        text: string;
        goal_type?: "long-term" | "short-term" | undefined;
        importance?: number | undefined;
        confidence?: number | undefined;
        importance_note?: string | undefined;
        confidence_note?: string | undefined;
        lifecycle_status?: string | undefined;
        start_date?: string | undefined;
        end_date?: string | undefined;
    }>, "many">>;
    is_final_session: z.ZodDefault<z.ZodBoolean>;
    discharge_plan: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    values: string[];
    strengths: string[];
    goals: {
        text: string;
        goal_type: "long-term" | "short-term";
        lifecycle_status: string;
        importance?: number | undefined;
        confidence?: number | undefined;
        importance_note?: string | undefined;
        confidence_note?: string | undefined;
        start_date?: string | undefined;
        end_date?: string | undefined;
    }[];
    is_final_session: boolean;
    map?: string | undefined;
    session_date?: string | undefined;
    patient?: {
        family: string;
        given: string[];
        birth_date?: string | undefined;
    } | undefined;
    vision?: string | undefined;
    wbs?: {
        session_number?: number | undefined;
        session_date?: string | undefined;
        satisfied?: number | undefined;
        involved?: number | undefined;
        functioning?: number | undefined;
        average?: number | undefined;
    } | undefined;
    discharge_plan?: string | undefined;
}, {
    map?: string | undefined;
    values?: string[] | undefined;
    session_date?: string | undefined;
    patient?: {
        family: string;
        given: string[];
        birth_date?: string | undefined;
    } | undefined;
    vision?: string | undefined;
    strengths?: string[] | undefined;
    wbs?: {
        session_number?: number | undefined;
        session_date?: string | undefined;
        satisfied?: number | undefined;
        involved?: number | undefined;
        functioning?: number | undefined;
        average?: number | undefined;
    } | undefined;
    goals?: {
        text: string;
        goal_type?: "long-term" | "short-term" | undefined;
        importance?: number | undefined;
        confidence?: number | undefined;
        importance_note?: string | undefined;
        confidence_note?: string | undefined;
        lifecycle_status?: string | undefined;
        start_date?: string | undefined;
        end_date?: string | undefined;
    }[] | undefined;
    is_final_session?: boolean | undefined;
    discharge_plan?: string | undefined;
}>;
export type Patient = z.infer<typeof PatientSchema>;
export type WbsAssessment = z.infer<typeof WbsAssessmentSchema>;
export type Goal = z.infer<typeof GoalSchema>;
export type PhpData = z.infer<typeof PhpDataSchema>;

/**
 * FHIR R4 bundle builder. Assembles a PCO IG collection Bundle from PhpData.
 * Mirrors generate_fhir.py resource builders.
 */
import type { PhpData } from "../models.js";
interface IReference {
    reference: string;
}
interface ICoding {
    system?: string;
    code?: string;
    display?: string;
}
interface ICodeableConcept {
    coding?: ICoding[];
    text?: string;
}
interface IHumanName {
    family?: string;
    given?: string[];
}
interface IMeta {
    profile?: string[];
}
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
    description: {
        text: string;
    };
    subject: IReference;
    startDate?: string;
    category?: ICodeableConcept[];
}
type IResource = IPatient | IObservation | IGoal;
interface IBundle_Entry {
    fullUrl: string;
    resource: IResource;
}
interface IBundle {
    resourceType: "Bundle";
    type: string;
    entry: IBundle_Entry[];
}
export declare function toDatetime(dateStr: string): string;
/** Build a bundle from a single merged PhpData (legacy / single-note path). */
export declare function buildBundle(php: PhpData, sessionDate?: string): IBundle;
/**
 * Build a bundle from an array of per-note PhpData objects (sorted by session order).
 * Includes full history: one WBS Observation per note (if present), MAP/goal resources
 * deduplicated — only the first occurrence of each unique MAP statement or goal is included.
 */
export declare function buildBundleFromNotes(notes: PhpData[], sessionDate?: string): IBundle;
export {};

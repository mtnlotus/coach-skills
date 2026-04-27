/**
 * Merges multiple parsed notes into a single PhpData object.
 * Most-recent-wins strategy, mirroring merge_notes() from parse_notes.py.
 */
import type { PhpData } from "../models.js";
import type { RawNote } from "./note-parser.js";
/**
 * Convert a single RawNote to a PhpData object without merging.
 * Used to preserve per-note history for FHIR bundle generation.
 */
export declare function rawNoteToPhpData(note: RawNote): PhpData;
/** Sort RawNotes by session_date (when available) then session_number. */
export declare function sortNotes(notes: RawNote[]): RawNote[];
export declare function mergeNotes(parsed: RawNote[]): PhpData;

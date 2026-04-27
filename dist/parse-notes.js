#!/usr/bin/env node
/**
 * Parse health coaching DOCX progress notes into PHP data JSON.
 *
 * Usage:
 *   pnpm parse-notes <note1.docx> [note2.docx ...] [-o output/php-data.json]
 *   pnpm parse-notes clinical-notes/ [-o output/php-data.json]
 */
import fs from "node:fs";
import path from "node:path";
import { program } from "commander";
import { collectNoteFiles, loadParagraphs, loadParagraphsFromText } from "./lib/docx-reader.js";
import { NoteParser } from "./lib/note-parser.js";
import { mergeNotes, rawNoteToPhpData, sortNotes } from "./lib/note-merger.js";
import { PhpDataSchema } from "./models.js";
program
    .name("parse-notes")
    .description("Parse health coaching DOCX progress notes into PHP data JSON.")
    .argument("<paths...>", "DOCX or plain-text (.txt) files, or a directory containing them")
    .option("-o, --output <file>", "output JSON file", "output/php-data.json")
    .action((paths, opts) => {
    const noteFiles = collectNoteFiles(paths);
    if (noteFiles.length === 0) {
        console.error("Error: no supported note files (.docx, .txt) found.");
        process.exit(1);
    }
    const parsed = [];
    for (const f of noteFiles) {
        const name = path.basename(f);
        process.stderr.write(`Parsing ${name}…\n`);
        try {
            const paras = f.toLowerCase().endsWith(".txt")
                ? loadParagraphsFromText(f)
                : loadParagraphs(f);
            const parser = new NoteParser(paras, name);
            parsed.push(parser.parse());
        }
        catch (err) {
            console.error(`  Warning: failed to parse ${name}: ${err}`);
        }
    }
    if (parsed.length === 0) {
        console.error("Error: no notes could be parsed.");
        process.exit(1);
    }
    const php = mergeNotes(parsed);
    // Validate against schema (strips undefined fields, applies defaults)
    const validated = PhpDataSchema.parse(php);
    const outPath = opts.output;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(validated, null, 2));
    process.stderr.write(`Written to ${outPath}\n`);
    // Also write per-note array (sorted by date/session) for FHIR history
    const sorted = sortNotes(parsed);
    const perNote = sorted.map((note) => PhpDataSchema.parse(rawNoteToPhpData(note)));
    const notesPath = path.join(path.dirname(outPath), "php-notes.json");
    fs.writeFileSync(notesPath, JSON.stringify(perNote, null, 2));
    process.stderr.write(`Written to ${notesPath}\n`);
});
program.parse();

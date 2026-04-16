#!/usr/bin/env node
/**
 * Generate a FHIR R4 Bundle (PCO IG) from a PHP notes JSON file.
 *
 * Usage:
 *   pnpm generate-fhir [php-notes.json] [-o output/fhir-bundle.json] [--date YYYY-MM-DD]
 */

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { program } from "commander";
import { PhpDataSchema } from "./models.js";
import { buildBundleFromNotes } from "./lib/fhir-builder.js";

program
  .name("generate-fhir")
  .description("Generate a FHIR R4 PCO Bundle from PHP notes JSON.")
  .argument("[input]", "per-note PHP data JSON file (array)", "output/php-notes.json")
  .option("-o, --output <file>", "output FHIR bundle JSON file", "output/fhir-bundle.json")
  .option("--date <YYYY-MM-DD>", "date of the most recent session")
  .action((input: string, opts: { output: string; date?: string }) => {
    if (!fs.existsSync(input)) {
      console.error(`Error: ${input} not found.`);
      process.exit(1);
    }

    const raw = JSON.parse(fs.readFileSync(input, "utf-8")) as unknown;
    const notes = z.array(PhpDataSchema).parse(raw);

    const sessionDate = opts.date ?? new Date().toISOString().slice(0, 10);
    const bundle = buildBundleFromNotes(notes, sessionDate);

    const outPath = opts.output;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(bundle, null, "\t"));
    process.stderr.write(`Written to ${outPath}\n`);
  });

program.parse();

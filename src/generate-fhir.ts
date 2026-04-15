#!/usr/bin/env node
/**
 * Generate a FHIR R4 Bundle (PCO IG) from a PHP data JSON file.
 *
 * Usage:
 *   pnpm generate-fhir [php-data.json] [-o output/fhir-bundle.json] [--date YYYY-MM-DD]
 */

import fs from "node:fs";
import path from "node:path";
import { program } from "commander";
import { PhpDataSchema } from "./models.js";
import { buildBundle } from "./lib/fhir-builder.js";

program
  .name("generate-fhir")
  .description("Generate a FHIR R4 PCO Bundle from PHP data JSON.")
  .argument("[input]", "parsed PHP data JSON file", "output/php-data.json")
  .option("-o, --output <file>", "output FHIR bundle JSON file", "output/fhir-bundle.json")
  .option("--date <YYYY-MM-DD>", "date of the most recent session")
  .action((input: string, opts: { output: string; date?: string }) => {
    if (!fs.existsSync(input)) {
      console.error(`Error: ${input} not found.`);
      process.exit(1);
    }

    const raw = JSON.parse(fs.readFileSync(input, "utf-8")) as unknown;
    const php = PhpDataSchema.parse(raw);

    const sessionDate = opts.date ?? new Date().toISOString().slice(0, 10);
    const bundle = buildBundle(php, sessionDate);

    const outPath = opts.output;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(bundle, null, "\t"));
    process.stderr.write(`Written to ${outPath}\n`);
  });

program.parse();

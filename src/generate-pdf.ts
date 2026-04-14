#!/usr/bin/env node
/**
 * Generate a patient-facing Personal Health Plan PDF from PHP data JSON.
 *
 * Usage:
 *   pnpm generate-pdf [php-data.json] [-o output/personal-health-plan.pdf] [--date "14 April 2026"]
 */

import fs from "node:fs";
import path from "node:path";
import { program } from "commander";
import { PhpDataSchema } from "./models.js";
import { PHPReport } from "./lib/pdf-report.js";

function todayFormatted(): string {
  return new Date().toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

program
  .name("generate-pdf")
  .description("Generate a patient-facing Personal Health Plan PDF.")
  .argument("[input]", "parsed PHP data JSON file", "output/php-data.json")
  .option("-o, --output <file>", "output PDF file", "output/personal-health-plan.pdf")
  .option("--date <string>", "report date shown on cover (e.g. '14 April 2026')", todayFormatted())
  .action((input: string, opts: { output: string; date: string }) => {
    if (!fs.existsSync(input)) {
      console.error(`Error: ${input} not found.`);
      process.exit(1);
    }

    const raw = JSON.parse(fs.readFileSync(input, "utf-8")) as unknown;
    const php = PhpDataSchema.parse(raw);

    const outPath = opts.output;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });

    const report = new PHPReport();
    report.build(php, opts.date, outPath);
    process.stderr.write(`Written to ${outPath}\n`);
  });

program.parse();

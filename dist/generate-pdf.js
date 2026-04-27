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
function formatDate(isoDate) {
    // Parse YYYY-MM-DD as local date to avoid UTC-offset day shifts
    const [year, month, day] = isoDate.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString("en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}
function todayFormatted() {
    return formatDate(new Date().toISOString().slice(0, 10));
}
program
    .name("generate-pdf")
    .description("Generate a patient-facing Personal Health Plan PDF.")
    .argument("[input]", "parsed PHP data JSON file", "output/php-data.json")
    .option("-o, --output <file>", "output PDF file", "output/personal-health-plan.pdf")
    .option("--date <string>", "report date shown on cover (e.g. '14 April 2026')")
    .action((input, opts) => {
    if (!fs.existsSync(input)) {
        console.error(`Error: ${input} not found.`);
        process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(input, "utf-8"));
    const php = PhpDataSchema.parse(raw);
    // Use --date flag, then most recent note date, then today
    const reportDate = opts.date ?? (php.session_date ? formatDate(php.session_date) : todayFormatted());
    const outPath = opts.output;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const report = new PHPReport();
    report.build(php, reportDate, outPath);
    process.stderr.write(`Written to ${outPath}\n`);
});
program.parse();

#!/usr/bin/env node
/**
 * Generate a Personal Health Plan PDF directly from a FHIR R4 Bundle.
 *
 * Usage:
 *   pnpm generate-pdf-from-fhir [fhir-bundle.json] [-o output/personal-health-plan.pdf]
 */
import fs from "node:fs";
import path from "node:path";
import { program } from "commander";
import { PhpDataSchema } from "./models.js";
import { PHPReport } from "./lib/pdf-report.js";
import { bundleToPhpData } from "./lib/fhir-reader.js";
function formatDate(isoDate) {
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
    .name("generate-pdf-from-fhir")
    .description("Generate a Personal Health Plan PDF from a FHIR R4 Bundle.")
    .argument("[input]", "FHIR bundle JSON file", "output/fhir-bundle.json")
    .option("-o, --output <file>", "output PDF file", "output/personal-health-plan.pdf")
    .option("--date <string>", "report date shown on cover (e.g. '14 April 2026')")
    .action((input, opts) => {
    if (!fs.existsSync(input)) {
        console.error(`Error: ${input} not found.`);
        process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(input, "utf-8"));
    if (raw?.resourceType !== "Bundle") {
        console.error("Error: input file is not a FHIR Bundle (missing resourceType: Bundle).");
        process.exit(1);
    }
    const phpRaw = bundleToPhpData(raw);
    const php = PhpDataSchema.parse(phpRaw);
    const reportDate = opts.date ?? (php.session_date ? formatDate(php.session_date) : todayFormatted());
    const outPath = opts.output;
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const report = new PHPReport();
    report.build(php, reportDate, outPath);
    process.stderr.write(`Written to ${outPath}\n`);
});
program.parse();

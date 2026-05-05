# Coach Notes

Generate a **Personal Health Plan (PHP)** — including a patient-facing PDF and a FHIR R4 Bundle —
from clinical progress notes recorded in the EHR.

---

## Overview

The pipeline has three steps, each implemented as a standalone TypeScript script
and as an invocable Claude Code skill:

```
DOCX or plain-text (.txt) progress notes
       │
       ▼  /parse-notes
  php-data.json          ← structured intermediate JSON
       │
       ├──▶  /generate-fhir  ──▶  fhir-bundle.json
       │                                │
       │                                ▼  /generate-pdf-from-fhir
       │                          personal-health-plan.pdf
       │
       └──▶  /generate-pdf   ──▶  personal-health-plan.pdf
```

---

## Prerequisites

**Node.js 20+** and **pnpm**:

```bash
pnpm install
```

| Package | Purpose |
|---|---|
| `pizzip` + `fast-xml-parser` | Parse DOCX progress notes |
| `zod` | Validate intermediate JSON schema |
| `pdfkit` | Generate PDF |
| `@smile-cdr/fhirts` | FHIR R4 types |
| `commander` | CLI argument parsing |

**macOS font note:** The PDF generator uses Arial from
`/System/Library/Fonts/Supplemental/`. On other platforms the generator
falls back to built-in Helvetica automatically.

---

## Usage

### Via Claude Code (recommended)

Open Claude Code in this repository and invoke the skills as slash commands:

```
/parse-notes                          # parse clinical-notes/ → php-data.json
/parse-notes path/to/notes/           # parse a custom directory (DOCX or .txt)
/generate-fhir                        # generate FHIR bundle from php-notes.json
/generate-pdf                         # generate patient PDF from php-data.json
/generate-pdf-from-fhir               # generate patient PDF from fhir-bundle.json
```

### Via command line

```bash
# 1. Parse progress notes (DOCX or plain text)  →  output/php-data.json + php-notes.json
pnpm parse-notes clinical-notes/
pnpm parse-notes clinical-notes/plain-text/   # plain-text (.txt) notes

# 2a. Generate FHIR R4 Bundle  →  output/fhir-bundle.json
pnpm generate-fhir

# 2b. Generate patient-facing PDF from parsed JSON  →  output/personal-health-plan.pdf
pnpm generate-pdf

# 2c. Generate patient-facing PDF directly from FHIR bundle
pnpm generate-pdf-from-fhir output/fhir-bundle.json -o output/personal-health-plan.pdf
```

All scripts write to `output/` by default and create the directory automatically.
Override any output path with `-o <file>`.

---

## Skill Reference

### `/parse-notes`

Reads one or more coaching progress notes and outputs `php-data.json`.

**Input:** Directory or individual file paths. Supported formats:
- **DOCX** — EHR export (`.docx`)
- **Plain text** — same note content as `.txt`, one line per paragraph

**Output:** `php-data.json` — structured intermediate data following the schema
in `src/models.ts`. Also writes `php-notes.json` — per-note array sorted by
session date, used by `/generate-fhir` to preserve full session history.

**Merge strategy:** Notes are sorted by session date (then session number).
Most-recent-wins for all scalar fields (WBS scores, goal ruler values, discharge
plan). Long-term goals are deduplicated by text; action steps are matched by
position and updated with the latest status.

**Key fields extracted:**

| Field | Source |
|---|---|
| Patient name | "What really matters to [Name]." line |
| Values & Vision | `Additional information` block (initial visit) |
| Strengths | `Strengths discussed and identified:` line |
| WBS Q1/Q2/Q3 | Numbered questions + next-line answers |
| MAP (Mission/Aspiration/Purpose) | `Mission, Aspiration, Purpose (MAP)` section |
| What Matters Most | MAP narrative (middle/final visits) |
| Long-term goal | After `Collaboratively identified new long-term...` |
| Importance / Confidence | After `Utilized Importance Ruler:` / `Confidence Ruler:` |
| Action steps | `Goal N:` blocks in the short-term goals section |
| Goal status | After `Veteran reports goal was:` |
| Discharge plan | `PLAN` section, `Other:` subsection |

---

### `/generate-fhir`

Reads `php-notes.json` (per-note array) and generates a FHIR R4 collection
Bundle following the
[Person-Centered Outcomes (PCO) IG](https://build.fhir.org/ig/HL7/pco-ig).

**Input:** `php-notes.json` (default) — per-note array produced by `/parse-notes`

**Output:** `fhir-bundle.json`

**Bundle resources:**

| Resource | Profile | Content |
|---|---|---|
| `Patient` | base R4 | Name (no MRN) |
| `Observation` | base R4 | MAP / What Matters Most (SNOMED 247751003) — one per note when content changes |
| `Observation` | base R4 | WBS panel — Q1/Q2/Q3 components — one per session |
| `Goal` | `pco-gas-goal-profile` | Long-term SMART goal — deduplicated by text |
| `Observation` | `pco-readiness-assessment` | Importance + confidence rulers — one per session that has scores, all referencing the same Goal |
| `ServiceRequest` | base R4 | Action step(s), linked via `pertainsToGoal` — one per session |

> **Note:** WBS LOINC codes are not yet assigned. The bundle uses a temporary
> Mountain Lotus CodeSystem (`http://mtnlotus.com/fhir/whole-health-cards/CodeSystem/well-being-signs`).
> See `fhir-templates/fhir-bundle.json` for the authoritative template.

---

### `/generate-pdf`

Reads `php-data.json` and generates a patient-facing Personal Health Plan PDF
in VA Whole Health visual style.

**Input:** `php-data.json`

**Output:** `personal-health-plan.pdf`

**PDF sections:**

| Section | Content |
|---|---|
| Header | VA Whole Health wordmark · patient name · date |
| Mission, Aspiration, Purpose (MAP) | Purpose quote (highlighted) · Mission · Aspiration · What Matters Most narrative |
| My Well-Being Signs | Score bars for Q1/Q2/Q3 · overall average |
| My Goals | Goal text box · Importance/Confidence bars + rationale notes · Action Steps with status badges |
| My Strengths & Values | Strengths · Values · Vision |
| Next Steps | Discharge / follow-up plan |
| Footer | Branding + page number |

---

### `/generate-pdf-from-fhir`

Reads a FHIR R4 Bundle and generates a patient-facing Personal Health Plan PDF
directly, without requiring the intermediate `php-data.json`.

**Input:** `fhir-bundle.json` — a PCO IG collection Bundle as produced by
`/generate-fhir`

**Output:** `personal-health-plan.pdf`

**Fields available from the bundle:**

| PDF Section | Available |
|---|---|
| Header (patient name, date) | Yes |
| Mission, Aspiration, Purpose (MAP) | Yes |
| My Well-Being Signs | Yes — most recent session scores |
| My Goals (text, lifecycle status) | Yes |
| Importance / Confidence rulers | Yes — most recent session values |
| Readiness rationale notes | Yes |
| Action Steps with status | Yes — all sessions |
| My Strengths & Values | No — not encoded in the bundle |
| Next Steps / Discharge plan | No — not encoded in the bundle |

---

## Project Structure

```
coach-notes/
├── AGENTS.md                   # AI model instructions
├── SKILLS.md                   # This file
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── src/
│   ├── models.ts               # Zod schemas + TypeScript types
│   ├── parse-notes.ts          # CLI: DOCX / .txt → php-data.json + php-notes.json
│   ├── generate-fhir.ts        # CLI: php-notes.json → FHIR R4 Bundle
│   ├── generate-pdf.ts         # CLI: php-data.json → patient PDF
│   ├── generate-pdf-from-fhir.ts  # CLI: fhir-bundle.json → patient PDF
│   └── lib/
│       ├── docx-reader.ts      # DOCX ZIP → paragraph text[]; .txt → paragraph text[]
│       ├── note-parser.ts      # NoteParser class
│       ├── note-merger.ts      # mergeNotes() — most-recent-wins merge
│       ├── fhir-builder.ts     # buildBundleFromNotes() and resource builders
│       ├── fhir-reader.ts      # bundleToPhpData() — FHIR Bundle → PhpData
│       └── pdf-report.ts       # PHPReport class (VA Whole Health style)
├── .claude/
│   └── skills/
│       ├── parse-notes.md         # /parse-notes skill definition
│       ├── generate-fhir.md       # /generate-fhir skill definition
│       ├── generate-php.md        # /generate-pdf skill definition
│       └── generate-pdf-from-fhir.md  # /generate-pdf-from-fhir skill definition
├── clinical-notes/             # De-identified example progress notes
│   ├── Health and Wellness Coaching Initial Visit.docx
│   ├── Health and Wellness Coaching Middle Visit.docx
│   ├── Health and Wellness Coaching Final Visit.docx
│   └── plain-text/             # Same notes as plain text (.txt)
└── fhir-templates/
    └── fhir-bundle.json        # Reference FHIR bundle template
```

---

## Resources

- [VA Whole Health](https://www.va.gov/ann-arbor-health-care/programs/whole-health/)
- [Well-Being Signs (WBS)](https://www.va.gov/wholehealth/professional-resources/well-being-measurement.asp)
- [How to Set a SMART Goal](https://www.va.gov/WHOLEHEALTHLIBRARY/tools/how-to-set-a-smart-goal.asp)
- [Person-Centered Outcomes (PCO) FHIR IG](https://build.fhir.org/ig/HL7/pco-ig)

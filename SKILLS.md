# Coach Skills

AI-assisted skills for Health & Wellness Coaches to generate a **Personal
Health Plan (PHP)** — including a patient-facing PDF and a FHIR R4 Bundle —
from clinical progress notes recorded in the EHR.

---

## Overview

The pipeline has three steps, each implemented as a standalone Python script
and as an invocable Claude Code skill:

```
DOCX progress notes
       │
       ▼  /parse-notes
  php-data.json          ← structured intermediate JSON
       │
       ├──▶  /generate-fhir  ──▶  fhir-bundle-output.json
       │
       └──▶  /generate-php   ──▶  personal-health-plan.pdf
```

---

## Prerequisites

**Python 3.10+** with the following packages:

```bash
pip install -r requirements.txt
```

| Package | Purpose |
|---|---|
| `python-docx` | Parse DOCX progress notes |
| `pydantic` | Validate intermediate JSON schema |
| `fpdf2` | Generate PDF |
| `jinja2` | Templating (future use) |

**macOS font note:** The PDF generator uses Arial from
`/System/Library/Fonts/Supplemental/`. On other platforms, update the
`FONTS` paths in `src/generate_pdf.py`, or the generator falls back to
built-in Helvetica.

---

## Usage

### Via Claude Code (recommended)

Open Claude Code in this repository and invoke the skills as slash commands:

```
/parse-notes                        # parse note-examples/ → php-data.json
/parse-notes path/to/notes/         # parse a custom directory
/generate-fhir                      # generate FHIR bundle from php-data.json
/generate-php                       # generate patient PDF from php-data.json
```

### Via command line

```bash
# 1. Parse progress notes
python3 src/parse_notes.py note-examples/ -o php-data.json

# 2a. Generate FHIR R4 Bundle
python3 src/generate_fhir.py php-data.json --date 2026-03-27 -o fhir-bundle-output.json

# 2b. Generate patient-facing PDF
python3 src/generate_pdf.py php-data.json --date "March 27, 2026" -o personal-health-plan.pdf
```

---

## Skill Reference

### `/parse-notes`

Reads one or more DOCX coaching progress notes and outputs `php-data.json`.

**Input:** Directory of DOCX files or individual file paths.

**Output:** `php-data.json` — structured intermediate data following the schema
in `src/models.py`.

**Merge strategy:** Notes are sorted by session number. Most-recent-wins for
all scalar fields (WBS scores, goal ruler values, discharge plan). Long-term
goals are deduplicated by text; action steps are matched by position and
updated with the latest status.

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

Reads `php-data.json` and generates a FHIR R4 collection Bundle following the
[Person-Centered Outcomes (PCO) IG](https://build.fhir.org/ig/HL7/pco-ig).

**Input:** `php-data.json`

**Output:** `fhir-bundle-output.json`

**Bundle resources:**

| Resource | Profile | Content |
|---|---|---|
| `Patient` | base R4 | Name (no MRN) |
| `Observation` | base R4 | What Matters Most narrative (SNOMED 247751003) |
| `Observation` | base R4 | WBS panel — Q1/Q2/Q3 components |
| `Goal` | `pco-gas-goal-profile` | Long-term SMART goal |
| `Observation` | `pco-readiness-assessment` | Importance + confidence rulers |
| `ServiceRequest` | base R4 | Action step(s), linked via `pertainsToGoal` |

> **Note:** WBS LOINC codes are not yet assigned. The bundle uses a temporary
> Mountain Lotus CodeSystem (`http://mtnlotus.com/fhir/whole-health-cards/CodeSystem/well-being-signs`).
> See `fhir-templates/fhir-bundle.json` for the authoritative template.

---

### `/generate-php`

Reads `php-data.json` and generates a patient-facing Personal Health Plan PDF
in VA Whole Health visual style.

**Input:** `php-data.json`

**Output:** `personal-health-plan.pdf`

**PDF sections:**

| Section | Content |
|---|---|
| Header | VA Whole Health wordmark · patient name · date |
| My Why | Purpose quote (highlighted) · Mission · Aspiration |
| What Matters Most to Me | MAP narrative |
| My Well-Being Signs | Score bars for Q1/Q2/Q3 · overall average |
| My Goals | Goal text · Importance/Confidence bars · Action Steps with status badges |
| My Strengths & Values | Strengths · Values · Vision |
| Next Steps | Discharge / follow-up plan |
| Footer | Branding + page number |

---

## Project Structure

```
coach-skills/
├── AGENTS.md                   # AI model instructions
├── SKILLS.md                   # This file
├── requirements.txt
├── src/
│   ├── models.py               # Pydantic v2 intermediate schema
│   ├── parse_notes.py          # DOCX → php-data.json
│   ├── generate_fhir.py        # php-data.json → FHIR R4 Bundle
│   └── generate_pdf.py         # php-data.json → patient PDF
├── .claude/
│   └── skills/
│       ├── parse-notes.md      # /parse-notes skill definition
│       ├── generate-fhir.md    # /generate-fhir skill definition
│       └── generate-php.md     # /generate-php skill definition
├── note-examples/              # De-identified example DOCX progress notes
│   ├── Health and Wellness Coaching Initial Visit.docx
│   ├── Health and Wellness Coaching Middle Visit.docx
│   └── Health and Wellness Coaching Final Visit.docx
└── fhir-templates/
    └── fhir-bundle.json        # Reference FHIR bundle template
```

---

## Resources

- [VA Whole Health](https://www.va.gov/ann-arbor-health-care/programs/whole-health/)
- [Well-Being Signs (WBS)](https://www.va.gov/wholehealth/professional-resources/well-being-measurement.asp)
- [How to Set a SMART Goal](https://www.va.gov/WHOLEHEALTHLIBRARY/tools/how-to-set-a-smart-goal.asp)
- [Person-Centered Outcomes (PCO) FHIR IG](https://build.fhir.org/ig/HL7/pco-ig)

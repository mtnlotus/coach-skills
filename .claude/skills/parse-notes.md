# Parse Coach Notes

Parse one or more Health & Wellness Coaching progress notes into structured
JSON files for use by the FHIR and PDF generators.

## Instructions

When the user invokes this skill:

1. Identify the input: the user may supply a path to a directory, one or more
   individual file paths, or nothing (default: `clinical-notes/`). Both DOCX
   and plain-text (`.txt`) files are supported and may be mixed in a directory.

2. Run the parser:
   ```
   pnpm parse-notes <input> -o output/php-data.json
   ```
   Replace `<input>` with the path(s) the user provided, or `clinical-notes/` if
   none were given. The `output/` directory is created automatically.

3. After the script completes, read `output/php-data.json` and summarise what
   was extracted:
   - Patient name
   - Number of sessions parsed and their dates
   - Whether a WBS assessment was found and the scores
   - Number of long-term goals and action steps
   - Whether a final session / discharge plan was detected

4. Flag any fields that appear missing or unexpected so the user can review the
   source notes.

## Context

- Source notes may be DOCX files exported from an EHR, or plain-text files
  with the same content and paragraph structure. They follow the VA Health and
  Wellness Coaching visit template but may vary in wording.
- The parser applies a most-recent-wins merge: WBS scores and goal ruler values
  from later sessions override earlier ones. Notes are sorted by DATE OF NOTE.
- Two output files are written to `output/` by default:
  - `php-data.json` — merged view used by `/generate-pdf`
  - `php-notes.json` — per-note array (sorted by date) used by `/generate-fhir`
- Override the output path with `-o <path>` (the notes JSON is written to the
  same directory).
- The intermediate JSON is the contract between all skills; do not edit it
  manually unless correcting a clear parsing error.

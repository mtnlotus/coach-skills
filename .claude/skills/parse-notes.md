# Parse Coach Notes

Parse one or more Health & Wellness Coaching progress notes (DOCX) into a
structured `php-data.json` file for use by the FHIR and PDF generators.

## Instructions

When the user invokes this skill:

1. Identify the input: the user may supply a path to a directory of DOCX files,
   one or more individual DOCX file paths, or nothing (default: `clinical-notes/`).

2. Run the parser:
   ```
   python3 src/parse_notes.py <input> -o output/php-data.json
   ```
   Replace `<input>` with the path(s) the user provided, or `clinical-notes/` if
   none were given. The `output/` directory is created automatically.

3. After the script completes, read `php-data.json` and summarise what was
   extracted:
   - Patient name
   - Number of sessions parsed
   - Whether a WBS assessment was found and the scores
   - Number of long-term goals and action steps
   - Whether a final session / discharge plan was detected

4. Flag any fields that appear missing or unexpected so the user can review the
   source notes.

## Context

- Source notes are DOCX files exported from an EHR. They follow the VA Health
  and Wellness Coaching visit template but may vary in wording.
- The parser applies a most-recent-wins merge: WBS scores and goal ruler values
  from later sessions override earlier ones.
- Output is written to `output/php-data.json` by default; the `output/`
  directory is created automatically. Override with `-o <path>`.
- The intermediate JSON is the contract between all three skills; do not edit it
  manually unless correcting a clear parsing error.

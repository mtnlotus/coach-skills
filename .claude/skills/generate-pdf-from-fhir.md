# Generate Personal Health Plan PDF from FHIR Bundle

Generate a patient-friendly Personal Health Plan (PHP) PDF directly from a
FHIR R4 Bundle, without requiring the intermediate `php-data.json`.

## Instructions

When the user invokes this skill:

1. Identify the input bundle: the user may supply a path to a FHIR JSON file,
   or nothing (default: `output/fhir-bundle.json`).

2. Run the generator:
   ```
   pnpm generate-pdf-from-fhir <input> -o output/personal-health-plan.pdf
   ```
   Replace `<input>` with the path the user provided, or omit for the default.

3. Confirm the file was written and report its size.

4. If the user asks to open the file, run:
   ```
   open <output.pdf>
   ```

5. Note to the user that the following sections will be absent because they are
   not encoded in the FHIR bundle: **My Strengths & Values** and **Next Steps**.
   If those sections are needed, generate the PDF from `php-data.json` using
   `/generate-pdf` instead.

## PDF Contents (in order)

1. **Header** — VA Whole Health wordmark, "Personal Health Plan" title,
   patient name, most recent session date
2. **Mission, Aspiration, Purpose (MAP)** — Purpose quote (accent bar),
   Mission, Aspiration, What Matters Most narrative
3. **My Well-Being Signs** — Score bars for Q1/Q2/Q3 + overall average
   (most recent session)
4. **My Goals** — Goal text box, Importance/Confidence bars (most recent
   session values), rationale notes, Action Steps with COMPLETED / IN PROGRESS
   / NOT MET badges (all sessions)
5. **Footer** — "VA Whole Health • Personal Health Plan" + page number

## Context

- The input must be a FHIR R4 collection Bundle as produced by `/generate-fhir`.
- Readiness scores (importance/confidence) use most-recent-wins: the last
  readiness Observation referencing a Goal wins.
- WBS scores come from the last WBS Observation in the bundle (most recent
  session).
- Fields absent from the bundle (strengths, values, vision, discharge plan)
  are silently omitted; no error is raised.

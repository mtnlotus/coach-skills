# Generate Personal Health Plan PDF

Generate a patient-friendly Personal Health Plan (PHP) PDF from `php-data.json`
using VA Whole Health visual branding.

## Instructions

When the user invokes this skill:

1. Confirm that `output/php-data.json` exists. If not, tell the user to run
   `/parse-notes` first.

2. Ask for (or infer from context):
   - The report date as a human-readable string, e.g. `"April 13, 2026"`.
     Default to today's date formatted as `Month D, YYYY`.
   - The output filename. Default: `personal-health-plan.pdf`.

3. Run the generator:
   ```
   pnpm generate-pdf output/php-data.json --date "<date>" -o output/personal-health-plan.pdf
   ```
   The `output/` directory is created automatically.

4. Confirm the file was written and report its size.

5. If the user asks to open the file, run:
   ```
   open <output.pdf>
   ```

## PDF Contents (in order)

1. **Header** — VA Whole Health wordmark, "Personal Health Plan" title,
   patient name, most recent session date
2. **Mission, Aspiration, Purpose (MAP)** — Purpose quote (accent bar),
   Mission, Aspiration, What Matters Most narrative
3. **My Well-Being Signs** — Score bars for Q1/Q2/Q3 + overall average
4. **My Goals** — Goal text box, Importance/Confidence bars, rationale notes,
   Action Steps with COMPLETED / IN PROGRESS / NOT MET badges
5. **My Strengths & Values** — Strengths · Values · Vision (inline lists)
6. **Next Steps** — Discharge / follow-up plan
7. **Footer** — "VA Whole Health • Personal Health Plan" + page number

## Notes

- Font: Arial TTF from `/System/Library/Fonts/Supplemental/` (macOS).
  On other platforms, update font paths in `src/generate_pdf.py` or the
  generator falls back to built-in Helvetica.
- Layout targets a single Letter page for a typical coaching arc (1 long-term
  goal, 1–3 action steps). Longer plans paginate automatically with the footer
  on every page.

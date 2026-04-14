# Generate FHIR Bundle

Generate a FHIR R4 collection Bundle from `php-data.json` following the
Person-Centered Outcomes (PCO) Implementation Guide.

## Instructions

When the user invokes this skill:

1. Confirm that `output/php-data.json` exists. If not, tell the user to run
   `/parse-notes` first.

2. Ask for (or infer from context) the session date in YYYY-MM-DD format.
   Use today's date if not provided.

3. Run the generator:
   ```
   pnpm generate-fhir output/php-data.json --date <YYYY-MM-DD> -o output/fhir-bundle-output.json
   ```
   The `output/` directory is created automatically.

4. Read the output file and summarise the bundle:
   - Resources included (list by resourceType and fullUrl)
   - Goal lifecycle status
   - WBS scores recorded
   - Action step status(es)

5. Note any temporary codes in use (WBS CodeSystem is `http://mtnlotus.com/fhir/...`)
   that will need to be replaced once official LOINC codes are assigned.

## Bundle Structure

| resource | Type | Profile |
|---|---|---|
| resource:0 | Patient | base R4 |
| resource:1 | Observation | What Matters Most (SNOMED 247751003) |
| resource:2 | Observation | WBS panel — mtnlotus temp CodeSystem |
| resource:3 | Goal | PCO GAS Goal (`pco-gas-goal-profile`) |
| resource:4 | Observation | Readiness assessment (`pco-readiness-assessment`) |
| resource:5+ | ServiceRequest | Action step(s), linked via `pertainsToGoal` |

## References

- PCO IG: https://build.fhir.org/ig/HL7/pco-ig
- WBS codes: temporary until LOINC assignment; see `fhir-templates/fhir-bundle.json`

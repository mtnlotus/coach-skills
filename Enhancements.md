# Enhancements

# Iterations
1. In the PDF summary, add text into Well-Being Signs including intro and question text from the clinical note. Intro text: "Over the past month (0 = none of the time/10 = all of the time), on average how often have you been:"  Question 1: "Fully satisfied with how these things are going?", and similar for questions 2 and 3.
2. Consolidate all clinical note content under "Mission, Aspiration, Purpose (MAP)" into a single PDF section and into one FHIR Observation for Sense of Purpose. Use "Mission, Aspiration, Purpose (MAP)" as the PDF section title. Remove "What Matters Most to Me" section.
3. Parse DATE OF NOTE from clinical note heading, use this to sequence order of encounters and for Goal.startDate, Observation.effectiveDateTime, ServiceRequest.occurrencePeriod.start
4. The clinical note date is not parsing correctly. Initial Visit  DATE OF NOTE: DEC 08, 2025@11:00 should parse to 2025-12-08 at 11:00
5. In the PDF heading, use the most recent clinical note date instead of current date.  

# Features
1. When several clinical notes are available, include all resources from all notes as full history in the FHIR bundle. Do not create empty resources when sections are missing from a clinical note. Show only the most recent value for each section in the PDF summary. If a MAP statement or goal is unchanged in subsequent clinical notes, include only the first occurrence.
2. A subsequent clinical note may change the action steps (short-term goals) for an existing long-term goal that is unchanged. Include the new action steps for the existing goal.
3. The Readiness Ruler in clinical note may contain a note for importance and a note for confidence, e.g. in Middle Visit, importance note is: "Veteran said 8 because by prioritizing their mindset they will be able to be successful in other areas of their life and have control". Add both notes into FHIR Observation.note as 2 Annotations
4. Also include the previous line into each note, e.g. include "Goal is important to Veteran because:" as prefix in the first note.
5. The PDF now includes 3 blank pages at the end. Can you remove these?

## Enhancements
1. Accept two alternative inputs with clinical notes provided as .docx files or .txt plain text format. The plain text notes contain the same content and formatting as the docx.
2. Accept input from a FHIR Bundle, without having any docx or txt note files, and use it to render a PDF summary. Use the FHIR bundle you already generate containing the personal health plan data as input for requirements. If needed, recommend additions to resource templates in the FHIR Bundle.
3. Sorry, I did not provide enough direction for that last update. Do NOT add additional resources into the FHIR Bundle. Keep the bundle contents as they were before this update and create the PDF using whatever is present. Yes, some of the content from the clinical note will be missing.


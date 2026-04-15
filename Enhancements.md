# Enhancements

# Iterations
1. In the PDF summary, add text into Well-Being Signs including intro and question text from the clinical note. Intro text: "Over the past month (0 = none of the time/10 = all of the time), on average how often have you been:"  Question 1: "Fully satisfied with how these things are going?", and similar for questions 2 and 3.
2. Consolidate all clinical note content under "Mission, Aspiration, Purpose (MAP)" into a single PDF section and into one FHIR Observation for Sense of Purpose. Use "Mission, Aspiration, Purpose (MAP)" as the PDF section title. Remove "What Matters Most to Me" section.


# New Features
1. When several clinical notes are available, include all resources from all notes as full history in the FHIR bundle. Do not create empty resources when sections are missing from a clinical note. Show only the most recent value for each section in the PDF summary.
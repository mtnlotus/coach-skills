# AGENTS.md

This document provides essential context for AI models interacting with this project. Adhering to these guidelines will ensure consistency and maintain code quality.

## Project Overview & Purpose

See Mountain Lotus WellBeing [project documents](../shc-documents/)

You are an NBHWC Board Certified Health & Wellness Coach working with individuals to create a Personal Health Plan (PHP) that includes thier Why Statement (sense of purpose), results of Well-Being Signs assessment, long-term goals, and short-term goals (action steps) for each long-term goal.

* MVP Features
    * SKILLS used by a Health & Wellness Coach to create a Personal Health Plan (PHP) for a person based on clinical notes recored in the EHR from a series of coaching sessions.
    * Read a coach's progress note based on rough template structures included as examples. The note documents may be in a variety of different formats: .docx, .pdf, .html, or plain text.
    * Generate a PDF document that summarizes a Personal Health Plan from the progress notes.
    * Generate a FHIR R4 Bundle containing resources that follow the Person-Centered Outcomes (PCO) FHIR IG

## Examples
* [Example health coach progress notes ](./note-examples/)
    * These notes are de-identified real-world examples that reflect actual use in practice as recorded in the EHR.
* [FHIR Bundle resource templates](./fhir-templates)
    * A FHIR bundle is provided with resource templates based on the PCO FHIR IG.

## Resources

* [Introduction to Whole Health](https://www.va.gov/ann-arbor-health-care/programs/whole-health/)
* [How to set a SMART Goal](https://www.va.gov/WHOLEHEALTHLIBRARY/tools/how-to-set-a-smart-goal.asp)
* [VA Passport to Whole Health](https://www.va.gov/wholehealthlibrary/passport/)
* [Well-Being Signs (WBS)](https://www.va.gov/wholehealth/professional-resources/well-being-measurement.asp)

## Specifications

* [Person-Centered Outcomes (PCO)](https://build.fhir.org/ig/HL7/pco-ig)
<!-- * [SMART Health Cards and Links](https://build.fhir.org/ig/HL7/smart-health-cards-and-links) -->

## Open-Source Reference Implementations

<!-- * [Health Skillz](https://github.com/jmandel/health-skillz) - Health Skillz helps people collect SMART on FHIR records from patient portals, review/export them locally, and optionally share them with AI using end-to-end encrypted upload. -->

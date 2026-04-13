#!/usr/bin/env python3
"""
Generate a FHIR R4 Bundle (PCO IG) from a PHP data JSON file.

Usage:
    python3 generate_fhir.py [php-data.json] [-o fhir-bundle.json] [--date YYYY-MM-DD]

The bundle follows the structure established in fhir-templates/fhir-bundle.json:
  resource:0  Patient
  resource:1  Observation — What Matters Most / MAP narrative (SNOMED 247751003)
  resource:2  Observation — Well-Being Signs panel (mtnlotus temp CodeSystem)
  resource:3  Goal — long-term SMART goal (PCO GAS profile)
  resource:4  Observation — Readiness assessment / importance+confidence (PCO)
  resource:5+ ServiceRequest — action step(s), linked to Goal via pertainsToGoal
"""

import argparse
import json
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Optional

from models import ActionStep, Goal, PhpData

# ---------------------------------------------------------------------------
# Code system constants (from fhir-templates/fhir-bundle.json)
# ---------------------------------------------------------------------------

SNOMED_SYSTEM = "http://snomed.info/sct"
WHAT_MATTERS_CODE = "247751003"  # temporary — LOINC TBD

WBS_SYSTEM = "http://mtnlotus.com/fhir/whole-health-cards/CodeSystem/well-being-signs"
WBS_PANEL_CODE = "well-being-signs"

PCO_READINESS_SYSTEM = "http://hl7.org/fhir/us/pco/CodeSystem/readiness-assessment-concepts"

PCO_GAS_GOAL_PROFILE = "http://hl7.org/fhir/us/pco/StructureDefinition/pco-gas-goal-profile"
PCO_READINESS_PROFILE = "http://hl7.org/fhir/us/pco/StructureDefinition/pco-readiness-assessment"

PERTAINSTOGOAL_URL = "http://hl7.org/fhir/StructureDefinition/resource-pertainsToGoal"


# ---------------------------------------------------------------------------
# Resource builders
# ---------------------------------------------------------------------------

def _ref(resource_index: int) -> dict:
    return {"reference": f"resource:{resource_index}"}


def build_patient(php: PhpData) -> dict:
    resource: dict[str, Any] = {"resourceType": "Patient"}
    if php.patient:
        name: dict[str, Any] = {}
        if php.patient.family:
            name["family"] = php.patient.family
        if php.patient.given:
            name["given"] = php.patient.given
        if name:
            resource["name"] = [name]
        if php.patient.birth_date:
            resource["birthDate"] = php.patient.birth_date
    return resource


def build_what_matters_obs(php: PhpData, patient_idx: int, obs_date: Optional[str]) -> dict:
    """Observation for the MAP / What Matters Most narrative."""
    # Prefer the middle-visit narrative; fall back to MAP purpose if unavailable
    text = php.what_matters_most
    if not text and php.map:
        parts = [
            php.map.mission or "",
            php.map.aspiration or "",
            php.map.purpose or "",
        ]
        text = " ".join(p for p in parts if p).strip()

    resource: dict[str, Any] = {
        "resourceType": "Observation",
        "status": "final",
        "code": {
            "coding": [{"system": SNOMED_SYSTEM, "code": WHAT_MATTERS_CODE}]
        },
        "subject": _ref(patient_idx),
    }
    if obs_date:
        resource["effectiveDateTime"] = _to_datetime(obs_date)
    if text:
        resource["valueString"] = text

    return resource


def build_wbs_obs(php: PhpData, patient_idx: int, obs_date: Optional[str] = None) -> Optional[dict]:
    """Panel Observation for the most recent Well-Being Signs assessment."""
    wbs = php.wbs
    if not wbs:
        return None

    components: list[dict] = []

    def _component(code: str, value: Optional[int]) -> Optional[dict]:
        if value is None:
            return None
        return {
            "code": {"coding": [{"system": WBS_SYSTEM, "code": code}]},
            "valueInteger": value,
        }

    for code, value in (
        ("satisfied", wbs.satisfied),
        ("involved", wbs.involved),
        ("functioning", wbs.functioning),
    ):
        c = _component(code, value)
        if c:
            components.append(c)

    resource: dict[str, Any] = {
        "resourceType": "Observation",
        "status": "final",
        "code": {
            "coding": [{"system": WBS_SYSTEM, "code": WBS_PANEL_CODE}]
        },
        "subject": _ref(patient_idx),
    }
    effective = wbs.session_date or obs_date
    if effective:
        resource["effectiveDateTime"] = _to_datetime(effective)
    if components:
        resource["component"] = components

    return resource


def build_goal(goal: Goal, patient_idx: int) -> dict:
    resource: dict[str, Any] = {
        "resourceType": "Goal",
        "meta": {"profile": [PCO_GAS_GOAL_PROFILE]},
        "lifecycleStatus": goal.lifecycle_status,
        "description": {"text": goal.text},
        "subject": _ref(patient_idx),
    }
    if goal.start_date:
        resource["startDate"] = goal.start_date
    return resource


def build_readiness_obs(
    goal: Goal, patient_idx: int, goal_idx: int, obs_date: Optional[str]
) -> Optional[dict]:
    """PCO readiness assessment (importance + confidence) for a goal."""
    if goal.importance is None and goal.confidence is None:
        return None

    components: list[dict] = []
    if goal.importance is not None:
        components.append({
            "code": {
                "coding": [{
                    "code": "importance",
                    "display": "Importance of change",
                    "system": PCO_READINESS_SYSTEM,
                }]
            },
            "valueInteger": goal.importance,
        })
    if goal.confidence is not None:
        components.append({
            "code": {
                "coding": [{
                    "code": "confidence",
                    "display": "Confidence to change",
                    "system": PCO_READINESS_SYSTEM,
                }]
            },
            "valueInteger": goal.confidence,
        })

    resource: dict[str, Any] = {
        "resourceType": "Observation",
        "meta": {"profile": [PCO_READINESS_PROFILE]},
        "status": "final",
        "code": {
            "coding": [{
                "code": "readiness-assessment",
                "display": "Readiness assessment",
                "system": PCO_READINESS_SYSTEM,
            }]
        },
        "subject": _ref(patient_idx),
        "focus": [_ref(goal_idx)],
    }
    if obs_date:
        resource["effectiveDateTime"] = _to_datetime(obs_date)
    if components:
        resource["component"] = components

    return resource


def build_service_request(
    step: ActionStep, patient_idx: int, goal_idx: int
) -> dict:
    """ServiceRequest for one action step, linked to its long-term goal."""
    resource: dict[str, Any] = {
        "resourceType": "ServiceRequest",
        "status": _sr_status(step.status),
        "intent": "order",
        "code": {"text": step.text},
        "subject": _ref(patient_idx),
        "extension": [{
            "url": PERTAINSTOGOAL_URL,
            "valueReference": _ref(goal_idx),
        }],
    }
    if step.start_date or step.end_date:
        period: dict[str, str] = {}
        if step.start_date:
            period["start"] = _to_datetime(step.start_date)
        if step.end_date:
            period["end"] = _to_datetime(step.end_date)
        resource["occurrencePeriod"] = period
    return resource


# ---------------------------------------------------------------------------
# Bundle assembler
# ---------------------------------------------------------------------------

def build_bundle(php: PhpData, session_date: Optional[str] = None) -> dict:
    """
    Assemble a FHIR R4 collection Bundle from PhpData.

    resource indices follow the template convention:
      0  Patient
      1  What Matters Most Observation
      2  WBS Observation (omitted if no WBS data)
      3+ Goal + Readiness + ServiceRequests (per long-term goal)
    """
    entries: list[dict] = []

    def _add(resource: Optional[dict]) -> int:
        """Append resource to entries; return its resource index."""
        idx = len(entries)
        if resource is not None:
            entries.append({
                "fullUrl": f"resource:{idx}",
                "resource": resource,
            })
        return idx

    patient_idx = _add(build_patient(php))
    _add(build_what_matters_obs(php, patient_idx, session_date))

    wbs_resource = build_wbs_obs(php, patient_idx, session_date)
    if wbs_resource:
        _add(wbs_resource)

    for goal in php.goals:
        goal_idx = _add(build_goal(goal, patient_idx))
        readiness = build_readiness_obs(goal, patient_idx, goal_idx, session_date)
        if readiness:
            _add(readiness)
        for step in goal.action_steps:
            _add(build_service_request(step, patient_idx, goal_idx))

    return {
        "resourceType": "Bundle",
        "type": "collection",
        "entry": entries,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_datetime(date_str: str) -> str:
    """
    Ensure a date string is ISO-8601 datetime with UTC offset.
    Accepts YYYY-MM-DD or a full datetime string; returns datetime string.
    """
    try:
        d = date.fromisoformat(date_str)
        return datetime(d.year, d.month, d.day, tzinfo=timezone.utc).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
    except ValueError:
        return date_str  # already a datetime string; pass through


def _sr_status(status: Optional[str]) -> str:
    """Map note goal status to FHIR ServiceRequest.status."""
    mapping = {
        "met": "completed",
        "not-met": "stopped",
        "in-progress": "active",
    }
    return mapping.get(status or "", "active")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate a FHIR R4 PCO Bundle from PHP data JSON."
    )
    parser.add_argument(
        "input",
        nargs="?",
        default="output/php-data.json",
        metavar="FILE",
        help="Parsed PHP data JSON file (default: output/php-data.json).",
    )
    parser.add_argument(
        "-o",
        "--output",
        default="output/fhir-bundle-output.json",
        metavar="FILE",
        help="Output FHIR bundle JSON file (default: output/fhir-bundle-output.json).",
    )
    parser.add_argument(
        "--date",
        metavar="YYYY-MM-DD",
        help="Date of the most recent session (used for Observation.effectiveDateTime).",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: {input_path} not found.", file=sys.stderr)
        sys.exit(1)

    raw = json.loads(input_path.read_text())
    php = PhpData.model_validate(raw)

    session_date = args.date or date.today().isoformat()

    bundle = build_bundle(php, session_date=session_date)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(bundle, indent="\t"))
    print(f"Written to {output_path}", file=sys.stderr)


if __name__ == "__main__":
    main()

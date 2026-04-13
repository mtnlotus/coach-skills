#!/usr/bin/env python3
"""
Parse health coaching progress notes (DOCX) into a PHP data JSON file.

Usage:
    python3 parse_notes.py <note1.docx> [note2.docx ...] [-o php-data.json]
    python3 parse_notes.py note-examples/ [-o php-data.json]
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Optional

from docx import Document

from models import ActionStep, Goal, Map, Patient, PhpData, WbsAssessment


# ---------------------------------------------------------------------------
# Low-level paragraph extraction
# ---------------------------------------------------------------------------

def _load_paragraphs(docx_path: Path) -> list[str]:
    """Return all paragraph texts, stripped of leading/trailing whitespace."""
    doc = Document(str(docx_path))
    return [p.text.strip() for p in doc.paragraphs]


# ---------------------------------------------------------------------------
# Single-note parser
# ---------------------------------------------------------------------------

class _NoteParser:
    """Extract structured fields from one DOCX progress note."""

    def __init__(self, paras: list[str], source: str = ""):
        self.paras = paras
        self.n = len(paras)
        self.source = source

    # -- helpers -------------------------------------------------------------

    def _next_nonempty(self, idx: int) -> tuple[int, str]:
        for i in range(idx + 1, self.n):
            if self.paras[i]:
                return i, self.paras[i]
        return -1, ""

    def _find_int_in_window(self, start: int, window: int = 10) -> Optional[int]:
        """Return first standalone integer found in the next `window` paragraphs."""
        for i in range(start + 1, min(start + window, self.n)):
            text = self.paras[i]
            if re.fullmatch(r"\d+", text):
                return int(text)
        return None

    def _collect_until(self, start: int, stop_re: str, max_lines: int = 20) -> str:
        """Join paragraphs from `start` until an empty line or `stop_re` matches."""
        parts = []
        for i in range(start, min(start + max_lines, self.n)):
            text = self.paras[i]
            if not text:
                break
            if stop_re and re.search(stop_re, text):
                break
            parts.append(text)
        return " ".join(parts)

    # -- section parsers -----------------------------------------------------

    def _parse_wbs(self, avg_idx: int) -> WbsAssessment:
        """Parse a WBS block starting at the 'WBS Average Score:' paragraph."""
        m = re.search(r"WBS Average Score:\s*([\d.]+)", self.paras[avg_idx])
        average = float(m.group(1)) if m else None

        satisfied = involved = functioning = None
        for j in range(avg_idx, min(avg_idx + 25, self.n)):
            p = self.paras[j]
            if re.search(r"1\.\s*Fully satisfied", p):
                _, v = self._next_nonempty(j)
                try:
                    satisfied = int(v)
                except (ValueError, TypeError):
                    pass
            elif re.search(r"2\.\s*Regularly involved", p):
                _, v = self._next_nonempty(j)
                try:
                    involved = int(v)
                except (ValueError, TypeError):
                    pass
            elif re.search(r"3\.\s*Functioning your best", p):
                _, v = self._next_nonempty(j)
                try:
                    functioning = int(v)
                except (ValueError, TypeError):
                    pass

        return WbsAssessment(
            average=average,
            satisfied=satisfied,
            involved=involved,
            functioning=functioning,
        )

    def _parse_map_initial(self, map_idx: int) -> tuple[Optional[Map], Optional[str]]:
        """
        Parse the MAP section.  Initial visits have labelled Mission/Aspiration/Purpose
        lines; middle visits have a single narrative block.

        Returns (Map | None, what_matters_most_narrative | None).
        """
        mission = aspiration = purpose = None
        narrative_parts: list[str] = []

        i = map_idx + 1
        while i < self.n:
            p = self.paras[i]

            if re.match(r"Veteran described:", p, re.I):
                i += 1
                continue

            if re.match(r"Mission is to", p, re.I):
                parts = [p]
                j = i + 1
                while j < self.n and self.paras[j] and not re.match(
                    r"Aspirations|Purpose:|Veteran was seen", self.paras[j], re.I
                ):
                    parts.append(self.paras[j])
                    j += 1
                mission = " ".join(parts)
                i = j
                continue

            if re.match(r"Aspirations when younger", p, re.I):
                parts = [p]
                j = i + 1
                while j < self.n and self.paras[j] and not re.match(
                    r"Purpose:|Veteran was seen", self.paras[j], re.I
                ):
                    parts.append(self.paras[j])
                    j += 1
                aspiration = " ".join(parts)
                i = j
                continue

            if re.match(r"Purpose:", p, re.I):
                m_purpose = re.match(r"Purpose:\s*(.+)", p, re.I)
                purpose = m_purpose.group(1).strip() if m_purpose else ""
                i += 1
                break

            # Stop at major section headers or empty-line-then-header patterns
            if re.match(r"Veteran was seen|VETERANS GOALS|PLAN|ADDITIONAL", p):
                break

            # Middle-visit MAP is a narrative block
            if p:
                narrative_parts.append(p)

            i += 1

        if mission or aspiration or purpose:
            return Map(mission=mission, aspiration=aspiration, purpose=purpose), None

        narrative = " ".join(narrative_parts).strip() if narrative_parts else None
        return None, narrative

    def _parse_long_term_goals(self, section_idx: int, section_end: int) -> list[dict]:
        """Parse long-term goal text, importance, and confidence."""
        goals: list[dict] = []
        current: dict = {}

        i = section_idx + 1
        while i < section_end:
            p = self.paras[i]

            if re.search(r"Collaboratively identified new long-term", p):
                # Goal text starts on the next non-empty line and spans until
                # an empty line or a ruler section
                j, _ = self._next_nonempty(i)
                if j > 0:
                    text_parts: list[str] = []
                    k = j
                    while k < section_end and self.paras[k] and not re.search(
                        r"Utilized (Importance|Confidence) Ruler", self.paras[k]
                    ):
                        text_parts.append(self.paras[k])
                        k += 1
                    current["text"] = " ".join(text_parts)

            elif "Utilized Importance Ruler:" in p:
                val = self._find_int_in_window(i)
                if val is not None:
                    current["importance"] = val

            elif "Utilized Confidence Ruler:" in p:
                val = self._find_int_in_window(i)
                if val is not None:
                    current["confidence"] = val

            i += 1

        if current.get("text"):
            goals.append(current)

        return goals

    def _parse_short_term_goals(self, section_idx: int, section_end: int) -> list[dict]:
        """Parse short-term goals (action steps): text, importance, confidence, status."""
        goals: list[dict] = []
        current: Optional[dict] = None

        i = section_idx + 1
        while i < section_end:
            p = self.paras[i]

            if re.match(r"Goal \d+:", p):
                if current and current.get("text"):
                    goals.append(current)
                current = {"importance": None, "confidence": None, "status": "in-progress"}

                # Collect goal text in the lines that follow
                text_parts: list[str] = []
                j = i + 1
                while j < section_end and self.paras[j] and not re.search(
                    r"Utilized (Importance|Confidence) Ruler|Veteran reports goal was:",
                    self.paras[j],
                ):
                    text_parts.append(self.paras[j])
                    j += 1
                current["text"] = " ".join(text_parts)

            elif current is not None:
                if "Utilized Importance Ruler:" in p:
                    val = self._find_int_in_window(i)
                    if val is not None:
                        current["importance"] = val

                elif "Utilized Confidence Ruler:" in p:
                    val = self._find_int_in_window(i)
                    if val is not None:
                        current["confidence"] = val

                elif "Veteran reports goal was:" in p:
                    _, status_text = self._next_nonempty(i)
                    if status_text:
                        current["status"] = status_text.lower().replace(" ", "-")

            i += 1

        if current and current.get("text"):
            goals.append(current)

        return goals

    def _parse_plan(self, plan_section_idx: int) -> Optional[str]:
        """Extract discharge/follow-up plan text from the PLAN section."""
        parts: list[str] = []
        collecting = False

        for i in range(plan_section_idx + 1, self.n):
            p = self.paras[i]
            if p == "Plan:":
                collecting = True
                continue
            if not collecting:
                continue
            # Skip boilerplate follow-up lines
            if re.match(r"Arranged follow-up|Veteran agreed to follow-up", p):
                continue
            if p == "In-person visit":
                continue
            if p:
                parts.append(p)
            elif parts:
                break  # stop at first blank line after content

        return " ".join(parts).strip() or None

    # -- main entry point ----------------------------------------------------

    def parse(self) -> dict:
        result: dict = {
            "source": self.source,
            "session_number": None,
            "visit_type": None,
            "patient_name": None,
            "values": [],
            "vision": None,
            "strengths": [],
            "wbs": None,
            "map": None,
            "what_matters_most": None,
            "long_term_goals": [],
            "short_term_goals": [],
            "is_final_session": False,
            "discharge_plan": None,
        }

        # First pass: find section boundaries for goals
        lt_start = lt_end = st_start = st_end = -1
        for idx, p in enumerate(self.paras):
            if re.match(r"Long-Term S\.M\.A\.R\.T\.", p):
                lt_start = idx
            elif re.match(r"Short-Term S\.M\.A\.R\.T\.", p):
                if lt_start >= 0 and lt_end < 0:
                    lt_end = idx
                st_start = idx
            elif re.match(r"Today's coaching session aligns", p):
                if st_start >= 0 and st_end < 0:
                    st_end = idx
            elif re.match(r"ADDITIONAL SESSION INFORMATION", p):
                if st_start >= 0 and st_end < 0:
                    st_end = idx

        if lt_end < 0 and lt_start >= 0:
            lt_end = st_start if st_start > lt_start else self.n
        if st_end < 0 and st_start >= 0:
            st_end = self.n

        # Second pass: sequential extraction
        i = 0
        while i < self.n:
            p = self.paras[i]

            # --- session metadata ---
            if re.match(r"\*Session number:", p):
                _, val = self._next_nonempty(i)
                try:
                    result["session_number"] = int(val)
                except (ValueError, TypeError):
                    pass

            elif re.match(r"\*Type of Visit:", p):
                _, val = self._next_nonempty(i)
                result["visit_type"] = val.lower() if val else None

            # --- patient name ---
            elif re.match(r"What really matters to ", p):
                m = re.match(r"What really matters to (.+?)\.?\s*$", p)
                if m:
                    result["patient_name"] = m.group(1).strip()

            # --- values & vision (in 'Additional information' block) ---
            elif re.match(r"Additional information", p):
                # Scan ahead for values/vision/strengths content
                j = i + 1
                block_lines: list[str] = []
                while j < self.n and self.paras[j] and not re.match(
                    r"Time spent|Well-Being|What really matters|Mission|VETERANS|ADDITIONAL SESSION|PLAN",
                    self.paras[j],
                ):
                    block_lines.append(self.paras[j])
                    j += 1

                block = " ".join(block_lines)

                # Values
                m_vals = re.search(
                    r"Veteran's values:\s*(.+?)(?:Vision for future:|$)",
                    block, re.I | re.S,
                )
                if m_vals:
                    raw = m_vals.group(1).strip().rstrip(",")
                    result["values"] = [v.strip() for v in raw.split(",") if v.strip()]

                # Vision
                m_vis = re.search(r"Vision for future:\s*(.+?)$", block, re.I | re.S)
                if m_vis:
                    result["vision"] = m_vis.group(1).strip()

                # Strengths
                for line in block_lines:
                    m_str = re.match(r"Strengths discussed and identified:\s*(.+)", line, re.I)
                    if m_str:
                        result["strengths"] = [
                            s.strip() for s in m_str.group(1).split(",") if s.strip()
                        ]
                        break

            # --- WBS ---
            elif "WBS Average Score:" in p:
                result["wbs"] = self._parse_wbs(i)
                if result["session_number"] is not None and result["wbs"]:
                    result["wbs"].session_number = result["session_number"]

            # --- MAP ---
            elif "Mission, Aspiration, Purpose (MAP)" in p:
                map_obj, narrative = self._parse_map_initial(i)
                if map_obj:
                    result["map"] = map_obj.model_dump(exclude_none=True)
                if narrative:
                    result["what_matters_most"] = narrative

            # --- final session flag ---
            elif "This was a final coaching session" in p:
                result["is_final_session"] = True

            # --- goals (delegated to section parsers) ---
            elif lt_start >= 0 and i == lt_start:
                result["long_term_goals"] = self._parse_long_term_goals(lt_start, lt_end)

            elif st_start >= 0 and i == st_start:
                result["short_term_goals"] = self._parse_short_term_goals(st_start, st_end)

            # --- plan ---
            elif re.match(r"^PLAN$", p):
                result["discharge_plan"] = self._parse_plan(i)

            i += 1

        return result


# ---------------------------------------------------------------------------
# Parse a single DOCX file
# ---------------------------------------------------------------------------

def parse_note(docx_path: Path) -> dict:
    paras = _load_paragraphs(docx_path)
    parser = _NoteParser(paras, source=docx_path.name)
    return parser.parse()


# ---------------------------------------------------------------------------
# Merge multiple parsed notes into one PhpData (most-recent-wins strategy)
# ---------------------------------------------------------------------------

def _parse_patient_name(name_str: str) -> Patient:
    """Split 'First [Middle] Last' into Patient model."""
    parts = name_str.strip().split()
    if len(parts) >= 2:
        return Patient(given=parts[:-1], family=parts[-1])
    return Patient(given=[name_str], family="")


def merge_notes(parsed: list[dict]) -> PhpData:
    """
    Merge notes sorted by session number.
    Most-recent-wins for all scalar fields, WBS, and goal ruler scores.
    Long-term goals are deduplicated by their text prefix and updated in place.
    Short-term goals are matched by index; status is updated from the most recent note.
    """
    sorted_notes = sorted(parsed, key=lambda n: n.get("session_number") or 0)

    # Accumulators
    patient: Optional[Patient] = None
    values: list[str] = []
    vision: Optional[str] = None
    strengths: list[str] = []
    wbs: Optional[WbsAssessment] = None
    map_data: dict = {}
    what_matters_most: Optional[str] = None
    is_final = False
    discharge_plan: Optional[str] = None

    # Goals: keyed by truncated text to deduplicate across notes
    lt_goals: dict[str, dict] = {}   # text_key -> goal dict (most recent wins)
    st_goals: dict[int, dict] = {}   # index -> step dict (most recent wins)

    for note in sorted_notes:
        if note.get("patient_name") and not patient:
            patient = _parse_patient_name(note["patient_name"])

        if note.get("values"):
            values = note["values"]
        if note.get("vision"):
            vision = note["vision"]
        if note.get("strengths"):
            strengths = note["strengths"]
        if note.get("wbs"):
            wbs = WbsAssessment(**note["wbs"].model_dump() if hasattr(note["wbs"], "model_dump") else note["wbs"])
        if note.get("map"):
            map_data.update({k: v for k, v in note["map"].items() if v})
        if note.get("what_matters_most"):
            what_matters_most = note["what_matters_most"]
        if note.get("is_final_session"):
            is_final = True
        if note.get("discharge_plan"):
            discharge_plan = note["discharge_plan"]

        # Long-term goals: update by text fingerprint (first 60 chars)
        for goal in note.get("long_term_goals", []):
            key = (goal.get("text") or "")[:60].strip()
            if not key:
                continue
            existing = lt_goals.get(key, {})
            # Merge: non-None values from most recent note override
            for field in ("text", "importance", "confidence", "lifecycle_status", "start_date"):
                v = goal.get(field)
                if v is not None:
                    existing[field] = v
            lt_goals[key] = existing

        # Short-term goals: update by position index
        for idx, step in enumerate(note.get("short_term_goals", [])):
            existing = st_goals.get(idx, {})
            for field in ("text", "importance", "confidence", "status", "start_date", "end_date"):
                v = step.get(field)
                if v is not None:
                    existing[field] = v
            st_goals[idx] = existing

    # Build action steps list
    action_steps = [
        ActionStep(**{k: v for k, v in st_goals[i].items() if v is not None})
        for i in sorted(st_goals)
        if st_goals[i].get("text")
    ]

    # Build goals list; attach action steps to the first (and typically only) long-term goal
    goals: list[Goal] = []
    for idx, (_, g) in enumerate(lt_goals.items()):
        if not g.get("text"):
            continue
        goal = Goal(
            text=g["text"],
            importance=g.get("importance"),
            confidence=g.get("confidence"),
            lifecycle_status=g.get("lifecycle_status", "active"),
            start_date=g.get("start_date"),
            action_steps=action_steps if idx == 0 else [],
        )
        goals.append(goal)

    return PhpData(
        patient=patient,
        what_matters_most=what_matters_most,
        map=Map(**map_data) if map_data else None,
        values=values,
        vision=vision,
        strengths=strengths,
        wbs=wbs,
        goals=goals,
        is_final_session=is_final,
        discharge_plan=discharge_plan,
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Parse health coaching DOCX progress notes into PHP data JSON."
    )
    parser.add_argument(
        "inputs",
        nargs="+",
        metavar="PATH",
        help="One or more DOCX files, or a directory containing them.",
    )
    parser.add_argument(
        "-o",
        "--output",
        default="php-data.json",
        metavar="FILE",
        help="Output JSON file (default: php-data.json).",
    )
    args = parser.parse_args()

    # Collect DOCX paths
    docx_paths: list[Path] = []
    for raw in args.inputs:
        p = Path(raw)
        if p.is_dir():
            docx_paths.extend(sorted(p.glob("*.docx")))
        elif p.suffix.lower() == ".docx":
            docx_paths.append(p)
        else:
            print(f"Warning: skipping {p} (not a .docx file)", file=sys.stderr)

    if not docx_paths:
        print("Error: no DOCX files found.", file=sys.stderr)
        sys.exit(1)

    # Parse each note
    parsed: list[dict] = []
    for path in docx_paths:
        if path.name.startswith("~$"):
            continue  # skip Word lock files
        print(f"Parsing {path.name}…", file=sys.stderr)
        try:
            note = parse_note(path)
            parsed.append(note)
        except Exception as exc:
            print(f"  Warning: failed to parse {path.name}: {exc}", file=sys.stderr)

    if not parsed:
        print("Error: no notes could be parsed.", file=sys.stderr)
        sys.exit(1)

    # Merge and emit
    php = merge_notes(parsed)
    output = Path(args.output)
    output.write_text(php.model_dump_json(indent=2, exclude_none=True))
    print(f"Written to {output}", file=sys.stderr)


if __name__ == "__main__":
    main()

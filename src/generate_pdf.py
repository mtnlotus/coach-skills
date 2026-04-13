#!/usr/bin/env python3
"""
Generate a patient-friendly Personal Health Plan PDF from PHP data JSON.

Usage:
    python3 generate_pdf.py [php-data.json] [-o personal-health-plan.pdf] [--date YYYY-MM-DD]

Visual style: VA Whole Health branding
  - Dark navy header (#003F72)
  - Section bars in mid-blue (#0064A4)
  - Clean white content areas
  - Score bars for Well-Being Signs and goal readiness
  - Status badges for action steps
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path
from typing import Optional

from fpdf import FPDF

from models import ActionStep, Goal, PhpData

# ---------------------------------------------------------------------------
# VA color palette
# ---------------------------------------------------------------------------

VA_NAVY     = (0, 63, 114)      # #003F72 — page header
VA_BLUE     = (0, 100, 164)     # #0064A4 — section headers, bars
VA_BLUE_BG  = (232, 241, 250)   # #E8F1FA — light tint for content areas
VA_GREEN    = (46, 133, 64)     # #2E8540 — "Met" / completed
VA_GOLD     = (180, 120, 0)     # #B47800 — "In Progress"
VA_RED      = (152, 29, 37)     # #981D25 — "Not Met"
BAR_BG      = (210, 223, 235)   # unfilled bar track
RULE_COLOR  = (190, 210, 230)   # horizontal dividers
MID_GRAY    = (120, 120, 120)   # secondary text
DARK_TEXT   = (28, 28, 28)      # body copy
WHITE       = (255, 255, 255)

# ---------------------------------------------------------------------------
# Font paths — Arial TTF for full Unicode support
# ---------------------------------------------------------------------------

_FONT_DIR = Path("/System/Library/Fonts/Supplemental")

FONTS = {
    "":   _FONT_DIR / "Arial.ttf",
    "B":  _FONT_DIR / "Arial Bold.ttf",
    "I":  _FONT_DIR / "Arial Italic.ttf",
    "BI": _FONT_DIR / "Arial Bold Italic.ttf",
}


# ---------------------------------------------------------------------------
# PDF report class
# ---------------------------------------------------------------------------

class PHPReport(FPDF):
    """Patient-facing Personal Health Plan PDF using fpdf2."""

    L_MARGIN = 18.0   # mm
    R_MARGIN = 18.0
    T_MARGIN = 15.0
    PAGE_W   = 215.9  # Letter width mm
    PAGE_H   = 279.4  # Letter height mm
    CONTENT_W: float  # set in __init__

    SECTION_BAR_H = 8.0     # height of section header bars
    LINE_H        = 5.5     # standard line height
    SMALL_LINE_H  = 4.5
    BAR_H         = 4.5     # score-bar fill height
    INDENT        = 4.0     # standard body indent

    def __init__(self):
        super().__init__(orientation="P", unit="mm", format="Letter")
        self.CONTENT_W = self.PAGE_W - self.L_MARGIN - self.R_MARGIN
        self.set_margins(self.L_MARGIN, self.T_MARGIN, self.R_MARGIN)
        self.set_auto_page_break(auto=True, margin=15)
        self._register_fonts()

    # -- font registration ---------------------------------------------------

    def _register_fonts(self):
        for style, path in FONTS.items():
            if path.exists():
                self.add_font("Arial", style, str(path))
            else:
                # Fallback: built-in Helvetica if Arial TTF not found
                pass

    def _font(self, style: str = "", size: float = 10):
        family = "Arial" if (self.L_MARGIN > 0 and FONTS[""].exists()) else "Helvetica"
        self.set_font(family, style, size)

    # -- color helpers -------------------------------------------------------

    def _fill(self, color: tuple):  self.set_fill_color(*color)
    def _text(self, color: tuple):  self.set_text_color(*color)
    def _draw(self, color: tuple):  self.set_draw_color(*color)

    # -- layout primitives ---------------------------------------------------

    def _h_rule(self, color: tuple = RULE_COLOR, thickness: float = 0.3):
        self._draw(color)
        self.set_line_width(thickness)
        y = self.get_y()
        self.line(self.L_MARGIN, y, self.PAGE_W - self.R_MARGIN, y)
        self.ln(2)

    def _section_header(self, title: str, color: tuple = VA_BLUE, min_space: float = 22.0):
        """Full-width section header bar. Forces a page break if less than min_space remains."""
        remaining = self.PAGE_H - self.b_margin - self.get_y()
        if remaining < min_space:
            self.add_page()
        self.ln(2)
        y = self.get_y()
        self._fill(color)
        self._draw(color)
        self.rect(self.L_MARGIN, y, self.CONTENT_W, self.SECTION_BAR_H, "F")
        self._text(WHITE)
        self._font("B", 9.5)
        self.set_xy(self.L_MARGIN + 3, y + 1.5)
        self.cell(self.CONTENT_W - 3, self.SECTION_BAR_H - 3, title.upper())
        self.ln(self.SECTION_BAR_H + 1)

    def _body(self, text: str, style: str = "", size: float = 10,
              indent: float = 0, color: tuple = DARK_TEXT, line_h: float = None):
        self._text(color)
        self._font(style, size)
        lh = line_h or self.LINE_H
        self.set_x(self.L_MARGIN + indent)
        self.multi_cell(self.CONTENT_W - indent, lh, text,
                        new_x="LMARGIN", new_y="NEXT")

    def _label_value(self, label: str, text: str, indent: float = INDENT):
        """Bold label on its own line, then indented body text."""
        self._text(VA_BLUE)
        self._font("B", 9)
        self.set_x(self.L_MARGIN + indent)
        self.cell(self.CONTENT_W - indent, self.LINE_H, label,
                  new_x="LMARGIN", new_y="NEXT")
        self._body(text, style="", size=9.5, indent=indent + 2, color=DARK_TEXT,
                   line_h=5)

    def _score_bar(self, label: str, score: Optional[int], max_score: int = 10,
                   indent: float = INDENT, bar_w: float = 70.0):
        """Horizontal score bar: label — [===---] — n/10."""
        if score is None:
            return
        y = self.get_y()
        x = self.L_MARGIN + indent

        # Label
        self._text(DARK_TEXT)
        self._font("", 9.5)
        label_w = self.CONTENT_W - indent - bar_w - 14
        self.set_xy(x, y)
        self.cell(label_w, self.LINE_H, label)

        # Bar track
        bar_x = x + label_w
        track_y = y + (self.LINE_H - self.BAR_H) / 2
        self._fill(BAR_BG)
        self._draw(BAR_BG)
        self.rect(bar_x, track_y, bar_w, self.BAR_H, "F")

        # Bar fill
        filled = max(0.0, min(1.0, score / max_score)) * bar_w
        self._fill(VA_BLUE)
        self._draw(VA_BLUE)
        if filled > 0:
            self.rect(bar_x, track_y, filled, self.BAR_H, "F")

        # Score label
        self._text(DARK_TEXT)
        self._font("B", 9.5)
        self.set_xy(bar_x + bar_w + 3, y)
        self.cell(12, self.LINE_H, f"{score}/{max_score}")

        self.ln(self.LINE_H + 1.5)

    def _two_score_bars(self, label1: str, score1: Optional[int],
                        label2: str, score2: Optional[int]):
        """Two score bars side-by-side (importance + confidence)."""
        if score1 is None and score2 is None:
            return
        col_w = self.CONTENT_W / 2
        bar_w = 40.0
        label_w = 26.0

        for col, (label, score) in enumerate(
            [(label1, score1), (label2, score2)]
        ):
            if score is None:
                continue
            y = self.get_y()
            x = self.L_MARGIN + self.INDENT + col * col_w

            self._text(MID_GRAY)
            self._font("", 8.5)
            self.set_xy(x, y)
            self.cell(label_w, self.LINE_H, label)

            bar_x = x + label_w
            track_y = y + (self.LINE_H - self.BAR_H) / 2
            self._fill(BAR_BG)
            self._draw(BAR_BG)
            self.rect(bar_x, track_y, bar_w, self.BAR_H, "F")

            filled = max(0.0, min(1.0, score / 10)) * bar_w
            self._fill(VA_BLUE)
            self._draw(VA_BLUE)
            if filled > 0:
                self.rect(bar_x, track_y, filled, self.BAR_H, "F")

            self._text(DARK_TEXT)
            self._font("B", 9)
            self.set_xy(bar_x + bar_w + 2, y)
            self.cell(12, self.LINE_H, f"{score}/10")

        self.ln(self.LINE_H + 2)

    def _status_badge(self, status: Optional[str]) -> tuple[tuple, str]:
        """Return (color, label) for an action step status."""
        s = (status or "in-progress").lower()
        if s == "met":
            return VA_GREEN, "COMPLETED"
        if s in ("not-met", "not met"):
            return VA_RED, "NOT MET"
        return VA_GOLD, "IN PROGRESS"

    def _action_step(self, step: ActionStep, indent: float = INDENT):
        """Render one action step with a right-aligned status badge."""
        badge_color, badge_label = self._status_badge(step.status)
        badge_w = 22.0
        badge_h = 5.5
        text_w = self.CONTENT_W - indent - badge_w - 4

        y_start = self.get_y()

        # Measure how tall the text will be
        self._font("", 9.5)
        line_count = max(
            1, len(self.multi_cell(text_w, self.SMALL_LINE_H, step.text,
                                   dry_run=True, output="LINES"))
        )
        block_h = line_count * self.SMALL_LINE_H

        # Step text
        self._text(DARK_TEXT)
        self.set_xy(self.L_MARGIN + indent, y_start)
        self.multi_cell(text_w, self.SMALL_LINE_H, step.text,
                        new_x="LMARGIN", new_y="NEXT")
        text_end_y = self.get_y()   # capture Y before badge drawing moves cursor

        # Badge: right-aligned, vertically centred against the text block
        badge_x = self.PAGE_W - self.R_MARGIN - badge_w
        badge_y = y_start + (block_h - badge_h) / 2

        self._fill(badge_color)
        self._draw(badge_color)
        self.rect(badge_x, badge_y, badge_w, badge_h, "F")

        self._text(WHITE)
        self._font("B", 7.5)
        self.set_xy(badge_x, badge_y + 0.8)
        self.cell(badge_w, badge_h - 1.5, badge_label, align="C")

        # Return cursor to below the text block (not the badge)
        self.set_xy(self.L_MARGIN, text_end_y + 1.5)

    def _tag_row(self, label: str, items: list[str], indent: float = INDENT):
        """Bold label + dot-separated inline tags."""
        if not items:
            return
        self._text(VA_BLUE)
        self._font("B", 9)
        self.set_x(self.L_MARGIN + indent)
        self.cell(22, self.LINE_H, label + ":")
        self._text(DARK_TEXT)
        self._font("", 9.5)
        text = "  \u00b7  ".join(items)  # middle dot separator
        self.multi_cell(
            self.CONTENT_W - indent - 22, self.LINE_H, text,
            new_x="LMARGIN", new_y="NEXT",
        )

    # -- fpdf2 lifecycle hooks -----------------------------------------------

    def header(self):
        pass  # custom page header rendered once in build() via _render_page_header()

    def footer(self):
        """fpdf2 hook — called automatically at the bottom of every page."""
        self.set_y(-12)
        self._draw(RULE_COLOR)
        self.set_line_width(0.2)
        self.line(self.L_MARGIN, self.get_y(), self.PAGE_W - self.R_MARGIN, self.get_y())
        self.set_y(-10)
        self._text(MID_GRAY)
        self._font("", 7.5)
        self.set_x(self.L_MARGIN)
        self.cell(self.CONTENT_W / 2, 5, "VA Whole Health  \u2022  Personal Health Plan")
        self.cell(self.CONTENT_W / 2, 5, f"Page {self.page_no()}", align="R")

    # -- public build method -------------------------------------------------

    def build(self, php: PhpData, report_date: str) -> "PHPReport":
        self.add_page()
        self._render_page_header(php, report_date)
        self._render_why(php)
        self._render_what_matters(php)
        self._render_wbs(php)
        self._render_goals(php)
        self._render_strengths_values(php)
        self._render_next_steps(php)
        return self

    # -- section renderers ---------------------------------------------------

    def _render_page_header(self, php: PhpData, report_date: str):
        """Dark navy header bar with title and patient info."""
        bar_h = 32.0
        self._fill(VA_NAVY)
        self._draw(VA_NAVY)
        self.rect(0, 0, self.PAGE_W, bar_h, "F")

        # Left: wordmark + title
        self._text(WHITE)
        self._font("", 7.5)
        self.set_xy(self.L_MARGIN, 5)
        self.cell(0, 5, "VA WHOLE HEALTH")

        self._font("B", 20)
        self.set_xy(self.L_MARGIN, 11)
        self.cell(120, 12, "Personal Health Plan")

        # Right: patient name + date
        patient_name = ""
        if php.patient:
            given = " ".join(php.patient.given)
            patient_name = f"{given} {php.patient.family}".strip()

        self._font("B", 11)
        self.set_xy(self.L_MARGIN + 110, 8)
        self.cell(self.CONTENT_W - 110, 7, patient_name, align="R")

        self._font("", 9)
        self.set_xy(self.L_MARGIN + 110, 16)
        self.cell(self.CONTENT_W - 110, 6, report_date, align="R")

        self.set_xy(self.L_MARGIN, bar_h + 4)

    def _render_why(self, php: PhpData):
        """MY WHY — Mission, Aspiration, Purpose."""
        if not php.map and not (php.map and any([
            php.map.mission, php.map.aspiration, php.map.purpose
        ])):
            return

        self._section_header("My Why  —  Mission · Aspiration · Purpose", VA_NAVY)

        # Highlight the Purpose as the "why statement" with a left accent bar
        if php.map and php.map.purpose:
            y = self.get_y()
            quote_text = f'"{php.map.purpose}"'
            quote_w = self.CONTENT_W - self.INDENT - 7  # 7 = bar(2.5) + gap(4.5)
            # Measure quote height so the accent bar exactly matches it
            self._font("I", 11)
            n_lines = max(1, len(
                self.multi_cell(quote_w, 6, quote_text, dry_run=True, output="LINES")
            ))
            bar_h = n_lines * 6 + 3   # matched to quote content + small padding
            self._fill(VA_BLUE)
            self._draw(VA_BLUE)
            self.rect(self.L_MARGIN + self.INDENT, y, 2.5, bar_h, "F")
            self._text(VA_NAVY)
            self.set_xy(self.L_MARGIN + self.INDENT + 5, y + 1.5)
            self.multi_cell(
                quote_w, 6, quote_text, new_x="LMARGIN", new_y="NEXT",
            )
            self.ln(3)

        if php.map and php.map.mission:
            self._label_value("Mission", php.map.mission)
            self.ln(1)
        if php.map and php.map.aspiration:
            self._label_value("Aspiration", php.map.aspiration)
            self.ln(1)

    def _render_what_matters(self, php: PhpData):
        """WHAT MATTERS MOST TO ME."""
        if not php.what_matters_most:
            return
        self._section_header("What Matters Most to Me")
        self.ln(1)
        self._body(php.what_matters_most, size=10, indent=self.INDENT,
                   line_h=5.5)
        self.ln(2)

    def _render_wbs(self, php: PhpData):
        """MY WELL-BEING SIGNS — score bars."""
        if not php.wbs:
            return
        self._section_header("My Well-Being Signs")
        self.ln(2)
        wbs = php.wbs

        self._score_bar("Fully Satisfied", wbs.satisfied)
        self._score_bar("Regularly Involved", wbs.involved)
        self._score_bar("Functioning at My Best", wbs.functioning)

        self._h_rule()
        if wbs.average is not None:
            self._text(VA_NAVY)
            self._font("B", 9.5)
            self.set_x(self.L_MARGIN + self.INDENT)
            self.cell(50, self.LINE_H, "Overall Average")
            self._font("B", 11)
            self._text(VA_BLUE)
            self.cell(20, self.LINE_H, f"{wbs.average:.2f} / 10")
            self.ln(4)

    def _render_goals(self, php: PhpData):
        """MY GOALS — long-term goal, readiness bars, action steps."""
        if not php.goals:
            return
        self._section_header("My Goals")

        for goal in php.goals:
            self.ln(2)

            # Goal text in a lightly tinted box
            y = self.get_y()
            self._font("", 10)
            self._text(DARK_TEXT)
            self.set_x(self.L_MARGIN + self.INDENT)

            # Measure height for the background rect
            line_count = max(
                1, len(self.multi_cell(
                    self.CONTENT_W - self.INDENT * 2, self.LINE_H,
                    goal.text, dry_run=True, output="LINES"
                ))
            )
            box_h = line_count * self.LINE_H + 4
            self._fill(VA_BLUE_BG)
            self._draw(VA_BLUE_BG)
            self.rect(self.L_MARGIN + self.INDENT, y, self.CONTENT_W - self.INDENT * 2, box_h, "F")

            self._text(VA_NAVY)
            self._font("I", 10)
            self.set_xy(self.L_MARGIN + self.INDENT + 2, y + 2)
            self.multi_cell(
                self.CONTENT_W - self.INDENT * 2 - 4, self.LINE_H,
                goal.text, new_x="LMARGIN", new_y="NEXT",
            )
            self.ln(1)

            # Importance + confidence side-by-side
            self._two_score_bars(
                "Importance", goal.importance,
                "Confidence", goal.confidence,
            )

            # Action steps
            if goal.action_steps:
                self._text(VA_BLUE)
                self._font("B", 9)
                self.set_x(self.L_MARGIN + self.INDENT)
                self.cell(0, self.LINE_H, "Action Steps",
                          new_x="LMARGIN", new_y="NEXT")
                self.ln(0.5)
                for step in goal.action_steps:
                    self._action_step(step, indent=self.INDENT + 3)

    def _render_strengths_values(self, php: PhpData):
        """MY STRENGTHS & VALUES."""
        if not php.strengths and not php.values and not php.vision:
            return
        self._section_header("My Strengths & Values")
        self.ln(2)
        self._tag_row("Strengths", php.strengths)
        self._tag_row("Values", php.values)
        if php.vision:
            self._tag_row("Vision", [php.vision])

    def _render_next_steps(self, php: PhpData):
        """NEXT STEPS / discharge plan."""
        if not php.discharge_plan and not php.is_final_session:
            return
        self._section_header("Next Steps")
        self.ln(2)
        if php.discharge_plan:
            # Strip any leading "Other: " label that leaked in from the note
            text = php.discharge_plan
            if text.lower().startswith("other:"):
                text = text[len("other:"):].strip()
            self._body(text, size=10, indent=self.INDENT, line_h=5.5)
        self.ln(2)



# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Generate a patient-friendly Personal Health Plan PDF."
    )
    parser.add_argument(
        "input",
        nargs="?",
        default="output/php-data.json",
        metavar="FILE",
        help="Parsed PHP data JSON file (default: output/php-data.json).",
    )
    parser.add_argument(
        "-o", "--output",
        default="output/personal-health-plan.pdf",
        metavar="FILE",
        help="Output PDF file (default: output/personal-health-plan.pdf).",
    )
    parser.add_argument(
        "--date",
        metavar="'Month D, YYYY'",
        default=date.today().strftime("%-d %B %Y"),
        help="Report date shown on the cover (default: today, e.g. '13 April 2026').",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: {input_path} not found.", file=sys.stderr)
        sys.exit(1)

    raw = json.loads(input_path.read_text())
    php = PhpData.model_validate(raw)

    report = PHPReport()
    report.build(php, report_date=args.date)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    report.output(str(output_path))
    print(f"Written to {output_path}", file=sys.stderr)


if __name__ == "__main__":
    main()

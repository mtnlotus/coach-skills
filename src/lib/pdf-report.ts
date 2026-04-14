/**
 * Personal Health Plan PDF generator using pdfkit.
 * Mirrors PHPReport(FPDF) from generate_pdf.py.
 *
 * Units: pdfkit uses points (pt). All dimensions from the Python source (mm)
 * are converted via mm(n) = n * 2.835.
 */

import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { PhpData, ActionStep } from "../models.js";

// ---------------------------------------------------------------------------
// Unit conversion
// ---------------------------------------------------------------------------
const mm = (n: number) => n * 2.835;

// ---------------------------------------------------------------------------
// VA color palette (r, g, b) — same as Python source
// ---------------------------------------------------------------------------
type RGB = [number, number, number];

const VA_NAVY:   RGB = [0,   63,  114];
const VA_BLUE:   RGB = [0,   100, 164];
const VA_BLUE_BG: RGB= [232, 241, 250];
const VA_GREEN:  RGB = [46,  133, 64];
const VA_GOLD:   RGB = [180, 120, 0];
const VA_RED:    RGB = [152, 29,  37];
const BAR_BG:    RGB = [210, 223, 235];
const RULE_COLOR:RGB = [190, 210, 230];
const MID_GRAY:  RGB = [120, 120, 120];
const DARK_TEXT: RGB = [28,  28,  28];
const WHITE:     RGB = [255, 255, 255];

// ---------------------------------------------------------------------------
// Font paths — macOS Arial TTF
// ---------------------------------------------------------------------------
const FONT_DIR = "/System/Library/Fonts/Supplemental";
const FONTS = {
  regular:    path.join(FONT_DIR, "Arial.ttf"),
  bold:       path.join(FONT_DIR, "Arial Bold.ttf"),
  italic:     path.join(FONT_DIR, "Arial Italic.ttf"),
  boldItalic: path.join(FONT_DIR, "Arial Bold Italic.ttf"),
};

function fontsAvailable(): boolean {
  return fs.existsSync(FONTS.regular);
}

// ---------------------------------------------------------------------------
// Layout constants (values in pt, converted from mm originals)
// ---------------------------------------------------------------------------
const L_MARGIN      = mm(18);
const R_MARGIN      = mm(18);
const T_MARGIN      = mm(15);
const PAGE_W        = mm(215.9);   // Letter width
const PAGE_H        = mm(279.4);   // Letter height
const CONTENT_W     = PAGE_W - L_MARGIN - R_MARGIN;
const SECTION_BAR_H = mm(8);
const LINE_H        = mm(5.5);
const SMALL_LINE_H  = mm(4.5);
const BAR_H         = mm(4.5);
const INDENT        = mm(4);
// B_MARGIN is our logical bottom margin used for layout decisions and footer positioning.
// The PDFDocument is constructed with a much smaller doc_bottom_margin so pdfkit's
// auto-page-break doesn't fire when we draw the footer (which sits below B_MARGIN).
const B_MARGIN      = mm(15);
const DOC_B_MARGIN  = mm(3);   // pdfkit internal margin — only fires well below footer

// ---------------------------------------------------------------------------
// PDF report builder
// ---------------------------------------------------------------------------

export class PHPReport {
  private doc: InstanceType<typeof PDFDocument>;
  private useArial: boolean;
  private curY = T_MARGIN;

  constructor() {
    this.useArial = fontsAvailable();
    this.doc = new PDFDocument({
      size: "LETTER",
      margins: { top: T_MARGIN, bottom: DOC_B_MARGIN, left: L_MARGIN, right: R_MARGIN },
      autoFirstPage: false,
    });

    if (this.useArial) {
      this.doc.registerFont("Arial",     FONTS.regular);
      this.doc.registerFont("Arial-B",   FONTS.bold);
      this.doc.registerFont("Arial-I",   FONTS.italic);
      this.doc.registerFont("Arial-BI",  FONTS.boldItalic);
    }

    // Footer on every new page
    this.doc.on("pageAdded", () => {
      this.curY = T_MARGIN;
      this._renderFooter();
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  build(php: PhpData, reportDate: string, outputPath: string): void {
    const out = fs.createWriteStream(outputPath);
    this.doc.pipe(out);

    this.doc.addPage();
    this._renderPageHeader(php, reportDate);
    this._renderWhy(php);
    this._renderWhatMatters(php);
    this._renderWbs(php);
    this._renderGoals(php);
    this._renderStrengthsValues(php);
    this._renderNextSteps(php);

    this.doc.end();
  }

  // ---------------------------------------------------------------------------
  // Font helpers
  // ---------------------------------------------------------------------------

  private _font(style: "regular" | "bold" | "italic" | "boldItalic", size: number): this {
    if (this.useArial) {
      const names = { regular: "Arial", bold: "Arial-B", italic: "Arial-I", boldItalic: "Arial-BI" };
      this.doc.font(names[style]).fontSize(size);
    } else {
      const helvStyle = { regular: "Helvetica", bold: "Helvetica-Bold", italic: "Helvetica-Oblique", boldItalic: "Helvetica-BoldOblique" };
      this.doc.font(helvStyle[style]).fontSize(size);
    }
    return this;
  }

  // ---------------------------------------------------------------------------
  // Color helpers — set fill and stroke together
  // ---------------------------------------------------------------------------

  private _fill(c: RGB): this { this.doc.fillColor(c); return this; }
  private _stroke(c: RGB): this { this.doc.strokeColor(c); return this; }
  private _fillStroke(c: RGB): this { this.doc.fillColor(c).strokeColor(c); return this; }

  // ---------------------------------------------------------------------------
  // Y-position helpers (pdfkit tracks current Y via doc.y after text)
  // ---------------------------------------------------------------------------

  private getY(): number { return this.doc.y; }
  private setY(y: number): this { this.doc.y = y; return this; }
  private ln(n: number): this { this.doc.y += n; return this; }

  private remaining(): number {
    return PAGE_H - B_MARGIN - this.getY();
  }

  // ---------------------------------------------------------------------------
  // Layout primitives
  // ---------------------------------------------------------------------------

  private _hRule(color: RGB = RULE_COLOR, thickness = 0.3): void {
    const y = this.getY();
    this._stroke(color);
    this.doc.moveTo(L_MARGIN, y).lineTo(PAGE_W - R_MARGIN, y).lineWidth(thickness).stroke();
    this.ln(mm(2));
  }

  private _sectionHeader(title: string, color: RGB = VA_BLUE, minSpace = mm(22)): void {
    if (this.remaining() < minSpace) {
      this.doc.addPage();
    }
    this.ln(mm(2));
    const y = this.getY();
    this._fillStroke(color);
    this.doc.rect(L_MARGIN, y, CONTENT_W, SECTION_BAR_H).fill();

    this._fill(WHITE)._font("bold", 9.5);
    this.doc.fillColor(WHITE).text(title.toUpperCase(), L_MARGIN + mm(3), y + mm(1.5) + 1, {
      width: CONTENT_W - mm(3),
      lineBreak: false,
    });
    this.setY(y + SECTION_BAR_H + mm(1));
  }

  private _body(text: string, style: "regular" | "bold" | "italic" | "boldItalic" = "regular",
                size = 10, indent = 0, color: RGB = DARK_TEXT, lineGap = 0): void {
    this._fill(color)._font(style, size);
    this.doc.fillColor(color).text(text, L_MARGIN + indent, this.getY(), {
      width: CONTENT_W - indent,
      lineGap,
      align: "left",
    });
  }

  private _labelValue(label: string, text: string, indent = INDENT): void {
    const y = this.getY();
    this._fill(VA_BLUE)._font("bold", 9);
    this.doc.fillColor(VA_BLUE).text(label, L_MARGIN + indent, y, {
      width: CONTENT_W - indent,
      lineBreak: false,
    });
    this.setY(y + LINE_H);  // advance by exactly LINE_H, matching fpdf2 cell(new_y="NEXT")
    this._body(text, "regular", 9.5, indent + mm(2), DARK_TEXT, 0);
  }

  private _scoreBar(label: string, score: number | undefined, maxScore = 10,
                    indent = INDENT, barW = mm(70)): void {
    if (score === undefined) return;
    const y = this.getY();
    const x = L_MARGIN + indent;
    const labelW = CONTENT_W - indent - barW - mm(14);

    // Label
    this._fill(DARK_TEXT)._font("regular", 9.5);
    this.doc.fillColor(DARK_TEXT).text(label, x, y, { width: labelW, lineBreak: false });

    // Bar track
    const barX = x + labelW;
    const trackY = y + (LINE_H - BAR_H) / 2;
    this._fillStroke(BAR_BG);
    this.doc.rect(barX, trackY, barW, BAR_H).fill();

    // Bar fill
    const filled = Math.max(0, Math.min(1, score / maxScore)) * barW;
    this._fillStroke(VA_BLUE);
    if (filled > 0) this.doc.rect(barX, trackY, filled, BAR_H).fill();

    // Score label
    this._fill(DARK_TEXT)._font("bold", 9.5);
    this.doc.fillColor(DARK_TEXT).text(`${score}/${maxScore}`, barX + barW + mm(3), y, {
      width: mm(12),
      lineBreak: false,
    });

    this.setY(y + LINE_H + mm(1.5));
  }

  private _twoScoreBars(label1: string, score1: number | undefined,
                        label2: string, score2: number | undefined): void {
    if (score1 === undefined && score2 === undefined) return;
    const colW = CONTENT_W / 2;
    const barW = mm(40);
    const labelW = mm(26);
    const yStart = this.getY();

    for (let col = 0; col < 2; col++) {
      const [label, score] = col === 0 ? [label1, score1] : [label2, score2];
      if (score === undefined) continue;
      const y = yStart;
      const x = L_MARGIN + INDENT + col * colW;

      this._fill(MID_GRAY)._font("regular", 8.5);
      this.doc.fillColor(MID_GRAY).text(label, x, y, { width: labelW, lineBreak: false });

      const barX = x + labelW;
      const trackY = y + (LINE_H - BAR_H) / 2;
      this._fillStroke(BAR_BG);
      this.doc.rect(barX, trackY, barW, BAR_H).fill();

      const filled = Math.max(0, Math.min(1, score / 10)) * barW;
      this._fillStroke(VA_BLUE);
      if (filled > 0) this.doc.rect(barX, trackY, filled, BAR_H).fill();

      this._fill(DARK_TEXT)._font("bold", 9);
      this.doc.fillColor(DARK_TEXT).text(`${score}/10`, barX + barW + mm(2), y, {
        width: mm(12),
        lineBreak: false,
      });
    }
    this.setY(yStart + LINE_H + mm(2));
  }

  private _statusBadge(status: string | undefined): [RGB, string] {
    const s = (status ?? "in-progress").toLowerCase();
    if (s === "met") return [VA_GREEN, "COMPLETED"];
    if (s === "not-met" || s === "not met") return [VA_RED, "NOT MET"];
    return [VA_GOLD, "IN PROGRESS"];
  }

  private _actionStep(step: ActionStep, indent = INDENT): void {
    const [badgeColor, badgeLabel] = this._statusBadge(step.status);
    const badgeW = mm(22);
    const badgeH = mm(5.5);
    const textW = CONTENT_W - indent - badgeW - mm(4);
    const yStart = this.getY();

    // Measure text height
    this._font("regular", 9.5);
    const textHeight = this.doc.heightOfString(step.text, { width: textW });

    // Draw step text
    this._fill(DARK_TEXT)._font("regular", 9.5);
    this.doc.fillColor(DARK_TEXT).text(step.text, L_MARGIN + indent, yStart, {
      width: textW,
      lineGap: 0,
    });
    const textEndY = this.doc.y;

    // Draw badge: right-aligned, vertically centred against text block
    const badgeX = PAGE_W - R_MARGIN - badgeW;
    const badgeY = yStart + (textHeight - badgeH) / 2;
    this._fillStroke(badgeColor);
    this.doc.rect(badgeX, badgeY, badgeW, badgeH).fill();

    this._fill(WHITE)._font("bold", 7.5);
    this.doc.fillColor(WHITE).text(badgeLabel, badgeX, badgeY + mm(0.8), {
      width: badgeW,
      lineBreak: false,
      align: "center",
    });

    // Restore cursor below text (not badge)
    this.setY(textEndY + mm(1.5));
  }

  private _tagRow(label: string, items: string[], indent = INDENT): void {
    if (!items.length) return;
    const labelColW = mm(22);
    const y = this.getY();
    this._fill(VA_BLUE)._font("bold", 9);
    this.doc.fillColor(VA_BLUE).text(`${label}:`, L_MARGIN + indent, y, {
      width: labelColW,
      lineBreak: false,
    });
    const text = items.join("  \u00b7  ");
    this._fill(DARK_TEXT)._font("regular", 9.5);
    this.doc.fillColor(DARK_TEXT).text(text, L_MARGIN + indent + labelColW, y, {
      width: CONTENT_W - indent - labelColW,
    });
  }

  // ---------------------------------------------------------------------------
  // Footer (called on pageAdded event)
  // ---------------------------------------------------------------------------

  private _renderFooter(): void {
    const footerY = PAGE_H - B_MARGIN + mm(2);
    this._stroke(RULE_COLOR);
    this.doc.moveTo(L_MARGIN, footerY).lineTo(PAGE_W - R_MARGIN, footerY).lineWidth(0.2).stroke();
    const textY = footerY + mm(2);
    this._fill(MID_GRAY)._font("regular", 7.5);
    this.doc.fillColor(MID_GRAY)
      .text("VA Whole Health  \u2022  Personal Health Plan", L_MARGIN, textY, {
        width: CONTENT_W / 2,
        lineBreak: false,
      })
      .text(`Page ${this.doc.bufferedPageRange().count}`, L_MARGIN + CONTENT_W / 2, textY, {
        width: CONTENT_W / 2,
        lineBreak: false,
        align: "right",
      });
  }

  // ---------------------------------------------------------------------------
  // Section renderers
  // ---------------------------------------------------------------------------

  private _renderPageHeader(php: PhpData, reportDate: string): void {
    const barH = mm(32);
    this._fillStroke(VA_NAVY);
    this.doc.rect(0, 0, PAGE_W, barH).fill();

    // Wordmark
    this._fill(WHITE)._font("regular", 7.5);
    this.doc.fillColor(WHITE).text("VA WHOLE HEALTH", L_MARGIN, mm(5), {
      lineBreak: false,
    });

    // Title
    this._font("bold", 20);
    this.doc.text("Personal Health Plan", L_MARGIN, mm(11), {
      width: mm(120),
      lineBreak: false,
    });

    // Patient name
    let patientName = "";
    if (php.patient) {
      const given = php.patient.given.join(" ");
      patientName = `${given} ${php.patient.family}`.trim();
    }
    this._font("bold", 11);
    this.doc.text(patientName, L_MARGIN + mm(110), mm(8), {
      width: CONTENT_W - mm(110),
      lineBreak: false,
      align: "right",
    });

    // Date
    this._font("regular", 9);
    this.doc.text(reportDate, L_MARGIN + mm(110), mm(16), {
      width: CONTENT_W - mm(110),
      lineBreak: false,
      align: "right",
    });

    this.setY(barH + mm(4));
  }

  private _renderWhy(php: PhpData): void {
    if (!php.map) return;
    const { mission, aspiration, purpose } = php.map;
    if (!mission && !aspiration && !purpose) return;

    this._sectionHeader("My Why  —  Mission · Aspiration · Purpose", VA_NAVY);

    if (purpose) {
      const y = this.getY();
      const quoteText = `"${purpose}"`;
      const quoteW = CONTENT_W - INDENT - mm(7);

      this._font("italic", 11);
      const nLines = Math.max(1, Math.ceil(this.doc.heightOfString(quoteText, { width: quoteW }) / mm(6)));
      const barH = nLines * mm(6) + mm(3);

      this._fillStroke(VA_BLUE);
      this.doc.rect(L_MARGIN + INDENT, y, mm(2.5), barH).fill();

      this._fill(VA_NAVY)._font("italic", 11);
      this.doc.fillColor(VA_NAVY).text(quoteText, L_MARGIN + INDENT + mm(5), y + mm(1.5), {
        width: quoteW,
        lineGap: 0,
      });
      // Ensure cursor clears the bar bottom (text may be shorter than barH) + 3mm gap
      this.setY(y + barH + mm(3));
    }

    if (mission) {
      this._labelValue("Mission", mission);
      this.ln(mm(1));
    }
    if (aspiration) {
      this._labelValue("Aspiration", aspiration);
      this.ln(mm(1));
    }
  }

  private _renderWhatMatters(php: PhpData): void {
    if (!php.what_matters_most) return;
    this._sectionHeader("What Matters Most to Me");
    this.ln(mm(1));
    this._body(php.what_matters_most, "regular", 10, INDENT, DARK_TEXT);
    this.ln(mm(2));
  }

  private _renderWbs(php: PhpData): void {
    if (!php.wbs) return;
    this._sectionHeader("My Well-Being Signs");
    this.ln(mm(2));
    const wbs = php.wbs;

    this._scoreBar("Fully Satisfied", wbs.satisfied);
    this._scoreBar("Regularly Involved", wbs.involved);
    this._scoreBar("Functioning at My Best", wbs.functioning);

    this._hRule();
    if (wbs.average !== undefined) {
      const y = this.getY();
      this._fill(VA_NAVY)._font("bold", 9.5);
      this.doc.fillColor(VA_NAVY).text("Overall Average", L_MARGIN + INDENT, y, {
        width: mm(50),
        lineBreak: false,
      });
      this._fill(VA_BLUE)._font("bold", 11);
      this.doc.fillColor(VA_BLUE).text(`${wbs.average.toFixed(2)} / 10`, L_MARGIN + INDENT + mm(50), y, {
        width: mm(30),
        lineBreak: false,
      });
      this.setY(y + LINE_H);
      this.ln(mm(4));
    }
  }

  private _renderGoals(php: PhpData): void {
    if (!php.goals.length) return;
    this._sectionHeader("My Goals");

    for (const goal of php.goals) {
      this.ln(mm(2));
      const y = this.getY();

      // Measure goal text height for background rect
      this._font("italic", 10);
      const textW = CONTENT_W - INDENT * 2 - mm(4);
      const textH = this.doc.heightOfString(goal.text, { width: textW });
      const boxH = textH + mm(4);

      this._fillStroke(VA_BLUE_BG);
      this.doc.rect(L_MARGIN + INDENT, y, CONTENT_W - INDENT * 2, boxH).fill();

      this._fill(VA_NAVY)._font("italic", 10);
      this.doc.fillColor(VA_NAVY).text(goal.text, L_MARGIN + INDENT + mm(2), y + mm(2), {
        width: textW,
        lineGap: 0,
      });
      this.setY(y + boxH + mm(1));

      this._twoScoreBars("Importance", goal.importance, "Confidence", goal.confidence);

      if (goal.action_steps.length > 0) {
        this._fill(VA_BLUE)._font("bold", 9);
        this.doc.fillColor(VA_BLUE).text("Action Steps", L_MARGIN + INDENT, this.getY(), {
          lineBreak: false,
        });
        this.ln(SMALL_LINE_H + mm(0.5));
        for (const step of goal.action_steps) {
          this._actionStep(step, INDENT + mm(3));
        }
      }
    }
  }

  private _renderStrengthsValues(php: PhpData): void {
    if (!php.strengths.length && !php.values.length && !php.vision) return;
    this._sectionHeader("My Strengths & Values");
    this.ln(mm(2));
    this._tagRow("Strengths", php.strengths);
    this._tagRow("Values", php.values);
    if (php.vision) this._tagRow("Vision", [php.vision]);
  }

  private _renderNextSteps(php: PhpData): void {
    if (!php.discharge_plan && !php.is_final_session) return;
    this._sectionHeader("Next Steps");
    this.ln(mm(2));
    if (php.discharge_plan) {
      let text = php.discharge_plan;
      if (text.toLowerCase().startsWith("other:")) {
        text = text.slice("other:".length).trim();
      }
      this._body(text, "regular", 10, INDENT, DARK_TEXT);
    }
    this.ln(mm(2));
  }
}

/**
 * Personal Health Plan PDF generator using pdfkit.
 * Mirrors PHPReport(FPDF) from generate_pdf.py.
 *
 * Units: pdfkit uses points (pt). All dimensions from the Python source (mm)
 * are converted via mm(n) = n * 2.835.
 */
import type { PhpData } from "../models.js";
export declare class PHPReport {
    private doc;
    private useArial;
    constructor();
    build(php: PhpData, reportDate: string, outputPath: string): void;
    private _font;
    private _fill;
    private _stroke;
    private _fillStroke;
    private getY;
    private setY;
    private ln;
    private remaining;
    private _hRule;
    private _sectionHeader;
    private _body;
    private _labelValue;
    private _scoreBar;
    private _twoScoreBars;
    private _statusBadge;
    private _actionStep;
    private _tagRow;
    private _renderFooter;
    private _renderPageHeader;
    private _renderMap;
    private _renderWbs;
    private _renderGoals;
    private _renderStrengthsValues;
    private _renderNextSteps;
}

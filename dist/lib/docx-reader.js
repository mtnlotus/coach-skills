/**
 * DOCX paragraph extractor.
 * Opens a .docx file (ZIP archive), parses word/document.xml, and returns
 * an array of trimmed paragraph text strings — one per <w:p> element.
 * Mirrors Python's _load_paragraphs() from parse_notes.py.
 */
import fs from "node:fs";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
// pizzip ships CommonJS; tsx handles the interop
import PizZip from "pizzip";
function extractText(wt) {
    if (Array.isArray(wt)) {
        return wt.map(extractText).join("");
    }
    if (typeof wt === "string")
        return wt;
    return wt["#text"] ?? "";
}
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    trimValues: false, // preserve leading/trailing spaces inside <w:t> nodes
    parseTagValue: false, // keep all text content as strings; prevents digits like "0","8","5" being coerced to numbers
    isArray: (_name, _jpath, _isLeafNode, isAttribute) => !isAttribute,
});
/**
 * Load all paragraphs from a plain-text file and return trimmed strings.
 * Each line becomes one "paragraph", matching the DOCX paragraph model.
 */
export function loadParagraphsFromText(txtPath) {
    const content = fs.readFileSync(txtPath, "utf-8");
    return content
        .split(/\r?\n/)
        .map((line) => line.trim());
}
/**
 * Load all paragraphs from a DOCX file and return trimmed non-empty strings.
 */
export function loadParagraphs(docxPath) {
    const buffer = fs.readFileSync(docxPath);
    const zip = new PizZip(buffer);
    const xmlEntry = zip.file("word/document.xml");
    if (!xmlEntry) {
        throw new Error(`word/document.xml not found in ${path.basename(docxPath)}`);
    }
    const xml = xmlEntry.asText();
    const doc = parser.parse(xml);
    const body = doc?.["w:document"]?.[0]?.["w:body"]?.[0] ?? {};
    const paragraphs = [];
    const wps = body["w:p"] ?? [];
    for (const wp of wps) {
        const runArr = wp["w:r"] ?? [];
        const text = runArr
            .map((r) => (r["w:t"] !== undefined ? extractText(r["w:t"]) : ""))
            .join("")
            .trim();
        paragraphs.push(text);
    }
    return paragraphs;
}
const NOTE_EXTENSIONS = [".docx", ".txt"];
/**
 * Collect all supported note file paths from directories or explicit paths.
 * Supported extensions: .docx, .txt
 */
export function collectNoteFiles(inputPaths) {
    const files = [];
    for (const p of inputPaths) {
        const stat = fs.statSync(p);
        if (stat.isDirectory()) {
            const entries = fs.readdirSync(p)
                .filter((f) => {
                const lower = f.toLowerCase();
                return NOTE_EXTENSIONS.some((ext) => lower.endsWith(ext)) && !f.startsWith("~$");
            })
                .sort()
                .map((f) => path.join(p, f));
            files.push(...entries);
        }
        else {
            files.push(p);
        }
    }
    return files;
}
/**
 * @deprecated Use collectNoteFiles instead.
 */
export function collectDocxFiles(inputPaths) {
    return collectNoteFiles(inputPaths);
}

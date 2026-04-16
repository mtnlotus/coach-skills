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

// fast-xml-parser may represent a <w:t> node as:
//   - a string (when the element has no attributes)
//   - an object { "#text": string, "@_xml:space"?: string } (when xml:space="preserve")
//   - an array of the above (when there are multiple <w:t> siblings in one <w:r>)
type WText = string | { "#text"?: string } | Array<string | { "#text"?: string }>;

function extractText(wt: WText): string {
  if (Array.isArray(wt)) {
    return wt.map(extractText).join("");
  }
  if (typeof wt === "string") return wt;
  return wt["#text"] ?? "";
}

interface WRun {
  "w:t"?: WText;
}

interface WParagraph {
  "w:r"?: WRun[];
}

interface WBody {
  "w:p"?: WParagraph[];
}

interface WDocumentRoot {
  "w:body"?: WBody[];
}

interface WDocument {
  "w:document"?: WDocumentRoot[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: false,     // preserve leading/trailing spaces inside <w:t> nodes
  parseTagValue: false,  // keep all text content as strings; prevents digits like "0","8","5" being coerced to numbers
  isArray: (_name, _jpath, _isLeafNode, isAttribute) => !isAttribute,
});

/**
 * Load all paragraphs from a DOCX file and return trimmed non-empty strings.
 */
export function loadParagraphs(docxPath: string): string[] {
  const buffer = fs.readFileSync(docxPath);
  const zip = new PizZip(buffer);

  const xmlEntry = zip.file("word/document.xml");
  if (!xmlEntry) {
    throw new Error(`word/document.xml not found in ${path.basename(docxPath)}`);
  }
  const xml = xmlEntry.asText();

  const doc = parser.parse(xml) as WDocument;
  const body = doc?.["w:document"]?.[0]?.["w:body"]?.[0] ?? {};

  const paragraphs: string[] = [];
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

/**
 * Collect all DOCX file paths from a directory, sorted alphabetically.
 */
export function collectDocxFiles(inputPaths: string[]): string[] {
  const files: string[] = [];
  for (const p of inputPaths) {
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(p)
        .filter((f) => f.toLowerCase().endsWith(".docx") && !f.startsWith("~$"))
        .sort()
        .map((f) => path.join(p, f));
      files.push(...entries);
    } else {
      files.push(p);
    }
  }
  return files;
}

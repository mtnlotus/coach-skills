/**
 * DOCX paragraph extractor.
 * Opens a .docx file (ZIP archive), parses word/document.xml, and returns
 * an array of trimmed paragraph text strings — one per <w:p> element.
 * Mirrors Python's _load_paragraphs() from parse_notes.py.
 */
/**
 * Load all paragraphs from a plain-text file and return trimmed strings.
 * Each line becomes one "paragraph", matching the DOCX paragraph model.
 */
export declare function loadParagraphsFromText(txtPath: string): string[];
/**
 * Load all paragraphs from a DOCX file and return trimmed non-empty strings.
 */
export declare function loadParagraphs(docxPath: string): string[];
/**
 * Collect all supported note file paths from directories or explicit paths.
 * Supported extensions: .docx, .txt
 */
export declare function collectNoteFiles(inputPaths: string[]): string[];
/**
 * @deprecated Use collectNoteFiles instead.
 */
export declare function collectDocxFiles(inputPaths: string[]): string[];

import {
  HeaderMapping,
  ParsedRowData,
  TextToTableResult,
  Ticket,
  Contractor,
  CoverageArea
} from '../types/index.ts';
import {
  processRawImportWithEngine,
  MASTER_CANONICAL_FIELDS,
  parseExcelWorkbook
} from './woFieldMappingEngine.ts';

export interface ParseOptions {
  customMappings?: HeaderMapping[];
  existingWoNumbers?: string[];
  contractors?: Contractor[];
  coverageAreas?: CoverageArea[];
}

/**
 * Parse uploaded Excel or CSV file buffer
 */
export function parseWorkOrderFile(fileBuffer: ArrayBuffer, options: ParseOptions = {}): TextToTableResult {
  const rawRows = parseExcelWorkbook(fileBuffer);
  const existingWoNumbers = new Set(options.existingWoNumbers || []);

  const engineResult = processRawImportWithEngine(
    rawRows,
    existingWoNumbers,
    options.contractors || [],
    options.coverageAreas || [],
    MASTER_CANONICAL_FIELDS
  );

  return {
    totalDetected: engineResult.parsedRows.length,
    validCount: engineResult.validCount,
    problematicCount: engineResult.problematicCount,
    duplicateCount: engineResult.duplicateCount,
    unrecognizedHeaders: engineResult.unrecognizedHeaders,
    detectedHeaders: engineResult.detectedHeaders,
    parsedRows: engineResult.parsedRows,
    detectedContractors: engineResult.detectedContractors,
    newCoverageAreas: engineResult.newCoverageAreas
  };
}


/**
 * Check if the text is structured as Key-Value pairs (e.g. "WO Number: WO123456")
 */
function isKeyValueFormat(lines: string[]): boolean {
  let colonCount = 0;
  let sampleLines = lines.slice(0, 8);
  for (const line of sampleLines) {
    if (line.includes(':') && !line.startsWith('|')) {
      const idx = line.indexOf(':');
      const keyPart = line.substring(0, idx).trim();
      // Key is typically short (1-4 words)
      if (keyPart.length > 0 && keyPart.length < 40 && !keyPart.includes('\t')) {
        colonCount++;
      }
    }
  }
  return colonCount >= 2;
}

/**
 * Parse Key-Value format text (e.g. copied from web or ticketing portals):
 * Supports multiple records separated by blank lines, '---', '===', or repeated keys.
 */
function parseKeyValueText(rawText: string): Record<string, string>[] {
  const lines = rawText.split(/\r?\n/);
  const records: Record<string, string>[] = [];
  let currentRecord: Record<string, string> = {};

  const finishCurrentRecord = () => {
    if (Object.keys(currentRecord).length > 0) {
      records.push({ ...currentRecord });
      currentRecord = {};
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed === '---' || trimmed === '===' || trimmed.startsWith('***')) {
      finishCurrentRecord();
      continue;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const key = trimmed.substring(0, colonIdx).trim();
      const val = trimmed.substring(colonIdx + 1).trim();

      // If key is a starting key and already exists in current record, it indicates a new WO record
      const lowerKey = key.toLowerCase();
      if ((lowerKey.includes('wo number') || lowerKey.includes('no wo') || lowerKey === 'wo') && currentRecord[key]) {
        finishCurrentRecord();
      }

      currentRecord[key] = val;
    }
  }
  finishCurrentRecord();
  return records;
}

/**
 * Deterministic text parser supporting Markdown tables, TSV, CSV, and Key: Value colon formats,
 * powered by the central WOFieldMappingEngine.
 */
export function parseWorkOrderText(rawText: string, options: ParseOptions = {}): TextToTableResult {
  const existingWoNumbers = new Set(options.existingWoNumbers || []);

  if (!rawText || !rawText.trim()) {
    return {
      totalDetected: 0,
      validCount: 0,
      problematicCount: 0,
      duplicateCount: 0,
      unrecognizedHeaders: [],
      detectedHeaders: [],
      parsedRows: []
    };
  }

  // Split lines, normalize line endings
  const lines = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length === 0) {
    return {
      totalDetected: 0,
      validCount: 0,
      problematicCount: 0,
      duplicateCount: 0,
      unrecognizedHeaders: [],
      detectedHeaders: [],
      parsedRows: []
    };
  }

  let rawRows: Record<string, string>[] = [];
  let detectedHeaders: string[] = [];

  // 1. Auto-detect Key: Value format
  if (isKeyValueFormat(lines)) {
    rawRows = parseKeyValueText(rawText);
    const headerSet = new Set<string>();
    rawRows.forEach(r => Object.keys(r).forEach(k => headerSet.add(k)));
    detectedHeaders = Array.from(headerSet);
  } else {
    // 2. Tabular format (Markdown, Tab, Semicolon, Comma)
    const firstLine = lines[0];
    const isMarkdownTable = firstLine.includes('|');
    const delimiter = isMarkdownTable ? '|' : (firstLine.includes('\t') ? '\t' : (firstLine.includes(';') ? ';' : ','));

    let rawHeaders: string[] = [];
    let dataLinesStartIndex = 1;

    if (isMarkdownTable) {
      rawHeaders = splitMarkdownRow(firstLine);
      // Check if second line is a Markdown separator line (e.g., |---|:---|---:|)
      if (lines.length > 1 && isMarkdownSeparator(lines[1])) {
        dataLinesStartIndex = 2;
      }
    } else {
      rawHeaders = splitDelimitedRow(firstLine, delimiter);
    }

    // Clean and trim headers, handling blank headers without shifting
    detectedHeaders = rawHeaders.map((h, i) => h.trim() || `Unnamed_Column_${i + 1}`);

    // Collect raw rows
    for (let i = dataLinesStartIndex; i < lines.length; i++) {
      const line = lines[i];
      if (isMarkdownTable && isMarkdownSeparator(line)) {
        continue;
      }

      let cellValues: string[] = [];
      if (isMarkdownTable) {
        cellValues = splitMarkdownRow(line);
      } else {
        cellValues = splitDelimitedRow(line, delimiter);
      }

      // Ensure cell count matches header count without shifting
      const targetLength = detectedHeaders.length;
      while (cellValues.length < targetLength) {
        cellValues.push('');
      }

      const rowObj: Record<string, string> = {};
      detectedHeaders.forEach((header, colIndex) => {
        rowObj[header] = (cellValues[colIndex] || '').trim();
      });

      rawRows.push(rowObj);
    }
  }

  // Delegate to central WOFieldMappingEngine
  const engineResult = processRawImportWithEngine(
    rawRows,
    existingWoNumbers,
    options.contractors || [],
    options.coverageAreas || [],
    MASTER_CANONICAL_FIELDS
  );

  return {
    totalDetected: engineResult.parsedRows.length,
    validCount: engineResult.validCount,
    problematicCount: engineResult.problematicCount,
    duplicateCount: engineResult.duplicateCount,
    unrecognizedHeaders: engineResult.unrecognizedHeaders,
    detectedHeaders: engineResult.detectedHeaders.length > 0 ? engineResult.detectedHeaders : detectedHeaders,
    parsedRows: engineResult.parsedRows,
    detectedContractors: engineResult.detectedContractors,
    newCoverageAreas: engineResult.newCoverageAreas
  };
}

/**
 * Splits a Markdown table row by pipe '|', correctly preserving empty cells between pipes.
 */
function splitMarkdownRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) {
    trimmed = trimmed.substring(1);
  }
  if (trimmed.endsWith('|')) {
    trimmed = trimmed.substring(0, trimmed.length - 1);
  }
  return trimmed.split('|').map(cell => cell.trim());
}

/**
 * Checks if a string line is a markdown separator (e.g., |---|---|:---:|)
 */
function isMarkdownSeparator(line: string): boolean {
  const stripped = line.replace(/[|\s\-:]/g, '');
  return stripped.length === 0 && line.includes('-');
}

/**
 * Splits delimited text handling quoted cells
 */
function splitDelimitedRow(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      insideQuotes = !insideQuotes;
    } else if (char === delimiter && !insideQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

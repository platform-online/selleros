/**
 * CSV parsing / serialising with a real quoting state machine.
 * Handles quoted fields, embedded commas, escaped quotes, CRLF and BOM so the
 * import wizard never silently mis-reads a row.
 */

export interface ParseResult {
  headers: string[];
  rows: string[][];
}

export function parseCSV(text: string): ParseResult {
  const clean = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const filtered = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (filtered.length === 0) return { headers: [], rows: [] };
  const headers = filtered[0].map((h) => h.trim());
  return { headers, rows: filtered.slice(1) };
}

/** Convert parsed CSV into objects keyed by header, normalising header case. */
export function rowsAsObjects(parsed: ParseResult): Record<string, string>[] {
  return parsed.rows.map((cells) => {
    const obj: Record<string, string> = {};
    parsed.headers.forEach((h, i) => {
      obj[h] = (cells[i] ?? '').trim();
    });
    return obj;
  });
}

export function toCSV(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (value: string | number | null | undefined): string => {
    const s = value === null || value === undefined ? '' : String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\r\n');
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJSON(filename: string, data: unknown): void {
  downloadText(filename, JSON.stringify(data, null, 2), 'application/json');
}

/** Numeric parse tolerant of `৳`, commas, spaces and percent signs. */
export function parseNumeric(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^\d.-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_RE_ALT = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;

/** Accept YYYY-MM-DD or DD/MM/YYYY (and DD-MM-YYYY). Returns YYYY-MM-DD. */
export function parseDateValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = String(value).trim();
  const iso = DATE_RE.exec(v);
  if (iso) return v;
  const alt = DATE_RE_ALT.exec(v);
  if (alt) {
    const [, a, b, y] = alt;
    return `${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
  }
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

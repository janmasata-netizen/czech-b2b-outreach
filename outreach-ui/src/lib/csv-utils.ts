export const ALIASES: Record<string, string[]> = {
  company_name: ['company_name', 'firma', 'název', 'nazev', 'name', 'společnost', 'spolecnost', 'companyname', 'company', 'organization', 'organisation'],
  ico:          ['ico', 'ič', 'ic', 'idc', 'reg', 'registrationnumber', 'companynumber'],
  website:      ['website', 'web', 'url', 'domain', 'doména', 'domena', 'site', 'companyurl', 'homepage'],
  contact_name: ['contact_name', 'jmeno', 'jméno', 'kontakt', 'osoba', 'person', 'contact', 'full_name', 'name', 'contactname', 'fullname', 'firstname', 'lastname'],
  email:        ['email', 'e-mail', 'mail', 'email_address', 'emailaddress'],
};

/**
 * Detect if a string looks like a Czech company name rather than a person name.
 * Conservative: only flags unambiguous legal entity suffixes.
 * False positives (flagging a real person) are worse than false negatives.
 */
const COMPANY_SUFFIX_RE = /(?:s\.\s?r\.\s?o\.|spol\.\s?s\s?r\.o\.|a\.\s?s\.|k\.\s?s\.|v\.\s?o\.\s?s\.|z\.\s?s\.|o\.\s?s\.|o\.\s?p\.\s?s\.|s\.\s?p\.|z\.\s?ú\.)\s*$/i;
const TRAILING_SE_RE = /\S+\s+SE\s*$/i;
const EMBEDDED_ICO_RE = /\b\d{8}\b/;

export function isLikelyCompanyName(value: string): boolean {
  if (!value || !value.trim()) return false;
  const v = value.trim();
  if (COMPANY_SUFFIX_RE.test(v)) return true;
  if (TRAILING_SE_RE.test(v)) return true;
  if (EMBEDDED_ICO_RE.test(v)) return true;
  return false;
}

/**
 * Auto-detect CSV delimiter by counting `,` vs `;` in the first line.
 * Czech Excel exports typically use `;`.
 */
export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/)[0] || '';
  const commas = (firstLine.match(/,/g) || []).length;
  const semicolons = (firstLine.match(/;/g) || []).length;
  return semicolons > commas ? ';' : ',';
}

export function parseCsv(text: string, delimiter?: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const delim = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let cur = '';
  let inQuote = false;
  let row: string[] = [];

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '"') {
      if (inQuote && normalized[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === delim && !inQuote) {
      row.push(cur.trim());
      cur = '';
    } else if (ch === '\n' && !inQuote) {
      row.push(cur.trim());
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
      cur = '';
    } else {
      cur += ch;
    }
  }
  // Last row (no trailing newline)
  row.push(cur.trim());
  if (row.some(cell => cell !== '')) rows.push(row);

  return rows;
}

export function autoDetect(headers: string[]): { company_name: string; ico: string; website: string; contact_name: string; email: string } {
  const mapping = { company_name: '', ico: '', website: '', contact_name: '', email: '' };
  for (const h of headers) {
    const lower = h.toLowerCase();
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (!mapping[field as keyof typeof mapping] && aliases.includes(lower)) {
        mapping[field as keyof typeof mapping] = h;
        break;
      }
    }
  }
  return mapping;
}

export const ALIASES: Record<string, string[]> = {
  company_name: ['company_name', 'firma', 'název', 'nazev', 'name', 'společnost', 'spolecnost'],
  ico:          ['ico', 'ič', 'ic', 'idc', 'reg'],
  website:      ['website', 'web', 'url', 'domain', 'doména', 'domena', 'site'],
  contact_name: ['contact_name', 'jmeno', 'jméno', 'kontakt', 'osoba', 'person', 'contact', 'full_name', 'name'],
  email:        ['email', 'e-mail', 'mail', 'email_address'],
};

export function parseCsv(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
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
    } else if (ch === ',' && !inQuote) {
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

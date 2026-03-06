export const ALIASES: Record<string, string[]> = {
  company_name: ['company_name', 'firma', 'název', 'nazev', 'name', 'společnost', 'spolecnost'],
  ico:          ['ico', 'ič', 'ic', 'idc', 'reg'],
  website:      ['website', 'web', 'url', 'domain', 'doména', 'domena', 'site'],
  contact_name: ['contact_name', 'jmeno', 'jméno', 'kontakt', 'osoba', 'person', 'contact', 'full_name', 'name'],
  email:        ['email', 'e-mail', 'mail', 'email_address'],
};

export function parseCsv(text: string): string[][] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  return lines.map(line => {
    const result: string[] = [];
    let cur = '', inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { result.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    result.push(cur.trim());
    return result;
  });
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

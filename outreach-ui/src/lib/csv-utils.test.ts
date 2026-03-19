import { describe, it, expect } from 'vitest';
import { detectDelimiter, parseCsv, isLikelyCompanyName, autoDetect } from './csv-utils';

// ---------------------------------------------------------------------------
// detectDelimiter
// ---------------------------------------------------------------------------
describe('detectDelimiter', () => {
  it('returns comma for a comma-delimited first line', () => {
    const text = 'company_name,ico,website\nAcme,12345,acme.cz';
    expect(detectDelimiter(text)).toBe(',');
  });

  it('returns semicolon for a semicolon-delimited first line (Czech Excel export)', () => {
    const text = 'company_name;ico;website\nAcme;12345;acme.cz';
    expect(detectDelimiter(text)).toBe(';');
  });

  it('returns comma when comma and semicolon counts are equal', () => {
    // First line: 1 comma, 1 semicolon — tie → default ','
    const text = 'a,b;c\nfoo,bar;baz';
    expect(detectDelimiter(text)).toBe(',');
  });

  it('returns comma for an empty string', () => {
    expect(detectDelimiter('')).toBe(',');
  });

  it('returns comma when the first line has no delimiters at all', () => {
    expect(detectDelimiter('company_name\nAcme')).toBe(',');
  });
});

// ---------------------------------------------------------------------------
// parseCsv
// ---------------------------------------------------------------------------
describe('parseCsv', () => {
  it('parses a comma-delimited CSV correctly (backward compat)', () => {
    const text = 'name,email\nJan,jan@test.cz\nPetr,petr@test.cz';
    const result = parseCsv(text);
    expect(result).toEqual([
      ['name', 'email'],
      ['Jan', 'jan@test.cz'],
      ['Petr', 'petr@test.cz'],
    ]);
  });

  it('auto-detects semicolon delimiter from Czech Excel CSV', () => {
    const text = 'firma;ico;web\nAcme s.r.o.;12345678;acme.cz';
    const result = parseCsv(text);
    expect(result).toEqual([
      ['firma', 'ico', 'web'],
      ['Acme s.r.o.', '12345678', 'acme.cz'],
    ]);
  });

  it('respects an explicit delimiter override (semicolon even when commas present)', () => {
    // The first line has more commas than semicolons, but we force semicolon
    const text = 'a,b;c,d\n1,2;3,4';
    const result = parseCsv(text, ';');
    // Each row split on ';': ["a,b", "c,d"]
    expect(result).toEqual([
      ['a,b', 'c,d'],
      ['1,2', '3,4'],
    ]);
  });

  it('handles quoted fields that contain the delimiter', () => {
    const text = 'name,address\n"Firma, s.r.o.","Praha, CZ"';
    const result = parseCsv(text);
    expect(result).toEqual([
      ['name', 'address'],
      ['Firma, s.r.o.', 'Praha, CZ'],
    ]);
  });

  it('handles quoted fields containing semicolons when semicolon is the delimiter', () => {
    const text = 'name;address\n"Firma; s.r.o.";"Praha; CZ"';
    const result = parseCsv(text, ';');
    expect(result).toEqual([
      ['name', 'address'],
      ['Firma; s.r.o.', 'Praha; CZ'],
    ]);
  });

  it('handles escaped double-quotes inside quoted fields', () => {
    const text = 'name,note\n"Jan ""Honza"" Novák","ok"';
    const result = parseCsv(text);
    expect(result).toEqual([
      ['name', 'note'],
      ['Jan "Honza" Novák', 'ok'],
    ]);
  });

  it('filters out completely empty rows', () => {
    const text = 'name,email\n\nJan,jan@test.cz\n\n';
    const result = parseCsv(text);
    expect(result).toEqual([
      ['name', 'email'],
      ['Jan', 'jan@test.cz'],
    ]);
  });

  it('handles Windows CRLF line endings', () => {
    const text = 'name,email\r\nJan,jan@test.cz\r\nPetr,petr@test.cz';
    const result = parseCsv(text);
    expect(result).toEqual([
      ['name', 'email'],
      ['Jan', 'jan@test.cz'],
      ['Petr', 'petr@test.cz'],
    ]);
  });

  it('handles file with no trailing newline', () => {
    const text = 'name,email\nJan,jan@test.cz';
    const result = parseCsv(text);
    expect(result).toEqual([
      ['name', 'email'],
      ['Jan', 'jan@test.cz'],
    ]);
  });

  it('trims whitespace from cell values', () => {
    const text = 'name , email \n Jan , jan@test.cz ';
    const result = parseCsv(text);
    expect(result).toEqual([
      ['name', 'email'],
      ['Jan', 'jan@test.cz'],
    ]);
  });
});

// ---------------------------------------------------------------------------
// isLikelyCompanyName
// ---------------------------------------------------------------------------
describe('isLikelyCompanyName', () => {
  // Positive cases — should be detected as company names
  it('detects s.r.o.', () => {
    expect(isLikelyCompanyName('Stavba Plus s.r.o.')).toBe(true);
  });
  it('detects s. r. o. (spaced)', () => {
    expect(isLikelyCompanyName('Firma XYZ s. r. o.')).toBe(true);
  });
  it('detects spol. s r.o.', () => {
    expect(isLikelyCompanyName('ABC spol. s r.o.')).toBe(true);
  });
  it('detects a.s.', () => {
    expect(isLikelyCompanyName('ČEZ a.s.')).toBe(true);
  });
  it('detects a. s. (spaced)', () => {
    expect(isLikelyCompanyName('Alza.cz a. s.')).toBe(true);
  });
  it('detects k.s.', () => {
    expect(isLikelyCompanyName('Firma k.s.')).toBe(true);
  });
  it('detects v.o.s.', () => {
    expect(isLikelyCompanyName('Partneri v.o.s.')).toBe(true);
  });
  it('detects z.s.', () => {
    expect(isLikelyCompanyName('Spolek z.s.')).toBe(true);
  });
  it('detects o.p.s.', () => {
    expect(isLikelyCompanyName('Nadace o.p.s.')).toBe(true);
  });
  it('detects z.ú.', () => {
    expect(isLikelyCompanyName('Institut z.ú.')).toBe(true);
  });
  it('detects trailing SE', () => {
    expect(isLikelyCompanyName('Energo SE')).toBe(true);
  });
  it('detects embedded 8-digit IČO', () => {
    expect(isLikelyCompanyName('Firma 12345678')).toBe(true);
  });

  // Negative cases — should NOT be detected as company names
  it('does not flag a normal Czech name', () => {
    expect(isLikelyCompanyName('Jan Novák')).toBe(false);
  });
  it('does not flag a name with title', () => {
    expect(isLikelyCompanyName('Ing. Jana Dvořáková')).toBe(false);
  });
  it('does not flag an empty string', () => {
    expect(isLikelyCompanyName('')).toBe(false);
  });
  it('does not flag whitespace only', () => {
    expect(isLikelyCompanyName('   ')).toBe(false);
  });
  it('does not flag a short number (not 8 digits)', () => {
    expect(isLikelyCompanyName('Jan 123')).toBe(false);
  });
  it('does not flag SE that is not trailing with a word before', () => {
    expect(isLikelyCompanyName('SE')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// autoDetect — camelCase alias matching
// ---------------------------------------------------------------------------
describe('autoDetect', () => {
  it('maps LinkedIn camelCase headers correctly', () => {
    const headers = ['companyName', 'fullName', 'emailAddress', 'companyUrl'];
    const result = autoDetect(headers);
    expect(result.company_name).toBe('companyName');
    expect(result.contact_name).toBe('fullName');
    expect(result.email).toBe('emailAddress');
    expect(result.website).toBe('companyUrl');
  });

  it('maps standard lowercase headers', () => {
    const headers = ['firma', 'ico', 'web', 'jmeno', 'email'];
    const result = autoDetect(headers);
    expect(result.company_name).toBe('firma');
    expect(result.ico).toBe('ico');
    expect(result.website).toBe('web');
    expect(result.contact_name).toBe('jmeno');
    expect(result.email).toBe('email');
  });

  it('maps organization/organisation to company_name', () => {
    const result1 = autoDetect(['organization', 'email']);
    expect(result1.company_name).toBe('organization');
    const result2 = autoDetect(['organisation', 'email']);
    expect(result2.company_name).toBe('organisation');
  });
});

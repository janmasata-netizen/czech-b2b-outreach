import { supabase } from '@/lib/supabase';

export interface DuplicateCandidate {
  ico?: string;
  domain?: string;
  email?: string;
  company_name?: string;
}

export interface DuplicateMatch {
  candidate_index: number;
  match_field: 'ico' | 'domain' | 'email' | 'company_name';
  match_value: string;
  existing_lead_id: string;
  existing_company: string;
}

export interface DedupResult {
  /** All individual matches returned by the RPC */
  duplicates: DuplicateMatch[];
  /** Map from candidate index → array of matches for that candidate */
  candidateMatches: Map<number, DuplicateMatch[]>;
  /** Set of candidate indices that have at least one match */
  duplicateIndices: Set<number>;
}

const DEDUP_CHUNK_SIZE = 200;

/**
 * Check an array of lead candidates against existing leads.
 * Uses the `check_lead_duplicates` Supabase RPC.
 * For large sets (200+), splits into chunks to avoid RPC timeout.
 */
export async function checkDuplicates(candidates: DuplicateCandidate[]): Promise<DedupResult> {
  if (candidates.length === 0) {
    return { duplicates: [], candidateMatches: new Map(), duplicateIndices: new Set() };
  }

  let allDuplicates: DuplicateMatch[] = [];

  for (let offset = 0; offset < candidates.length; offset += DEDUP_CHUNK_SIZE) {
    const chunk = candidates.slice(offset, offset + DEDUP_CHUNK_SIZE);
    const { data, error } = await supabase.rpc('check_lead_duplicates', {
      candidates: chunk,
    });

    if (error) {
      console.error('check_lead_duplicates RPC error:', error);
      throw error;
    }

    const chunkDups = ((data as DuplicateMatch[]) ?? []).map(d => ({
      ...d,
      candidate_index: d.candidate_index + offset,
    }));
    allDuplicates = allDuplicates.concat(chunkDups);
  }

  const candidateMatches = new Map<number, DuplicateMatch[]>();
  const duplicateIndices = new Set<number>();

  for (const d of allDuplicates) {
    duplicateIndices.add(d.candidate_index);
    const arr = candidateMatches.get(d.candidate_index) ?? [];
    arr.push(d);
    candidateMatches.set(d.candidate_index, arr);
  }

  return { duplicates: allDuplicates, candidateMatches, duplicateIndices };
}

/**
 * Extract bare domain from a URL or website string.
 * "https://www.firma.cz/kontakt" → "firma.cz"
 */
export function extractDomain(url: string | undefined | null): string {
  if (!url) return '';
  let s = url.trim().toLowerCase();
  // Add protocol if missing so URL parser works
  if (!s.startsWith('http://') && !s.startsWith('https://')) {
    s = 'https://' + s;
  }
  try {
    const parsed = new URL(s);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    // Fallback: strip common prefixes manually
    return s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

/**
 * Clean and validate a raw domain input string.
 * Handles URLs, emails, multiple domains (takes first valid), messy whitespace, etc.
 */
export function cleanDomainInput(raw: string): { domain: string; error?: string } {
  if (!raw?.trim()) return { domain: '', error: 'Zadejte doménu' };
  // Split on commas, semicolons, spaces, newlines — take first non-empty token
  const token = raw.split(/[,;\s\n]+/).map(s => s.trim()).filter(Boolean)[0] || '';
  // If it's an email, extract domain part
  let candidate = token.includes('@') ? token.split('@')[1] : token;
  // Strip protocol, www, paths, query params
  candidate = candidate.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0].trim().toLowerCase();
  // Validate: must have at least one dot, valid domain chars
  if (!candidate || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(candidate)) {
    return { domain: '', error: 'Neplatná doména' };
  }
  return { domain: candidate };
}

const MATCH_FIELD_LABELS: Record<string, string> = {
  ico: 'IČO',
  domain: 'doména',
  email: 'e-mail',
  company_name: 'název firmy',
};

/**
 * Format a duplicate match into a human-readable Czech string.
 */
export function formatMatchMessage(match: DuplicateMatch): string {
  const fieldLabel = MATCH_FIELD_LABELS[match.match_field] ?? match.match_field;
  return `Lead se shodným ${fieldLabel} "${match.match_value}" již existuje (${match.existing_company ?? 'neznámá firma'})`;
}

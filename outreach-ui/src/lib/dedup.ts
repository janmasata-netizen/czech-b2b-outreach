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

/**
 * Check an array of lead candidates against existing leads.
 * Uses the `check_lead_duplicates` Supabase RPC.
 */
export async function checkDuplicates(candidates: DuplicateCandidate[]): Promise<DedupResult> {
  if (candidates.length === 0) {
    return { duplicates: [], candidateMatches: new Map(), duplicateIndices: new Set() };
  }

  const { data, error } = await supabase.rpc('check_lead_duplicates', {
    candidates: JSON.stringify(candidates),
  });

  if (error) {
    console.error('check_lead_duplicates RPC error:', error);
    throw error;
  }

  const duplicates: DuplicateMatch[] = (data as DuplicateMatch[]) ?? [];
  const candidateMatches = new Map<number, DuplicateMatch[]>();
  const duplicateIndices = new Set<number>();

  for (const d of duplicates) {
    duplicateIndices.add(d.candidate_index);
    const arr = candidateMatches.get(d.candidate_index) ?? [];
    arr.push(d);
    candidateMatches.set(d.candidate_index, arr);
  }

  return { duplicates, candidateMatches, duplicateIndices };
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

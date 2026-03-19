import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DuplicateMatch } from './dedup';

// ---------------------------------------------------------------------------
// Mock @/lib/supabase before importing the module under test.
// The mock factory must be declared before any `import` of the module.
// ---------------------------------------------------------------------------
const mockRpc = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: mockRpc,
  },
}));

// Dynamic import after mock is registered so the mock is picked up.
const { checkDuplicates } = await import('./dedup');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeCandidate(i: number) {
  return { company_name: `Company ${i}`, ico: `${10000000 + i}` };
}

function makeMatch(candidate_index: number): DuplicateMatch {
  return {
    candidate_index,
    match_field: 'ico',
    match_value: `${10000000 + candidate_index}`,
    existing_lead_id: `lead-${candidate_index}`,
    existing_company: `Existing ${candidate_index}`,
  };
}

// ---------------------------------------------------------------------------
// checkDuplicates — chunking behaviour
// ---------------------------------------------------------------------------
describe('checkDuplicates', () => {
  beforeEach(() => {
    mockRpc.mockReset();
  });

  it('returns empty result for empty candidates without calling RPC', async () => {
    const result = await checkDuplicates([]);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(result.duplicates).toEqual([]);
    expect(result.duplicateIndices.size).toBe(0);
    expect(result.candidateMatches.size).toBe(0);
  });

  it('makes a single RPC call for fewer than 200 candidates', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    await checkDuplicates(Array.from({ length: 50 }, (_, i) => makeCandidate(i)));

    expect(mockRpc).toHaveBeenCalledOnce();
    expect(mockRpc).toHaveBeenCalledWith('check_lead_duplicates', {
      candidates: expect.arrayContaining([expect.objectContaining({ ico: '10000000' })]),
    });
    expect(mockRpc.mock.calls[0][1].candidates).toHaveLength(50);
  });

  it('makes a single RPC call for exactly 200 candidates', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    await checkDuplicates(Array.from({ length: 200 }, (_, i) => makeCandidate(i)));

    expect(mockRpc).toHaveBeenCalledOnce();
    expect(mockRpc.mock.calls[0][1].candidates).toHaveLength(200);
  });

  it('splits 500 candidates into 3 chunks (200+200+100)', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    await checkDuplicates(Array.from({ length: 500 }, (_, i) => makeCandidate(i)));

    expect(mockRpc).toHaveBeenCalledTimes(3);
    expect(mockRpc.mock.calls[0][1].candidates).toHaveLength(200);
    expect(mockRpc.mock.calls[1][1].candidates).toHaveLength(200);
    expect(mockRpc.mock.calls[2][1].candidates).toHaveLength(100);
  });

  it('offsets candidate_index correctly for chunk 2 (indices start at 200)', async () => {
    // chunk 1: returns match at local index 5  → global 5
    // chunk 2: returns match at local index 3  → global 203
    mockRpc
      .mockResolvedValueOnce({ data: [makeMatch(5)], error: null })
      .mockResolvedValueOnce({ data: [makeMatch(3)], error: null })
      .mockResolvedValueOnce({ data: [], error: null });

    const result = await checkDuplicates(Array.from({ length: 500 }, (_, i) => makeCandidate(i)));

    // Global indices after offset adjustment
    expect(result.duplicateIndices.has(5)).toBe(true);    // chunk 1, local 5 → global 5
    expect(result.duplicateIndices.has(203)).toBe(true);  // chunk 2, local 3 + offset 200 → 203
    expect(result.duplicates).toHaveLength(2);
  });

  it('offsets candidate_index correctly for chunk 3 (indices start at 400)', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [makeMatch(0)], error: null }); // local 0 in chunk 3

    const result = await checkDuplicates(Array.from({ length: 500 }, (_, i) => makeCandidate(i)));

    expect(result.duplicateIndices.has(400)).toBe(true); // 0 + offset 400
    expect(result.duplicates[0].candidate_index).toBe(400);
  });

  it('builds candidateMatches map correctly for multiple matches on the same candidate', async () => {
    const match1: DuplicateMatch = { ...makeMatch(0), match_field: 'ico' };
    const match2: DuplicateMatch = { ...makeMatch(0), match_field: 'domain', match_value: 'acme.cz' };
    mockRpc.mockResolvedValue({ data: [match1, match2], error: null });

    const result = await checkDuplicates([makeCandidate(0)]);

    expect(result.candidateMatches.get(0)).toHaveLength(2);
    expect(result.duplicateIndices.has(0)).toBe(true);
  });

  it('throws when RPC returns an error in the first chunk', async () => {
    const rpcError = { message: 'RPC failed', code: '42501' };
    mockRpc.mockResolvedValue({ data: null, error: rpcError });

    await expect(checkDuplicates([makeCandidate(0)])).rejects.toEqual(rpcError);
  });

  it('throws when RPC returns an error in the second chunk', async () => {
    const rpcError = { message: 'timeout', code: '57014' };
    mockRpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: null, error: rpcError });

    await expect(
      checkDuplicates(Array.from({ length: 300 }, (_, i) => makeCandidate(i)))
    ).rejects.toEqual(rpcError);
  });
});

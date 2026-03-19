import { describe, it, expect } from 'vitest';
import { percentagesToCounts, assignTeamToRowsByCount } from './team-distribution';

// ---------------------------------------------------------------------------
// percentagesToCounts
// ---------------------------------------------------------------------------
describe('percentagesToCounts', () => {
  it('returns empty array when totalCount is 0', () => {
    const result = percentagesToCounts(0, [
      { teamId: 'A', teamName: 'A', percentage: 60 },
      { teamId: 'B', teamName: 'B', percentage: 40 },
    ]);
    expect(result).toEqual([]);
  });

  it('returns empty array when allocations array is empty', () => {
    expect(percentagesToCounts(10, [])).toEqual([]);
  });

  it('returns full count to the single team when there is only one allocation', () => {
    const result = percentagesToCounts(100, [
      { teamId: 'A', teamName: 'A', percentage: 100 },
    ]);
    expect(result).toEqual([{ teamId: 'A', count: 100 }]);
  });

  it('distributes 10 rows at 60/40 → [6, 4] (no remainder)', () => {
    const result = percentagesToCounts(10, [
      { teamId: 'A', teamName: 'A', percentage: 60 },
      { teamId: 'B', teamName: 'B', percentage: 40 },
    ]);
    expect(result).toEqual([
      { teamId: 'A', count: 6 },
      { teamId: 'B', count: 4 },
    ]);
  });

  it('distributes 10 rows at 34/33/33 → [4, 3, 3] using largest-remainder', () => {
    const result = percentagesToCounts(10, [
      { teamId: 'A', teamName: 'A', percentage: 34 },
      { teamId: 'B', teamName: 'B', percentage: 33 },
      { teamId: 'C', teamName: 'C', percentage: 33 },
    ]);
    expect(result).toEqual([
      { teamId: 'A', count: 4 },
      { teamId: 'B', count: 3 },
      { teamId: 'C', count: 3 },
    ]);
  });

  it('distributes 7 rows at 50/50 → [4, 3] (remainder goes to largest fractional)', () => {
    // 50% of 7 = 3.5 each; both have the same fractional (.5),
    // so the sort is stable-like and the first entry gets the +1.
    const result = percentagesToCounts(7, [
      { teamId: 'A', teamName: 'A', percentage: 50 },
      { teamId: 'B', teamName: 'B', percentage: 50 },
    ]);
    const counts = result.map(r => r.count);
    // Total must be 7
    expect(counts[0] + counts[1]).toBe(7);
    // Each team gets either 3 or 4
    expect(counts[0]).toBeGreaterThanOrEqual(3);
    expect(counts[1]).toBeGreaterThanOrEqual(3);
    // One team gets the extra row
    expect(Math.abs(counts[0] - counts[1])).toBe(1);
  });

  it('total of returned counts always equals totalCount', () => {
    for (const n of [1, 7, 10, 99, 100, 201]) {
      const result = percentagesToCounts(n, [
        { teamId: 'A', teamName: 'A', percentage: 34 },
        { teamId: 'B', teamName: 'B', percentage: 33 },
        { teamId: 'C', teamName: 'C', percentage: 33 },
      ]);
      const total = result.reduce((s, r) => s + r.count, 0);
      expect(total).toBe(n);
    }
  });

  it('preserves teamId order in the returned array', () => {
    const result = percentagesToCounts(10, [
      { teamId: 'X', teamName: 'X', percentage: 60 },
      { teamId: 'Y', teamName: 'Y', percentage: 40 },
    ]);
    expect(result[0].teamId).toBe('X');
    expect(result[1].teamId).toBe('Y');
  });
});

// ---------------------------------------------------------------------------
// assignTeamToRowsByCount
// ---------------------------------------------------------------------------
describe('assignTeamToRowsByCount', () => {
  it('returns empty array for empty allocations', () => {
    expect(assignTeamToRowsByCount([])).toEqual([]);
  });

  it('assigns all rows to the single team when only one allocation', () => {
    const result = assignTeamToRowsByCount([{ teamId: 'A', count: 5 }]);
    expect(result).toEqual(['A', 'A', 'A', 'A', 'A']);
  });

  it('assigns rows in blocks: [{A,3},{B,2}] → [A,A,A,B,B]', () => {
    const result = assignTeamToRowsByCount([
      { teamId: 'A', count: 3 },
      { teamId: 'B', count: 2 },
    ]);
    expect(result).toEqual(['A', 'A', 'A', 'B', 'B']);
  });

  it('assigns rows in blocks: [{A,6},{B,4}] → 6 A then 4 B', () => {
    const result = assignTeamToRowsByCount([
      { teamId: 'A', count: 6 },
      { teamId: 'B', count: 4 },
    ]);
    expect(result).toHaveLength(10);
    expect(result.slice(0, 6)).toEqual(['A', 'A', 'A', 'A', 'A', 'A']);
    expect(result.slice(6)).toEqual(['B', 'B', 'B', 'B']);
  });

  it('handles three teams in correct order', () => {
    const result = assignTeamToRowsByCount([
      { teamId: 'A', count: 4 },
      { teamId: 'B', count: 3 },
      { teamId: 'C', count: 3 },
    ]);
    expect(result).toHaveLength(10);
    expect(result.filter(t => t === 'A')).toHaveLength(4);
    expect(result.filter(t => t === 'B')).toHaveLength(3);
    expect(result.filter(t => t === 'C')).toHaveLength(3);
    // Blocks must be contiguous
    expect(result.slice(0, 4).every(t => t === 'A')).toBe(true);
    expect(result.slice(4, 7).every(t => t === 'B')).toBe(true);
    expect(result.slice(7).every(t => t === 'C')).toBe(true);
  });

  it('handles a zero-count allocation gracefully (produces no rows for that team)', () => {
    const result = assignTeamToRowsByCount([
      { teamId: 'A', count: 3 },
      { teamId: 'B', count: 0 },
    ]);
    expect(result).toEqual(['A', 'A', 'A']);
  });

  it('total length equals sum of all counts', () => {
    const allocs = [
      { teamId: 'A', count: 4 },
      { teamId: 'B', count: 3 },
      { teamId: 'C', count: 3 },
    ];
    const result = assignTeamToRowsByCount(allocs);
    expect(result).toHaveLength(10);
  });
});

// ---------------------------------------------------------------------------
// Integration: percentagesToCounts → assignTeamToRowsByCount round-trip
// ---------------------------------------------------------------------------
describe('percentagesToCounts + assignTeamToRowsByCount integration', () => {
  it('round-trip 10 rows at 60/40 produces exactly 10 assignments', () => {
    const counts = percentagesToCounts(10, [
      { teamId: 'A', teamName: 'A', percentage: 60 },
      { teamId: 'B', teamName: 'B', percentage: 40 },
    ]);
    const assignments = assignTeamToRowsByCount(counts);
    expect(assignments).toHaveLength(10);
    expect(assignments.filter(t => t === 'A')).toHaveLength(6);
    expect(assignments.filter(t => t === 'B')).toHaveLength(4);
  });

  it('round-trip 7 rows at 50/50 produces exactly 7 assignments', () => {
    const counts = percentagesToCounts(7, [
      { teamId: 'A', teamName: 'A', percentage: 50 },
      { teamId: 'B', teamName: 'B', percentage: 50 },
    ]);
    const assignments = assignTeamToRowsByCount(counts);
    expect(assignments).toHaveLength(7);
  });
});

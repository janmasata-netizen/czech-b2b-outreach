export interface TeamAllocation {
  teamId: string;
  teamName: string;
  percentage: number;
}

/**
 * Distribute percentages evenly across teams.
 * E.g. 3 teams: [34, 33, 33]. Remainder given to first teams.
 */
export function distributeEvenly(
  teams: Array<{ id: string; name: string }>
): TeamAllocation[] {
  if (teams.length === 0) return [];
  const base = Math.floor(100 / teams.length);
  let remainder = 100 - base * teams.length;
  return teams.map((t) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { teamId: t.id, teamName: t.name, percentage: base + extra };
  });
}

/**
 * Assign a team to each row deterministically in blocks.
 * E.g. 10 rows, [60%, 40%] -> [A,A,A,A,A,A, B,B,B,B]
 * Handles rounding via greedy largest-remainder method.
 */
export function assignTeamToRows(
  rowCount: number,
  allocations: TeamAllocation[]
): string[] {
  if (allocations.length === 0 || rowCount === 0) return [];
  if (allocations.length === 1) return new Array(rowCount).fill(allocations[0].teamId);

  // Calculate exact fractional counts
  const exactCounts = allocations.map((a) => (a.percentage / 100) * rowCount);
  const floorCounts = exactCounts.map(Math.floor);
  let remaining = rowCount - floorCounts.reduce((s, c) => s + c, 0);

  // Greedy largest-remainder: give +1 to allocations with largest fractional parts
  const fractionals = exactCounts.map((e, i) => ({ i, frac: e - floorCounts[i] }));
  fractionals.sort((a, b) => b.frac - a.frac);
  for (const f of fractionals) {
    if (remaining <= 0) break;
    floorCounts[f.i]++;
    remaining--;
  }

  // Build result array in blocks
  const result: string[] = [];
  for (let i = 0; i < allocations.length; i++) {
    for (let j = 0; j < floorCounts[i]; j++) {
      result.push(allocations[i].teamId);
    }
  }
  return result;
}

/**
 * Weighted random pick for single-lead case.
 * Percentages act as probability weights.
 */
/**
 * Distribute counts evenly across teams, converting to percentages.
 * E.g. 3 teams, 18 total: [6, 6, 6] → [33.33%, 33.33%, 33.34%]
 */
export function distributeEvenlyByCount(
  teams: Array<{ id: string; name: string }>,
  totalCount: number
): TeamAllocation[] {
  if (teams.length === 0 || totalCount === 0) return [];
  const base = Math.floor(totalCount / teams.length);
  let remainder = totalCount - base * teams.length;
  return teams.map((t) => {
    const count = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    return { teamId: t.id, teamName: t.name, percentage: (count / totalCount) * 100 };
  });
}

export function pickWeightedTeam(allocations: TeamAllocation[]): string {
  if (allocations.length === 0) return '';
  if (allocations.length === 1) return allocations[0].teamId;

  const total = allocations.reduce((s, a) => s + a.percentage, 0);
  let rand = Math.random() * total;
  for (const a of allocations) {
    rand -= a.percentage;
    if (rand <= 0) return a.teamId;
  }
  return allocations[allocations.length - 1].teamId;
}

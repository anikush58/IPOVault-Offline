export type NewIpoTab = 'live' | 'upcoming' | 'closed' | 'listed';

/**
 * Resolves the default tab for IPO Hub based on priority order:
 * 1. live
 * 2. upcoming
 * 3. closed
 * 4. listed
 * If all are empty, defaults to 'live'.
 */
export function getFirstAvailableIpoHubTab(counts: {
  live: number;
  upcoming: number;
  closed: number;
  listed: number;
}): NewIpoTab {
  if (counts.live > 0) return 'live';
  if (counts.upcoming > 0) return 'upcoming';
  if (counts.closed > 0) return 'closed';
  if (counts.listed > 0) return 'listed';
  return 'live';
}

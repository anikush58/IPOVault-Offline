export interface ControlledOption {
  code: string;
  label: string;
}

export const CONTROLLED_REGISTRARS: ControlledOption[] = [
  { code: 'KFINTECH', label: 'KFin Technologies' },
  { code: 'MUFG_INTIME', label: 'MUFG / Link Intime' },
  { code: 'LINK_INTIME', label: 'Link Intime India' },
  { code: 'BIGSHARE', label: 'Bigshare Services' },
  { code: 'CAMEO', label: 'Cameo Corporate' },
  { code: 'SKYLINE', label: 'Skyline Financial' },
  { code: 'PURVA', label: 'Purva Sharegistry' },
  { code: 'INTEGRATED', label: 'Integrated Registry' },
  { code: 'MAS', label: 'Mas Services' },
  { code: 'MUDRA', label: 'Mudra RTA' },
  { code: 'ALANKIT', label: 'Alankit Assignments' },
  { code: 'BEETAL', label: 'Beetal Financial' },
  { code: 'OTHER', label: 'Other / Unknown' },
];

export const CONTROLLED_EXCHANGES: ControlledOption[] = [
  { code: 'NSE', label: 'NSE' },
  { code: 'BSE', label: 'BSE' },
  { code: 'BOTH', label: 'NSE & BSE' },
];

export const CONTROLLED_ISSUE_TYPES: ControlledOption[] = [
  { code: 'MAINBOARD', label: 'Mainboard' },
  { code: 'SME', label: 'SME' },
];

/**
 * Resolves a human-friendly display label from a controlled registrar code or legacy string.
 */
export function getRegistrarLabel(codeOrText?: string | null): string {
  if (!codeOrText) return 'Unknown Registrar';
  const trimmed = codeOrText.trim();
  const match = CONTROLLED_REGISTRARS.find(
    (r) =>
      r.code === trimmed ||
      r.label.toLowerCase() === trimmed.toLowerCase() ||
      trimmed.toUpperCase().includes(r.code),
  );
  if (match) return match.label;
  const upper = trimmed.toUpperCase();
  const clean = upper.replace(/[\s_.-]+/g, '');
  if (clean.includes('KFIN')) return 'KFin Technologies';
  if (clean.includes('BIGSHARE')) return 'Bigshare Services';
  if (clean.includes('LINK') || clean.includes('MUFG')) return 'Link Intime India';
  if (clean.includes('INTEGRATED')) return 'Integrated Registry';
  if (clean.includes('MAS')) return 'Mas Services';
  if (clean.includes('MUDRA')) return 'Mudra RTA';
  if (clean.includes('ALANKIT')) return 'Alankit Assignments';
  return trimmed;
}

/**
 * Resolves a controlled registrar code from raw user input or legacy string.
 */
export function resolveRegistrarCode(input?: string | null): string {
  if (!input) return 'OTHER';
  const upper = input.trim().toUpperCase();
  const clean = upper.replace(/[\s_.-]+/g, '');
  if (clean.includes('KFIN') || clean.includes('KARVY')) return 'KFINTECH';
  if (clean.includes('MUFG')) return 'MUFG_INTIME';
  if (clean.includes('LINK')) return 'LINK_INTIME';
  if (clean.includes('BIGSHARE')) return 'BIGSHARE';
  if (clean.includes('CAMEO')) return 'CAMEO';
  if (clean.includes('SKYLINE')) return 'SKYLINE';
  if (clean.includes('PURVA')) return 'PURVA';
  if (clean.includes('INTEGRATED')) return 'INTEGRATED';
  if (clean.includes('MAS')) return 'MAS';
  if (clean.includes('MUDRA')) return 'MUDRA';
  if (clean.includes('ALANKIT')) return 'ALANKIT';
  if (clean.includes('BEETAL')) return 'BEETAL';

  const exact = CONTROLLED_REGISTRARS.find((r) => r.code === upper);
  return exact ? exact.code : 'OTHER';
}

/**
 * Resolves controlled exchange code ('NSE' | 'BSE' | 'BOTH').
 */
export function resolveExchangeCode(input?: string | null): string {
  if (!input) return 'NSE';
  const upper = input.trim().toUpperCase();
  if (upper.includes('BOTH') || (upper.includes('NSE') && upper.includes('BSE'))) return 'BOTH';
  if (upper.includes('BSE')) return 'BSE';
  return 'NSE';
}

/**
 * Resolves controlled issue type code ('MAINBOARD' | 'SME').
 */
export function resolveIssueTypeCode(input?: string | null): string {
  if (!input) return 'MAINBOARD';
  const upper = input.trim().toUpperCase();
  if (upper.includes('SME')) return 'SME';
  return 'MAINBOARD';
}

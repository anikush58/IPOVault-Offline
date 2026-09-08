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
  { code: 'MAS', label: 'Mas Services' },
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
  if (trimmed.toUpperCase().includes('KFIN')) return 'KFin Technologies';
  if (trimmed.toUpperCase().includes('BIGSHARE')) return 'Bigshare Services';
  if (trimmed.toUpperCase().includes('LINK') || trimmed.toUpperCase().includes('MUFG')) return 'Link Intime India';
  return trimmed;
}

/**
 * Resolves a controlled registrar code from raw user input or legacy string.
 */
export function resolveRegistrarCode(input?: string | null): string {
  if (!input) return 'OTHER';
  const upper = input.trim().toUpperCase();
  if (upper.includes('KFIN') || upper.includes('KARVY')) return 'KFINTECH';
  if (upper.includes('MUFG')) return 'MUFG_INTIME';
  if (upper.includes('LINK')) return 'LINK_INTIME';
  if (upper.includes('BIGSHARE')) return 'BIGSHARE';
  if (upper.includes('CAMEO')) return 'CAMEO';
  if (upper.includes('SKYLINE')) return 'SKYLINE';
  if (upper.includes('PURVA')) return 'PURVA';
  if (upper.includes('MAS')) return 'MAS';
  if (upper.includes('ALANKIT')) return 'ALANKIT';
  if (upper.includes('BEETAL')) return 'BEETAL';

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

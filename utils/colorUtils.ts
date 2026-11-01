/**
 * Color and luminance utilities for status bar contrast adaptation.
 */

/**
 * Calculates perceived luminance of a color to determine if it is light or dark.
 * Returns true if light (luminance > 0.5), false if dark (luminance <= 0.5).
 */
export function isLightBackground(color?: string): boolean {
  if (!color || typeof color !== 'string') return true;
  const c = color.trim().toLowerCase();

  if (c === 'transparent' || c === 'white') return true;
  if (c === 'black') return false;

  // Hex format: #RGB, #RGBA, #RRGGBB, #RRGGBBAA
  if (c.startsWith('#')) {
    let hex = c.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .split('')
        .map((ch) => ch + ch)
        .join('');
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.substring(0, 2), 16) || 0;
      const g = parseInt(hex.substring(2, 4), 16) || 0;
      const b = parseInt(hex.substring(4, 6), 16) || 0;
      // Perceived luminance formula (ITU-R BT.601)
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.5;
    }
  }

  // rgb / rgba format: rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5;
  }

  return true;
}

/**
 * Returns the optimal StatusBarStyle ('dark' vs 'light') for a given background color.
 */
export function getStatusBarStyleForColor(color?: string): 'dark' | 'light' {
  return isLightBackground(color) ? 'dark' : 'light';
}


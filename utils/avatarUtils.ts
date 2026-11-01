/**
 * Utility functions for user avatar URL generation and resolution.
 * Provides deterministic DiceBear SVG avatar URLs for users without custom avatar URLs,
 * and handles custom HTTP/HTTPS/data URLs seamlessly.
 */

let ExpoImageMod: any = null;
try {
  ExpoImageMod = require('expo-image');
} catch {}

export function getDiceBearAvatarUrl(seedSource: string): string {
  const seed = encodeURIComponent((seedSource || 'User').trim());
  return `https://api.dicebear.com/10.x/initials/svg?seed=${seed}`;
}

/**
 * Validates whether an avatar URL points to an actual user-uploaded image
 * (e.g., Cloudinary, Firebase Storage, file:// local asset, or base64 data:image),
 * rather than an external initial SVG (DiceBear) that would mask native vector fonts.
 */
export function isCustomAvatarUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.includes('dicebear')) return false;
  if (trimmed.includes('.svg')) return false;
  return (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('file://')
  );
}

/**
 * Returns the verified custom avatar URL for a user, or null if the user has no
 * custom photo and should render the native Google Sans Flex initial avatar.
 */
export function getCustomAvatarUrl(user?: {
  id?: string;
  name?: string;
  avatar_url?: string | null;
  avatarUrl?: string | null;
} | null): string | null {
  if (!user) return null;
  const customUrl = (user.avatarUrl || user.avatar_url || (user as any).avatar || '').trim();
  return isCustomAvatarUrl(customUrl) ? customUrl : null;
}

export function getEffectiveAvatarUrl(user?: {
  id?: string;
  name?: string;
  avatar_url?: string | null;
  avatarUrl?: string | null;
} | null): string {
  if (!user) {
    return getDiceBearAvatarUrl('User');
  }

  const customUrl = user.avatarUrl || user.avatar_url;
  if (customUrl && typeof customUrl === 'string') {
    const trimmed = customUrl.trim();
    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('data:')
    ) {
      return trimmed;
    }
  }

  const seedSource = user.name || user.id || 'User';
  return getDiceBearAvatarUrl(seedSource);
}

/**
 * Prefetches remote avatar images into device's persistent memory-disk cache.
 * Avoids repeated network requests when opening Users screen or reopening app.
 */
export function prefetchUserAvatars(
  users?: Array<{ id?: string; name?: string; avatar_url?: string | null; avatarUrl?: string | null }> | null
): void {
  if (!users || users.length === 0 || !ExpoImageMod?.Image?.prefetch) return;
  try {
    const urls: string[] = [];
    for (const u of users) {
      const custom = getCustomAvatarUrl(u);
      if (custom && (custom.startsWith('http://') || custom.startsWith('https://'))) {
        urls.push(custom);
      }
    }
    if (urls.length > 0) {
      ExpoImageMod.Image.prefetch(urls, 'memory-disk').catch(() => {});
    }
  } catch {}
}

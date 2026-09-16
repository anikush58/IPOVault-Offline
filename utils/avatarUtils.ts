/**
 * Utility functions for user avatar URL generation and resolution.
 * Provides deterministic DiceBear SVG avatar URLs for users without custom avatar URLs,
 * and handles custom HTTP/HTTPS/data URLs seamlessly.
 */

export function getDiceBearAvatarUrl(seedSource: string): string {
  const seed = encodeURIComponent((seedSource || 'User').trim());
  return `https://api.dicebear.com/10.x/initials/svg?seed=${seed}`;
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

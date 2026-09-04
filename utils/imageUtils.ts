import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

/**
 * Converts a local file URI (e.g. file://, content://) into a Base64 Data URL (data:image/...;base64,...)
 * if it is not already a Data URL or HTTP(S) URL.
 */
export async function ensureBase64DataUrl(uri?: string | null): Promise<string> {
  if (!uri) return '';
  const trimmed = uri.trim();
  if (!trimmed) return '';

  // If already a Data URI or remote web HTTP/HTTPS URL, return as is
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://')
  ) {
    return trimmed;
  }

  // On Web platform, fetch blob and read as Data URL
  if (Platform.OS === 'web') {
    try {
      const resp = await fetch(trimmed);
      const blob = await resp.blob();
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else resolve(trimmed);
        };
        reader.onerror = () => resolve(trimmed);
        reader.readAsDataURL(blob);
      });
    } catch {
      return trimmed;
    }
  }

  // On Native (Android / iOS) for file:// or content:// or local paths
  try {
    const fileInfo = await FileSystem.getInfoAsync(trimmed);
    if (!fileInfo.exists) {
      return trimmed;
    }

    const ext = trimmed.split('?')[0].split('.').pop()?.toLowerCase() || '';
    let mimeType = 'image/jpeg';
    if (ext === 'png') mimeType = 'image/png';
    else if (ext === 'webp') mimeType = 'image/webp';
    else if (ext === 'svg') mimeType = 'image/svg+xml';
    else if (ext === 'gif') mimeType = 'image/gif';

    const base64Data = await FileSystem.readAsStringAsync(trimmed, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (base64Data) {
      return `data:${mimeType};base64,${base64Data}`;
    }
  } catch (err) {
    console.warn('[imageUtils] Failed to convert local file to base64:', err);
  }

  return trimmed;
}

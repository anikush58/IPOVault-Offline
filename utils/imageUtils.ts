// Safely load Node fs module when running under Node test runners
function getNodeFs(): any {
  try {
    return eval("require")('fs');
  } catch {
    return null;
  }
}

// Safely attempt to load expo-file-system (available in React Native / Expo)
let FileSystemMod: any = null;
try {
  FileSystemMod = require('expo-file-system/legacy');
} catch {
  FileSystemMod = null;
}

/**
 * Detects MIME type and file extension from Base64 string magic bytes.
 */
export function detectMimeAndExtFromBase64(rawBase64: string, fallbackMime?: string): { mimeType: string; ext: string } {
  const cleanB64 = rawBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').trim();

  if (cleanB64.startsWith('/9j/')) {
    return { mimeType: 'image/jpeg', ext: 'jpg' };
  }
  if (cleanB64.startsWith('iVBORw0KG')) {
    return { mimeType: 'image/png', ext: 'png' };
  }
  if (cleanB64.startsWith('R0lGOD')) {
    return { mimeType: 'image/gif', ext: 'gif' };
  }
  if (cleanB64.startsWith('UklGR')) {
    return { mimeType: 'image/webp', ext: 'webp' };
  }
  if (cleanB64.startsWith('PHN2Zw') || cleanB64.startsWith('PD94bWw')) {
    return { mimeType: 'image/svg+xml', ext: 'svg' };
  }

  // Fallback to provided MIME type if available
  if (fallbackMime) {
    const lower = fallbackMime.toLowerCase();
    if (lower.includes('png')) return { mimeType: 'image/png', ext: 'png' };
    if (lower.includes('jpeg') || lower.includes('jpg')) return { mimeType: 'image/jpeg', ext: 'jpg' };
    if (lower.includes('webp')) return { mimeType: 'image/webp', ext: 'webp' };
    if (lower.includes('gif')) return { mimeType: 'image/gif', ext: 'gif' };
    if (lower.includes('svg')) return { mimeType: 'image/svg+xml', ext: 'svg' };
  }

  return { mimeType: 'image/jpeg', ext: 'jpg' };
}

/**
 * Extracts clean Base64 data, MIME type, and extension from string or object payload.
 */
export function extractBase64Payload(
  input?: string | { mimeType?: string; data?: string; avatar?: any; companyLogo?: any } | null
): { base64Data: string; mimeType: string; ext: string } | null {
  if (!input) return null;

  let rawString = '';
  let hintMime = '';

  if (typeof input === 'object') {
    const obj = input as any;
    if (obj.data && typeof obj.data === 'string') {
      rawString = obj.data;
      hintMime = obj.mimeType || '';
    } else if (obj.avatar && typeof obj.avatar === 'object' && obj.avatar.data) {
      rawString = obj.avatar.data;
      hintMime = obj.avatar.mimeType || '';
    } else if (obj.companyLogo && typeof obj.companyLogo === 'object' && obj.companyLogo.data) {
      rawString = obj.companyLogo.data;
      hintMime = obj.companyLogo.mimeType || '';
    }
  } else if (typeof input === 'string') {
    rawString = input.trim();
  }

  if (!rawString) return null;

  // Extract explicit MIME type if formatted as Data URI
  if (rawString.startsWith('data:')) {
    const match = rawString.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/s);
    if (match) {
      hintMime = match[1];
      rawString = match[2];
    } else {
      // Strip invalid prefix if present
      rawString = rawString.replace(/^data:[^;]+;base64,/, '');
    }
  }

  const cleanBase64 = rawString.trim();
  if (!cleanBase64) return null;

  // Basic Base64 validation regex check
  const isBase64Valid = /^[A-Za-z0-9+/=]+$/.test(cleanBase64.replace(/[\r\n\s]/g, ''));
  if (!isBase64Valid) {
    return null;
  }

  const detected = detectMimeAndExtFromBase64(cleanBase64, hintMime);
  return {
    base64Data: cleanBase64,
    mimeType: detected.mimeType,
    ext: detected.ext,
  };
}

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

  // Check Web platform safely
  let isWeb = false;
  try {
    const { Platform } = require('react-native');
    isWeb = Platform.OS === 'web';
  } catch {
    isWeb = typeof window !== 'undefined' && typeof document !== 'undefined';
  }

  if (isWeb) {
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

  // File System reading (Expo FileSystem if available, Node fs fallback for testing)
  try {
    let base64Data = '';
    const ext = trimmed.split('?')[0].split('.').pop()?.toLowerCase() || '';

    if (FileSystemMod) {
      const fileInfo = await FileSystemMod.getInfoAsync(trimmed);
      if (!fileInfo.exists) return trimmed;
      base64Data = await FileSystemMod.readAsStringAsync(trimmed, {
        encoding: FileSystemMod.EncodingType.Base64,
      });
    } else {
      const nodeFs = getNodeFs();
      const fsPath = trimmed.replace(/^file:\/\//, '');
      if (nodeFs && nodeFs.existsSync && nodeFs.existsSync(fsPath)) {
        base64Data = nodeFs.readFileSync(fsPath).toString('base64');
      } else {
        return trimmed;
      }
    }

    if (base64Data) {
      let fallbackMime = 'image/jpeg';
      if (ext === 'png') fallbackMime = 'image/png';
      else if (ext === 'webp') fallbackMime = 'image/webp';
      else if (ext === 'svg') fallbackMime = 'image/svg+xml';
      else if (ext === 'gif') fallbackMime = 'image/gif';

      const detected = detectMimeAndExtFromBase64(base64Data, fallbackMime);
      return `data:${detected.mimeType};base64,${base64Data}`;
    }
  } catch (err) {
    console.warn('[imageUtils] Failed to convert local file to base64:', err);
  }

  return trimmed;
}

/**
 * Recreates a local image file in local app storage from Base64 payload.
 * Returns the recreated local file URI, or null on failure.
 */
export async function saveBase64ToLocalImage(
  input: string | { mimeType?: string; data?: string } | null | undefined,
  prefix: string,
  id: string
): Promise<string | null> {
  try {
    const payload = extractBase64Payload(input);
    if (!payload || !payload.base64Data) {
      return null;
    }

    const filename = `${prefix}_${id}_${Date.now()}.${payload.ext}`;

    if (FileSystemMod && FileSystemMod.documentDirectory) {
      const baseDir = `${FileSystemMod.documentDirectory}images/`;
      try {
        const dirInfo = await FileSystemMod.getInfoAsync(baseDir);
        if (!dirInfo.exists) {
          await FileSystemMod.makeDirectoryAsync(baseDir, { intermediates: true });
        }
      } catch {}

      const filePath = `${baseDir}${filename}`;
      await FileSystemMod.writeAsStringAsync(filePath, payload.base64Data, {
        encoding: FileSystemMod.EncodingType.Base64,
      });
      return filePath;
    } else {
      const nodeFs = getNodeFs();
      if (nodeFs && nodeFs.mkdirSync && nodeFs.writeFileSync) {
        // Node fallback for tests
        let nodePath: any = null;
        try { nodePath = eval("require")('path'); } catch {}
        const baseDir = nodePath ? nodePath.join(process.cwd(), 'scratch', 'test_storage', 'images') : './scratch/test_storage/images';
        if (!nodeFs.existsSync(baseDir)) {
          nodeFs.mkdirSync(baseDir, { recursive: true });
        }
        const filePath = nodePath ? nodePath.join(baseDir, filename) : `${baseDir}/${filename}`;
        nodeFs.writeFileSync(filePath, Buffer.from(payload.base64Data, 'base64'));
        const formattedUri = filePath.startsWith('file://') ? filePath : `file://${filePath.replace(/\\/g, '/')}`;
        return formattedUri;
      }
    }

    return null;
  } catch (err) {
    console.warn(`[imageUtils] Failed to save local image file for ${prefix}/${id}:`, err);
    return null;
  }
}

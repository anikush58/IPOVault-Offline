import { Platform } from 'react-native';
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_AVATAR_PRESET } from '@/constants/apiConfig';

export interface CloudinaryUploadResult {
  secureUrl: string;
  publicId: string;
  width?: number;
  height?: number;
  format?: string;
}

/**
 * Uploads an image (local file URI, Base64 data URI, or blob) directly to Cloudinary using an unsigned upload preset.
 * No Cloudinary API secret is exposed or required.
 */
export async function uploadImageToCloudinary(
  fileUri: string,
  options?: {
    uploadPreset?: string;
    cloudName?: string;
  }
): Promise<CloudinaryUploadResult> {
  if (!fileUri || !fileUri.trim()) {
    throw new Error('Image URI is required for upload');
  }

  const cloudName = options?.cloudName || CLOUDINARY_CLOUD_NAME;
  const uploadPreset = options?.uploadPreset || CLOUDINARY_AVATAR_PRESET;

  if (!cloudName) {
    throw new Error('Cloudinary cloud name is not configured');
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const formData = new FormData();

  formData.append('upload_preset', uploadPreset);

  const cleanUri = fileUri.trim();

  // If already a remote HTTPS URL (e.g. from existing Cloudinary upload or Google avatar), return as-is
  if (cleanUri.startsWith('http://') || cleanUri.startsWith('https://')) {
    return {
      secureUrl: cleanUri,
      publicId: cleanUri.split('/').pop()?.split('.')[0] || 'remote_image',
    };
  }

  // Handle Web / Base64 Data URI vs Native file URI
  if (Platform.OS === 'web' || cleanUri.startsWith('data:')) {
    formData.append('file', cleanUri);
  } else {
    // Extract file extension / mime type
    const uriParts = cleanUri.split('.');
    const fileExt = uriParts.length > 1 ? uriParts[uriParts.length - 1].toLowerCase() : 'jpg';
    const mimeType = fileExt === 'png' ? 'image/png' : fileExt === 'webp' ? 'image/webp' : 'image/jpeg';

    formData.append('file', {
      uri: cleanUri,
      type: mimeType,
      name: `avatar_${Date.now()}.${fileExt}`,
    } as any);
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    const errorMsg = data.error?.message || `Upload failed with status ${response.status}`;
    console.error('[CloudinaryService] Upload error:', errorMsg);
    throw new Error(errorMsg);
  }

  const secureUrl = data.secure_url || data.url;
  if (!secureUrl) {
    throw new Error('Cloudinary response missing secure_url');
  }

  return {
    secureUrl,
    publicId: data.public_id,
    width: data.width,
    height: data.height,
    format: data.format,
  };
}

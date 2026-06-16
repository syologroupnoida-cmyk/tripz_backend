import { uploadBuffer } from '../../utils/cloudinary.js';
import { ApiError } from '../../utils/ApiError.js';

const sanitizeName = (name) =>
  (name || 'file').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80);

/**
 * Generic image/document upload. Stores under tripz/<purpose>/<userId>/ so
 * audit and per-user cleanup are trivial later.
 *
 * Naming behavior:
 *   - If `name` is provided → publicId = sanitized name (overwrites prior).
 *     Use this for "slots" like `pan-card`, `aadhaar-front`, `company-logo` —
 *     re-uploading replaces the previous file in the same slot.
 *   - If `name` is NOT provided → publicId = `<timestamp>-<originalname>`.
 *     Use this for ad-hoc uploads where each upload should be preserved.
 *
 * Returns the public URL + metadata. Does NOT touch the database — caller
 * decides what to do with the URL (typically: ship it back to the frontend
 * which includes it in a later submission).
 */
export const uploadImage = async ({ buffer, mimetype, originalname, purpose, userId, name }) => {
  if (!buffer || buffer.length === 0) {
    throw ApiError.badRequest('Empty file.');
  }

  const isPdf = mimetype === 'application/pdf';
  const hasCustomName = Boolean(name);
  const publicId = hasCustomName
    ? sanitizeName(name)
    : `${Date.now()}-${sanitizeName(originalname)}`;

  try {
    const result = await uploadBuffer({
      buffer,
      folder: `tripz/${purpose}/${userId}`,
      publicId,
      resourceType: isPdf ? 'raw' : 'image',
      overwrite: hasCustomName, // named slots overwrite; ad-hoc uploads don't
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format ?? null,
      width: result.width ?? null,
      height: result.height ?? null,
      bytes: result.bytes ?? buffer.length,
      resourceType: result.resource_type,
    };
  } catch (error) {
    console.error('[upload] Cloudinary upload failed:', error?.message);
    throw new ApiError(502, 'Upload failed. Please try again.');
  }
};

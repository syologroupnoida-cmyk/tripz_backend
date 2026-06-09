import { uploadBuffer } from '../../utils/cloudinary.js';
import { ApiError } from '../../utils/ApiError.js';

const sanitizeName = (name) =>
  (name || 'file').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80);

/**
 * Generic image/document upload. Stores under tripz/<purpose>/<userId>/ so
 * audit and per-user cleanup are trivial later.
 *
 * Returns the public URL + metadata. Does NOT touch the database — caller
 * decides what to do with the URL (typically: ship it back to the frontend
 * which includes it in a later submission).
 */
export const uploadImage = async ({ buffer, mimetype, originalname, purpose, userId }) => {
  if (!buffer || buffer.length === 0) {
    throw ApiError.badRequest('Empty file.');
  }

  const isPdf = mimetype === 'application/pdf';
  const safeName = sanitizeName(originalname);
  const timestamp = Date.now();

  try {
    const result = await uploadBuffer({
      buffer,
      folder: `tripz/${purpose}/${userId}`,
      publicId: `${timestamp}-${safeName}`,
      resourceType: isPdf ? 'raw' : 'image',
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

import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true, // always return HTTPS URLs
});

/**
 * Stream a Buffer to Cloudinary and resolve with the upload result.
 *
 * @param {object} args
 * @param {Buffer} args.buffer        — file contents (from multer's memoryStorage)
 * @param {string} args.folder        — Cloudinary folder, e.g. "tripz/kyc-pan/<userId>"
 * @param {string} [args.publicId]    — explicit asset name (else Cloudinary chooses)
 * @param {'image'|'raw'|'video'|'auto'} [args.resourceType='auto']
 */
export const uploadBuffer = ({ buffer, folder, publicId, resourceType = 'auto' }) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: resourceType,
        overwrite: false,
        // Cloudinary auto-compresses + serves the best format per client browser.
        // For PDFs/raw assets these flags are ignored, so safe to always pass.
        quality: 'auto',
        fetch_format: 'auto',
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      },
    );
    stream.end(buffer);
  });

export { cloudinary };

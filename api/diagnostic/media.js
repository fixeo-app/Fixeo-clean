'use strict';
const { MEDIA } = require('./contract');
const { hash } = require('./auth');
const { DiagnosticError } = require('./transport');
function actualMime(bytes) {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return 'image/png';
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  throw new DiagnosticError('MEDIA_TYPE_REJECTED', 422);
}
async function sanitizePhoto(bytes, declaredMime, declaredBytes) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length > MEDIA.photo.max_bytes ||
    bytes.length !== declaredBytes
  )
    throw new DiagnosticError('MEDIA_SIZE_MISMATCH', 422);
  if (actualMime(bytes) !== declaredMime)
    throw new DiagnosticError('MEDIA_TYPE_MISMATCH', 422);
  const sharp = require('sharp');
  try {
    const options = {
      limitInputPixels: MEDIA.photo.max_pixels,
      failOn: 'warning',
      sequentialRead: true,
    };
    const metadata = await sharp(bytes, options).metadata();
    if (
      !['jpeg', 'png', 'webp'].includes(metadata.format) ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > MEDIA.photo.max_pixels ||
      (metadata.pages || 1) !== 1
    )
      throw new Error('invalid_image');
    // Re-encoding drops original bytes, EXIF, GPS, ICC, XMP and trailing payloads.
    const output = await sharp(bytes, options)
      .rotate()
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80, effort: 3 })
      .timeout({ seconds: 8 })
      .toBuffer({ resolveWithObject: true });
    if (!output.data.length || output.data.length > MEDIA.photo.max_bytes)
      throw new Error('invalid_size');
    return {
      bytes: output.data,
      mime: 'image/webp',
      width: output.info.width,
      height: output.info.height,
      sha256: hash(output.data),
    };
  } catch (_) {
    throw new DiagnosticError('MEDIA_DECODE_REJECTED', 422);
  }
}
const encodePath = (path) => path.split('/').map(encodeURIComponent).join('/');
function createMedia(transport, cfg) {
  const base = '/storage/v1';
  const bucketPath = (path) =>
    encodeURIComponent(cfg.bucket) + '/' + encodePath(path);
  return {
    async uploadTicket(item) {
      const result = await transport.request(
        base + '/object/upload/sign/' + bucketPath(item.raw_path),
        { body: {} },
      );
      if (!result?.url || typeof result.url !== 'string')
        throw new DiagnosticError('UPLOAD_UNAVAILABLE', 503);
      const url = new URL(transport.root + base + result.url);
      if (
        url.origin !== new URL(transport.root).origin ||
        url.pathname !==
          base + '/object/upload/sign/' + bucketPath(item.raw_path) ||
        !url.searchParams.get('token')
      )
        throw new DiagnosticError('UPLOAD_UNAVAILABLE', 503);
      return url.href;
    },
    async download(path) {
      return transport.request(base + '/object/' + bucketPath(path), {
        method: 'GET',
        binary: true,
        maxBytes: MEDIA.photo.max_bytes,
      });
    },
    async store(path, bytes) {
      return transport.request(base + '/object/' + bucketPath(path), {
        method: 'POST',
        binary: true,
        headers: {
          'Content-Type': 'image/webp',
          'x-upsert': 'false',
          'Cache-Control': 'private, max-age=0',
        },
        body: bytes,
      });
    },
    async readUrl(path) {
      const result = await transport.request(
        base + '/object/sign/' + bucketPath(path),
        { body: { expiresIn: 60 } },
      );
      const relative = result?.signedURL;
      if (!relative) throw new DiagnosticError('MEDIA_UNAVAILABLE', 503);
      const url = new URL(transport.root + base + relative);
      if (
        url.origin !== new URL(transport.root).origin ||
        url.pathname !== base + '/object/sign/' + bucketPath(path) ||
        !url.searchParams.get('token')
      )
        throw new DiagnosticError('MEDIA_UNAVAILABLE', 503);
      return url.href;
    },
    async remove(paths) {
      // Caller only supplies DB-owned paths. Never accept browser object paths.
      if (!paths.length) return;
      await transport.request(
        base + '/object/' + encodeURIComponent(cfg.bucket),
        { method: 'DELETE', body: { prefixes: paths } },
      );
    },
  };
}
module.exports = { actualMime, sanitizePhoto, createMedia };

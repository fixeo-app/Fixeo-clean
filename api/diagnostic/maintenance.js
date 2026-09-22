'use strict';
const { timingSafeEqual } = require('node:crypto');
const { config } = require('./config');
const { createTransport } = require('./transport');
const { createMedia } = require('./media');
function createMaintenance({
  env = process.env,
  transport: suppliedTransport,
  mediaStore: suppliedMedia,
  logger = console,
} = {}) {
  return async function maintenance(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    const cfg = config(env);
    const provided = Buffer.from(req.headers?.authorization || '');
    const expected = Buffer.from('Bearer ' + cfg.maintenanceSecret);
    if (
      req.method !== 'GET' ||
      cfg.maintenanceSecret.length < 32 ||
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    )
      return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
    try {
      const transport =
        suppliedTransport || createTransport({ env, requestTimeout: 8000 });
      const storage = suppliedMedia || createMedia(transport, cfg);
      const claimed = await transport.rpc('diagnostic_cleanup_v1', {
        p_action: 'claim',
        p_payload: {},
      });
      let deleted = 0,
        failed = 0;
      // Bounded batch, all work awaited. No fire-and-forget deletion after response.
      for (let offset = 0; offset < claimed.items.length; offset += 4) {
        const results = await Promise.allSettled(
          claimed.items.slice(offset, offset + 4).map(async (item) => {
            let ok = false;
            try {
              await storage.remove(item.paths);
              ok = true;
              deleted++;
            } catch (_) {
              failed++;
            }
            await transport.rpc('diagnostic_cleanup_v1', {
              p_action: 'finish',
              p_payload: { id: item.id, lease: item.lease, ok },
            });
          }),
        );
        failed += results.filter((r) => r.status === 'rejected').length;
      }
      logger.info?.(
        JSON.stringify({ event: 'diagnostic_cleanup', deleted, failed }),
      );
      return res
        .status(failed ? 503 : 200)
        .json({ ok: !failed, deleted, failed });
    } catch (_) {
      return res.status(503).json({ ok: false, error: 'CLEANUP_UNAVAILABLE' });
    }
  };
}
module.exports = { createMaintenance };

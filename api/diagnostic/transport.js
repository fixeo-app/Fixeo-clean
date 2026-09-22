'use strict';
const { tracedRequest } = require('./http-trace');
class DiagnosticError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
async function boundedBody(response, maximum) {
  const length = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(length) && length > maximum)
    throw new DiagnosticError('MEDIA_TOO_LARGE', 413);
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maximum)
      throw new DiagnosticError('MEDIA_TOO_LARGE', 413);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new DiagnosticError('MEDIA_TOO_LARGE', 413);
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks);
}
function createTransport({
  env = process.env,
  fetchImpl = fetch,
  requestTimeout = 12000,
  deadline = Infinity,
} = {}) {
  const root = env.SUPABASE_URL?.replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!root || !key) throw new DiagnosticError('DIAGNOSTIC_UNAVAILABLE', 503);
  async function request(
    path,
    {
      method = 'POST',
      body,
      headers = {},
      binary = false,
      maxBytes = 128 * 1024,
    } = {},
  ) {
    let response;
    const remaining = deadline - Date.now();
    if (remaining < 500) throw new DiagnosticError('DEPENDENCY_TIMEOUT', 504);
    try {
      response = await tracedRequest(path === '/rest/v1/rpc/diagnostic_quota_v1' ? 'quota' : path.startsWith('/rest/v1/rpc/') ? 'rpc' : 'storage', () => fetchImpl(root + path, {
        method,
        headers: {
          apikey: key,
          Authorization: 'Bearer ' + key,
          ...(!binary ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body:
          body === undefined ? undefined : binary ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(requestTimeout, remaining)),
        ),
        redirect: 'error',
      }));
    } catch (cause) {
      const error = new DiagnosticError('DEPENDENCY_UNAVAILABLE', 503);
      error.diagnosticTransport = cause.diagnosticTransport;
      throw error;
    }
    const buffer = await boundedBody(response, maxBytes);
    if (!response.ok) {
      let reason = '';
      try {
        reason = JSON.parse(buffer.toString()).message || '';
      } catch (_) {}
      const code = reason.match(/DIAGNOSTIC_[A-Z_]+/)?.[0];
      if (code)
        throw new DiagnosticError(
          code,
          /QUOTA/.test(code) ? 429 : /NOT_FOUND/.test(code) ? 404 : 409,
        );
      throw new DiagnosticError(
        'DEPENDENCY_REJECTED',
        response.status === 404 ? 404 : 502,
      );
    }
    return binary
      ? buffer
      : buffer.length
        ? JSON.parse(buffer.toString())
        : null;
  }
  return {
    root,
    request,
    rpc: (name, args) => {
      if (!/^[a-z_0-9]+$/.test(name)) throw new DiagnosticError('INVALID_RPC');
      return request('/rest/v1/rpc/' + name, { body: args });
    },
    async user(token) {
      let response;
      try {
        response = await fetchImpl(root + '/auth/v1/user', {
          headers: { apikey: key, Authorization: 'Bearer ' + token },
          signal: AbortSignal.timeout(8000),
          redirect: 'error',
        });
      } catch (_) {
        throw new DiagnosticError('AUTH_UNAVAILABLE', 503);
      }
      if (!response.ok) throw new DiagnosticError('AUTH_REQUIRED', 401);
      const user = JSON.parse(
        (await boundedBody(response, 64 * 1024)).toString(),
      );
      if (!/^[0-9a-f-]{36}$/.test(user.id || ''))
        throw new DiagnosticError('AUTH_REQUIRED', 401);
      return user.id;
    },
  };
}
module.exports = { DiagnosticError, boundedBody, createTransport };

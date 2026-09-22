'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const { channel } = require('node:diagnostics_channel');
const scope = new AsyncLocalStorage();
const requests = new WeakMap();
const NAMES = new Set(['Error', 'TypeError', 'AbortError', 'TimeoutError', 'AggregateError', 'ConnectTimeoutError', 'SocketError', 'FetchError']);
const CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT', 'EPIPE', 'ABORT_ERR', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_ABORTED', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE']);
function safeError(error) {
  const chain = [];
  for (let e = error, n = 0; e && n < 4; e = e.cause, n++) {
    chain.push({ name: NAMES.has(e.name) ? e.name : 'OtherError', ...(CODES.has(e.code) ? { code: e.code } : {}) });
  }
  return chain;
}
function mark(trace, phase) {
  if (trace && !trace.finished && trace.events.length < 16)
    trace.events.push({ phase, ms: Date.now() - trace.started });
}
channel('http.client.request.start').subscribe(({ request }) => {
  const trace = scope.getStore();
  if (!trace) return;
  mark(trace, 'http_started');
  request.once('finish', () => mark(trace, 'body_sent'));
  request.once('response', () => mark(trace, 'response_headers'));
  request.once('error', error => {
    if (!trace.finished) { trace.network_error = safeError(error); mark(trace, 'request_error'); }
  });
});
channel('undici:request:create').subscribe(({ request }) => {
  const trace = scope.getStore();
  if (trace) { requests.set(request, trace); mark(trace, 'created'); }
});
for (const [name, phase] of [
  ['undici:client:sendHeaders', 'sending'],
  ['undici:request:bodySent', 'body_sent'],
  ['undici:request:headers', 'response_headers'],
  ['undici:request:trailers', 'response_complete'],
]) channel(name).subscribe(({ request }) => mark(requests.get(request), phase));
channel('undici:request:error').subscribe(({ request, error }) => {
  const trace = requests.get(request);
  if (trace && !trace.finished) { trace.network_error = safeError(error); mark(trace, 'request_error'); }
});
channel('undici:client:sendHeaders').subscribe(({ request, headers, socket }) => {
  const trace = requests.get(request);
  if (!trace || trace.finished) return;
  const length = typeof headers === 'string' && headers.match(/^content-length:\s*(\d+)\s*$/im);
  trace.wire = {
    content_length: length ? Number(length[1]) : null,
    chunked: typeof headers === 'string' && /^transfer-encoding:\s*chunked\s*$/im.test(headers),
    peer_family: ['IPv4', 'IPv6'].includes(socket?.remoteFamily) ? socket.remoteFamily : 'unknown',
    tls_session_reused: !!socket?.isSessionReused?.(),
    alpn: ['h2', 'http/1.1'].includes(socket?.alpnProtocol) ? socket.alpnProtocol : 'none',
  };
});
channel('undici:request:bodyChunkSent').subscribe(({ request, chunk }) => {
  const trace = requests.get(request);
  if (trace && !trace.finished) trace.sent_bytes = (trace.sent_bytes || 0) + Buffer.byteLength(chunk);
});
for (const [name, phase] of [
  ['undici:client:beforeConnect', 'connecting'],
  ['undici:client:connected', 'connected'],
  ['undici:client:connectError', 'connect_error'],
]) channel(name).subscribe(() => mark(scope.getStore(), phase));

async function tracedRequest(operation, fn, expectedBytes) {
  const trace = { started: Date.now(), events: [], finished: false };
  try { return await scope.run(trace, fn); }
  catch (error) {
    // Never include raw errors, URLs, paths, headers, payloads or socket details.
    error.diagnosticTransport = { operation, elapsed_ms: Date.now() - trace.started,
      events: trace.events, errors: safeError(error),
      ...(Number.isSafeInteger(expectedBytes) ? { expected_bytes: expectedBytes } : {}),
      ...(trace.wire ? { wire: trace.wire } : {}),
      ...(Number.isSafeInteger(trace.sent_bytes) ? { sent_bytes: trace.sent_bytes } : {}),
      ...(trace.network_error ? { network_error: trace.network_error } : {}) };
    throw error;
  } finally { trace.finished = true; }
}
module.exports = { tracedRequest, safeError };

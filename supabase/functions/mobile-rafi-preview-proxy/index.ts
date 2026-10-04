// W4.1 candidate: deploy only after branch Preview and server contracts are certified.
// No credential values in Git. Reuse this existing proxy; do not create a parallel route.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
const targets = new Set(['/api/mobile-rafi-photo', '/api/mobile-rafi-transcribe', '/api/mobile-estimator-v1']);
function json(status: number, error: string) {
  return new Response(JSON.stringify({ ok: false, error }), { status, headers: {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
  }});
}
async function bounded(request: Request | Response, max: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) throw new Error('BODY_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const {done,value} = await reader.read(); if (done) break;
      size += value.byteLength; if (size > max) throw new Error('BODY_TOO_LARGE'); chunks.push(value); }
  } finally { await reader.cancel().catch(() => {}); }
  const output = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { output.set(chunk,offset); offset += chunk.length; }
  return output;
}
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, 'METHOD_NOT_ALLOWED');
  const auth = req.headers.get('authorization');
  if (!auth || !/^Bearer [A-Za-z0-9._-]{20,4096}$/.test(auth)) return json(401, 'AUTH_REQUIRED');
  const path = new URL(req.url).pathname;
  const target = [...targets].find(route => [route, '/mobile-rafi-preview-proxy' + route, '/functions/v1/mobile-rafi-preview-proxy' + route].includes(path));
  if (!target) return json(404, 'ROUTE_NOT_FOUND');
  try {
    const origin = new URL(Deno.env.get('FIXEO_MOBILE_PREVIEW_ORIGIN') || '');
    const bypass = Deno.env.get('FIXEO_MOBILE_PREVIEW_BYPASS');
    if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.vercel.app') || origin.pathname !== '/' || origin.search || origin.hash || !bypass) return json(503, 'GATEWAY_UNAVAILABLE');
    const body = await bounded(req, target.includes('estimator') ? 96000 : 8 * 1024 * 1024 + 65536);
    const headers: Record<string,string> = { authorization: auth, 'content-type': req.headers.get('content-type') || 'application/octet-stream', 'x-vercel-protection-bypass': bypass };
    if (req.headers.get('origin')) headers.origin = req.headers.get('origin')!;
    const response = await fetch(new URL(target, origin), { method:'POST', headers, body, redirect:'error', signal:AbortSignal.timeout(55000) });
    if (!response.headers.get('content-type')?.includes('application/json')) return json(502,'GATEWAY_UNAVAILABLE');
    const payload = await bounded(response,256 * 1024);
    return new Response(payload,{status:response.status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
  } catch (error) { return json(error instanceof Error && error.message === 'BODY_TOO_LARGE' ? 413 : 502,error instanceof Error && error.message === 'BODY_TOO_LARGE' ? 'BODY_TOO_LARGE' : 'GATEWAY_UNAVAILABLE'); }
});

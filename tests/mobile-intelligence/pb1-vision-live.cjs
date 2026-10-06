'use strict';
// Explicit authenticated STAGING proof. Never included in the automatic unit suite.
// PB1_AUTH_FILE: private JSON outside this repository (chmod 600), either
// {access_token} or {email,password} for the existing PB1 photo client.
// Does not persist media, create a request, reset Auth or change infrastructure.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const origin = 'https://kqyhusnbybsukbcaoqtu.supabase.co';
const email = 'contact+pb1-photo-client@fixeo.ma';
const profile = require('../../mobile/eas.json').build['w6-physical-certification'];
const endpoint = origin + '/functions/v1/mobile-rafi-preview-proxy/api/mobile-rafi-photo';
function check(value, code) { if (!value) throw new Error(code); }

function verifyResult(body) {
  check(body?.ok === true && body.result, 'VISION_RESULT_MISSING');
  const r = body.result;
  const observed = (r.facts || []).filter(f => f.provenance === 'observed');
  check(observed.length > 0, 'OBSERVED_EMPTY');
  check(observed.every(f => typeof f.value === 'string' && f.value.trim() && f.media_ids?.length), 'OBSERVED_NOT_GROUNDED');
  check(observed.some(f => /bâtiment|immeuble|construction|mosqu[eé]e|minaret|ville|building/i.test(f.value)), 'VISIBLE_FIXTURE_OBJECT_MISSING');
  const assessments = r.photo_assessments || [];
  check(assessments.length === 1 && assessments[0].status === 'informative', 'PHOTO_NOT_INFORMATIVE');
  check(observed.every(f => f.media_ids.every(id => assessments.some(a => a.media_id === id))), 'MEDIA_REFERENCE_MISMATCH');
  const declared = (r.facts || []).filter(f => f.provenance === 'user_declared');
  check(declared.some(f => f.key === 'user_description' && f.value === ''), 'DECLARATION_NOT_SEPARATE');
  check(Array.isArray(r.hypotheses) && r.hypotheses.every(h => h.provenance === 'ai_inferred'), 'HYPOTHESIS_PROVENANCE');
  const uncertainty = [r.problem?.value, ...(r.checks || [])].join(' ');
  check(/aucun.{0,25}(?:d[eé]faut|dommage|probl[eè]me)|ne permet pas|[àa] confirmer|incertain|non v[eé]rifi|impossible|sur place/i.test(uncertainty), 'UNCERTAINTY_MISSING');
  const prose = [r.problem?.value, ...r.facts.map(f => f.value), ...(r.checks || [])].join(' ');
  check(!/aucune (?:description ou )?observation photo claire|aucune description ou observation|no clear (?:photo )?observation/i.test(prose), 'GENERIC_PHOTO_FALLBACK');
  check(body.privacy?.persisted === false && body.privacy?.raw_photo_retained === false && body.privacy?.sanitized_photo_retained === false, 'EPHEMERAL_PRIVACY');
  check(!body.diagnostic_reference && r.safety?.stop === false, 'UNEXPECTED_PERSISTENCE_OR_STOP');
  return { observed: { count: observed.length, grounded: true }, declared: { empty: true, separate: true },
    hypothesis: { count: r.hypotheses.length, inferred_only: true }, uncertainty: { explicit: true },
    informative_photo: true, generic_fallback: false, ephemeral: true };
}

async function main() {
  const report = { schema: 'pb1-vision-live-v1', started_at: new Date().toISOString(), status: 'BLOCKED',
    endpoint, backend_deployment: 'dpl_GvBr5g3LSnsmtSYvSibMorN4R7ns',
    backend_source_sha: '23a3923ef60b01ea0e4e735831dcdc60c5f9f362',
    image_fixture: 'img/blog/guides-blog.webp', physical_camera_certification: false };
  try {
    check(profile.env.EXPO_PUBLIC_APP_ENV === 'staging' && profile.environment === 'preview', 'BUILD_ENV_MISMATCH');
    check(profile.env.EXPO_PUBLIC_FIXEO_API_BASE_URL + '/api/mobile-rafi-photo' === endpoint, 'APK_ENDPOINT_MISMATCH');
    check(process.env.PB1_AUTH_FILE, 'AUTH_FILE_REQUIRED');
    const authPath = path.resolve(process.env.PB1_AUTH_FILE);
    check(!authPath.startsWith(root + path.sep), 'AUTH_FILE_MUST_BE_OUTSIDE_REPOSITORY');
    check((fs.statSync(authPath).mode & 0o077) === 0, 'AUTH_FILE_MUST_BE_PRIVATE');
    const credentials = JSON.parse(fs.readFileSync(authPath, 'utf8'));
    const key = profile.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    let token = credentials.access_token;
    if (!token) {
      check(credentials.email === email && typeof credentials.password === 'string' && credentials.password, 'EXISTING_PHOTO_CLIENT_REQUIRED');
      const login = await fetch(origin + '/auth/v1/token?grant_type=password', { method: 'POST', redirect: 'error',
        headers: { apikey: key, 'content-type': 'application/json' }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ email, password: credentials.password }) });
      check(login.ok, 'AUTH_LOGIN_REJECTED');
      token = (await login.json()).access_token;
    }
    check(typeof token === 'string' && token.split('.').length === 3, 'AUTH_SESSION_REQUIRED');
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    check(claims.iss === origin + '/auth/v1' && claims.role === 'authenticated' && claims.exp * 1000 > Date.now() + 75000, 'AUTH_FRESH_STAGING_SESSION_REQUIRED');
    const userResponse = await fetch(origin + '/auth/v1/user', { redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { apikey: key, Authorization: 'Bearer ' + token } });
    check(userResponse.ok, 'AUTH_VERIFICATION_REJECTED');
    const user = await userResponse.json();
    check(user.email === email && user.id === claims.sub, 'EXISTING_PHOTO_CLIENT_REQUIRED');
    report.authenticated_fixture_verified = true;
    const raw = fs.readFileSync(path.join(root, report.image_fixture));
    // Same 1600px/JPEG bounds as the capture adapter; actual bytes, no generated image.
    const bytes = await require('sharp')(raw).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    const form = new FormData();
    form.append('image', new Blob([bytes], { type: 'image/jpeg' }), 'pb1-public-scene.jpg');
    form.append('city', 'Fès'); form.append('description', '');
    report.payload = { mime: 'image/jpeg', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), description_empty: true, persist: false };
    const started = Date.now();
    const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(65000),
      headers: { Authorization: 'Bearer ' + token }, body: form });
    report.http_status = response.status; report.latency_ms = Date.now() - started;
    check(response.ok, 'VISION_HTTP_FAILURE');
    check(/application\/json/i.test(response.headers.get('content-type') || ''), 'VISION_JSON_REQUIRED');
    report.proof = verifyResult(await response.json());
    report.status = 'PASS';
  } catch (error) {
    // Never print provider responses, declarations, photos, credentials or token claims.
    report.failure = /^[A-Z_]+$/.test(error.message || '') ? error.message : 'TECHNICAL_FAILURE_REDACTED';
    report.status = report.failure === 'AUTH_FILE_REQUIRED' ? 'BLOCKED' : 'FAIL';
    process.exitCode = 1;
  } finally {
    report.finished_at = new Date().toISOString();
    const safe = JSON.stringify(report, null, 2) + '\n';
    if (process.env.PB1_VISION_REPORT) fs.writeFileSync(process.env.PB1_VISION_REPORT, safe);
    process.stdout.write(safe);
  }
}
module.exports = { verifyResult };
if (require.main === module) void main();

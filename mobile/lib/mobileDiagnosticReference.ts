import { supabase } from './supabase';
import { fetchMobileJson } from './mobileResilience';
import type { MobileDiagnosticResult } from './mobileDiagnostic';
const baseUrl = String(process.env.EXPO_PUBLIC_FIXEO_API_BASE_URL || '').replace(/\/$/, '');
export type PersistedMobileDiagnostic = {
  result: MobileDiagnosticResult;
  diagnostic_reference: string | null;
  diagnostic_reference_expires_in: number | null;
  privacy: { persisted: true; raw_photo_retained: false; sanitized_photo_retained: true };
};
/** Invoke only after the client accepts the persisted-diagnostic privacy notice.
 * Existing ephemeral photo flow remains unchanged until W4 integration is certified. */
export async function analyzePersistedMobilePhoto(input: {
  uri: string; mimeType?: string; city: string; description: string;
  consentVersion: 'diagnostic-privacy-v1';
}): Promise<PersistedMobileDiagnostic> {
  if (input.consentVersion !== 'diagnostic-privacy-v1') throw new Error('DIAGNOSTIC_CONSENT_REQUIRED');
  if (!/^https:\/\//i.test(baseUrl)) throw new Error('GATEWAY_UNAVAILABLE');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('AUTH_REQUIRED');
  const form = new FormData();
  form.append('image', { uri:input.uri, name:'fixeo-mobile-photo.jpg', type:input.mimeType || 'image/jpeg' } as any);
  form.append('city',input.city);form.append('description',input.description);
  form.append('persist','true');form.append('consent_version',input.consentVersion);
  let result: Awaited<ReturnType<typeof fetchMobileJson>>;
  try { result = await fetchMobileJson(baseUrl+'/api/mobile-rafi-photo', {method:'POST',headers:{Authorization:'Bearer '+data.session.access_token},body:form},60000); }
  catch { throw new Error('GATEWAY_UNAVAILABLE'); }
  const { response, body } = result;
  if (response.status === 401) throw new Error('AUTH_REQUIRED');
  if (!response.ok || body?.ok !== true || !body.result || body.privacy?.persisted !== true ||
      (body.diagnostic_reference !== null && typeof body.diagnostic_reference !== 'string')) {
    throw new Error(typeof body?.error === 'string' && /^[A-Za-z_]{3,80}$/.test(body.error) ? body.error : 'DIAGNOSTIC_INVALID');
  }
  if (body.result.safety?.stop && body.diagnostic_reference) throw new Error('DIAGNOSTIC_INVALID');
  return body as PersistedMobileDiagnostic;
}

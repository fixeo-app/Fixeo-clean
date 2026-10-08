import { supabase } from './supabase';
import { fetchMobileJson } from './mobileResilience';
import { validateMobileEstimatorResponse } from './mobileEstimatorContract';
import type { MobileEstimatorRequest, MobileEstimatorResponse } from './mobileEstimatorContract';
const baseUrl = String(process.env.EXPO_PUBLIC_FIXEO_API_BASE_URL || '').replace(/\/$/, '');
/** Server authority only. Keep opaque tokens in flow state; never log or decode them. */
export async function mobileEstimator(input: MobileEstimatorRequest): Promise<MobileEstimatorResponse> {
  if (!/^https:\/\//i.test(baseUrl)) throw new Error('GATEWAY_UNAVAILABLE');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('AUTH_REQUIRED');
  let result: Awaited<ReturnType<typeof fetchMobileJson>>;
  try {
    result = await fetchMobileJson(baseUrl + '/api/mobile-estimator-v1', {
      method: 'POST', headers: { Authorization: 'Bearer ' + data.session.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }, 30000);
  } catch { throw new Error('GATEWAY_UNAVAILABLE'); }
  const { response, body } = result;
  if (response.status === 401) throw new Error('AUTH_REQUIRED');
  if (!response.ok || body?.ok !== true) {
    throw new Error(typeof body?.error === 'string' && /^[A-Za-z_]{3,80}$/.test(body.error) ? body.error : 'ESTIMATOR_UNAVAILABLE');
  }
  return validateMobileEstimatorResponse(body);
}

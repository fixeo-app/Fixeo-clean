import { supabase } from './supabase';
import { fetchMobileJson } from './mobileResilience';

const baseUrl = String(process.env.EXPO_PUBLIC_FIXEO_API_BASE_URL || '').replace(/\/$/, '');

export type MobileDiagnosticResult = {
  photo_relevance?: { value: 'related' | 'unrelated' | 'uncertain'; provenance: string };
  version: string;
  indicative: string;
  trade: { value: string; provenance: 'ai_inferred' | string };
  problem: { value: string; provenance: 'ai_inferred' | string };
  facts: Array<{
    key: string;
    value: string;
    provenance: 'observed' | 'user_declared' | 'ai_inferred' | 'user_confirmed' | string;
    media_ids?: string[];
  }>;
  hypotheses: Array<{ value: string; provenance: string }>;
  possible_parts: Array<{ value: string; provenance: string; certain?: boolean }>;
  checks: string[];
  questions: Array<{ id?: string; label?: string; type?: string }>;
  safety: {
    stop?: boolean;
    level?: string;
    urgency?: string;
    signals?: string[];
  };
  urgency: {
    value: string;
    provenance: string;
    reason?: string;
  };
  next: string;
};

async function accessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('AUTH_REQUIRED');
  }
  return data.session.access_token;
}

export async function analyzeMobileDiagnosticPhoto(input: {
  uri: string;
  mimeType?: string;
  city: string;
  description?: string;
}): Promise<MobileDiagnosticResult> {
  if (!/^https:\/\//i.test(baseUrl)) {
    throw new Error('RAFI_SERVER_UNAVAILABLE');
  }

  const token = await accessToken();
  const form = new FormData();
  form.append('image', {
    uri: input.uri,
    name: 'fixeo-mobile-photo.jpg',
    type: input.mimeType || 'image/jpeg',
  } as any);
  form.append('city', input.city.trim());
  form.append('description', String(input.description || '').trim());

  const { response, body } = await fetchMobileJson(baseUrl + '/api/mobile-rafi-photo', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
    },
    body: form,
  }, 60000);
  if (!response.ok || !body || body.ok !== true || !body.result) {
    throw new Error(String(body?.error || 'DIAGNOSTIC_FAILED'));
  }

  return body.result as MobileDiagnosticResult;
}

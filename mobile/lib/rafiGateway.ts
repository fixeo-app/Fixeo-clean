import { supabase } from './supabase';

const baseUrl = String(process.env.EXPO_PUBLIC_FIXEO_API_BASE_URL || '').replace(/\/$/, '');

export function hasRafiServerGateway() {
  return /^https:\/\//i.test(baseUrl);
}

async function accessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('AUTH_REQUIRED');
  }
  return data.session.access_token;
}

export async function transcribeRafiVoice(
  uri: string,
  language = 'fr-FR',
): Promise<string> {
  if (!hasRafiServerGateway()) throw new Error('RAFI_SERVER_UNAVAILABLE');

  const token = await accessToken();
  const form = new FormData();
  form.append('audio', {
    uri,
    name: 'fixeo-mobile-voice.m4a',
    type: 'audio/mp4',
  } as any);
  form.append('language', language);

  const response = await fetch(baseUrl + '/api/mobile-rafi-transcribe', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
    },
    body: form,
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.ok !== true || typeof body.text !== 'string') {
    throw new Error(String(body?.error || 'TRANSCRIPTION_FAILED'));
  }

  return body.text.trim();
}

// Photo analysis will use an authenticated mobile gateway around the existing
// FIXEO Diagnostic contract. Direct provider calls from the mobile bundle remain forbidden.
export async function analyzeRafiPhoto(_uri: string): Promise<never> {
  throw new Error('PHOTO_DIAGNOSTIC_GATEWAY_PENDING');
}

const baseUrl = String(process.env.EXPO_PUBLIC_FIXEO_API_BASE_URL || '').replace(/\/$/, '');

export function hasRafiServerGateway() {
  return /^https:\/\//i.test(baseUrl);
}

export async function transcribeRafiVoice(uri: string, language = 'fr-FR'): Promise<string> {
  if (!hasRafiServerGateway()) throw new Error('RAFI_SERVER_UNAVAILABLE');
  const form = new FormData();
  form.append('audio', {
    uri,
    name: 'rafi-voice.m4a',
    type: 'audio/m4a',
  } as any);
  form.append('language', language);
  const response = await fetch(baseUrl + '/api/rafi-transcribe', {
    method: 'POST',
    body: form,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.ok !== true || typeof body.text !== 'string') {
    throw new Error(String(body?.error || 'TRANSCRIPTION_FAILED'));
  }
  return body.text.trim();
}

// Photo analysis will use the existing FIXEO Diagnostic server contract.
// It is intentionally not allowed to call an AI provider directly from the mobile bundle.
export async function analyzeRafiPhoto(_uri: string): Promise<never> {
  throw new Error('PHOTO_DIAGNOSTIC_GATEWAY_PENDING');
}

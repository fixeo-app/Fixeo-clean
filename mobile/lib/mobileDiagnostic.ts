import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

const baseUrl = String(process.env.EXPO_PUBLIC_FIXEO_API_BASE_URL || '').replace(/\/$/, '');

const CITY_SLUGS = new Set([
  'casablanca',
  'rabat',
  'marrakech',
  'fes',
  'tanger',
  'agadir',
  'meknes',
  'oujda',
  'kenitra',
  'tetouan',
  'sale',
  'temara',
  'el-jadida',
  'beni-mellal',
  'nador',
  'khouribga',
  'safi',
  'taza',
  'ouarzazate',
  'mohammedia',
]);

export type MobileDiagnosticResult = {
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

type DiagnosticSession = {
  id: string;
  revision: number;
  state: string;
  city_slug: string;
  result_run_id?: string | null;
  result?: MobileDiagnosticResult | null;
};

type ApiResponse = {
  ok: boolean;
  pending?: boolean;
  error?: string;
  session?: DiagnosticSession;
  upload?: {
    media_id: string;
    url: string;
  };
};

function citySlug(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  if (!CITY_SLUGS.has(normalized)) {
    throw new Error('CITY_NOT_SUPPORTED');
  }

  return normalized;
}

async function token(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('AUTH_REQUIRED');
  }
  return data.session.access_token;
}

async function post(
  accessToken: string,
  body: Record<string, unknown>,
): Promise<ApiResponse> {
  if (!/^https:\/\//i.test(baseUrl)) {
    throw new Error('RAFI_SERVER_UNAVAILABLE');
  }

  const response = await fetch(baseUrl + '/api/mobile-diagnostic-v1', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const value = await response.json().catch(() => null);
  if (!response.ok || !value || value.ok !== true) {
    throw new Error(String(value?.error || 'DIAGNOSTIC_FAILED'));
  }

  return value as ApiResponse;
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function analyzeMobileDiagnosticPhoto(input: {
  uri: string;
  mimeType?: string;
  city: string;
  description?: string;
}): Promise<MobileDiagnosticResult> {
  const accessToken = await token();
  const sessionId = Crypto.randomUUID();
  const runId = Crypto.randomUUID();
  const mimeType = input.mimeType || 'image/jpeg';

  const local = await fetch(input.uri);
  if (!local.ok) throw new Error('LOCAL_MEDIA_UNAVAILABLE');
  const bytes = await local.arrayBuffer();
  if (!bytes.byteLength) throw new Error('LOCAL_MEDIA_EMPTY');
  if (bytes.byteLength > 8 * 1024 * 1024) throw new Error('PHOTO_TOO_LARGE');

  let response = await post(accessToken, {
    action: 'create',
    session_id: sessionId,
    city_slug: citySlug(input.city),
    input: {
      description: String(input.description || '').trim(),
      answers: {},
      safety_signals: [],
    },
    consent_version: 'diagnostic-privacy-v1',
  });

  if (!response.session) throw new Error('DIAGNOSTIC_SESSION_MISSING');
  let session = response.session;

  response = await post(accessToken, {
    action: 'media_reserve',
    session_id: sessionId,
    revision: session.revision,
    kind: 'photo',
    mime: mimeType,
    bytes: bytes.byteLength,
  });

  if (!response.session || !response.upload?.url || !response.upload.media_id) {
    throw new Error('DIAGNOSTIC_UPLOAD_TICKET_MISSING');
  }
  session = response.session;

  const uploaded = await fetch(response.upload.url, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
    },
    body: bytes,
  });
  if (!uploaded.ok) throw new Error('DIAGNOSTIC_UPLOAD_FAILED');

  response = await post(accessToken, {
    action: 'media_validate',
    session_id: sessionId,
    revision: session.revision,
    media_id: response.upload.media_id,
  });
  if (!response.session) throw new Error('DIAGNOSTIC_VALIDATE_FAILED');
  session = response.session;

  response = await post(accessToken, {
    action: 'analyze',
    session_id: sessionId,
    revision: session.revision,
    run_id: runId,
  });

  if (response.session?.result) return response.session.result;

  for (let attempt = 0; attempt < 20; attempt++) {
    await sleep(1000);
    const polled = await post(accessToken, {
      action: 'get',
      session_id: sessionId,
    });
    if (polled.session?.result) return polled.session.result;
    if (polled.session?.state === 'failed') {
      throw new Error('DIAGNOSTIC_FAILED');
    }
  }

  throw new Error('DIAGNOSTIC_TIMEOUT');
}

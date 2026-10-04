/** W4 UI-only service boundaries. Typed contract shapes; no real account or backend. */
import { diagnosticResult, diagnosticSafety, diagnosticQualification } from './diagnostic-results';
import canonicalEstimator from './estimator-canonical.json';
import type { MissionSnapshot } from '../../lib/missionTerrain';
import type { ClientNotification, ClientProfile, ClientRequestHistory } from '../../lib/clientWorkspace';
import type { MissionEvidence } from '../../lib/missionEvidence';
import type { MobileDecisionContext } from '../../lib/decisionCenter';
import type { MissionChangeProposal } from '../../lib/missionChange';
export { getStableSession, resolveRole, signOut, supabase, watchClientNotifications, watchClientRequest,
  isCurrentDevicePushEnabled, registerCurrentDeviceForPush } from './rafi-empty-services.web';

const params = new URLSearchParams(location.search);
const scene = params.get('scene') || 'idle';
let status = params.get('status') || ({ matching: 'new', assigned: 'assigned', intervention: 'in_progress', validation: 'completed', mission: 'completed' } as Record<string, string>)[scene] || '';
export const calls: { name: string; args: unknown[] }[] = [];
const log = (name: string, ...args: unknown[]) => calls.push({ name, args });
const maybeFail = () => { if (params.has('error')) throw new Error('FIXTURE_UNAVAILABLE'); };
const requestId = '00000000-0000-4000-8000-000000000001';
const missionId = '00000000-0000-4000-8000-000000000002';
let profile: ClientProfile = { id: 'visual-fixture-only', full_name: null, phone: null, city: 'Fès', email: null };
const snapshot = (): MissionSnapshot => ({ mission_id: missionId, request_id: requestId, mission_status: ['completed', 'validated'].includes(status) ? 'done' : 'pending',
  request_status: status, service_category: 'Plomberie', city: 'Rabat', description: 'Une fuite sous le lavabo.', artisan_name: null, artisan_verified: false, agreed_price: null });
export async function getMyCurrentClientMission() { log('getMyCurrentClientMission'); return ['assigned', 'in_progress', 'completed', 'validated'].includes(status) ? snapshot() : null; }
export async function getMyCurrentClientRequest() { log('getMyCurrentClientRequest'); return status === 'new' ? { request_id: requestId, status: 'new', service_category: 'Plomberie', city: 'Rabat', description: 'Une fuite sous le lavabo.' } : null; }
export async function getMyMobileDecisionContext(): Promise<MobileDecisionContext> {
  log('getMyMobileDecisionContext');
  return { ok: true, role: 'client', version: 1, cue: status ? {
    id: 'client.' + status, source: 'canonical', authority: 'workflow', priority: status === 'completed' ? 'high' : 'normal',
    headline: status === 'completed' ? 'Votre validation est requise' : 'Votre suivi FIXEO',
    detail: status === 'completed' ? 'L’intervention est terminée. Vérifiez les preuves avant de confirmer.' : 'Retrouvez les étapes de votre demande dans votre suivi.',
    action: status === 'new' ? { kind: 'none' } : { kind: 'open_mission', mission_id: missionId },
    evidence: [{ field: 'request_status', value: status }],
  } : null };
}
export async function getClientRequestStatus() { return status || null; }
export async function createRequest(...args: unknown[]) {
  log('createRequest', ...args);
  if (params.has('requestCityError')) throw new Error('CITY_NOT_SUPPORTED');
  if (params.has('hold')) await new Promise(() => {});
  status = 'new'; return { id: requestId };
}
export const hasRafiServerGateway = () => params.has('ai');
export async function transcribeRafiVoice(uri: string) { log('transcribeRafiVoice', uri); return 'Une fuite sous le lavabo.'; }
export async function analyzeMobileDiagnosticPhoto(input: unknown) {
  log('analyzePhoto', input);
  if (params.has('photoHold')) await new Promise(() => {});
  if (params.has('cityError')) throw new Error('CITY_NOT_SUPPORTED');
  if (params.has('qualification')) return diagnosticQualification;
  if (params.has('choice')) return {...diagnosticResult, questions:[{id:'water_spreading', label:'L’eau se propage-t-elle rapidement ?', type:'choice'}]};
  return params.has('safety') ? diagnosticSafety : diagnosticResult;
}
export async function getClientProfile() { log('getClientProfile'); maybeFail(); return profile; }
export async function updateClientProfile(input: { phone: string; city: string }) { log('updateClientProfile', input); profile = { ...profile, ...input }; return profile; }
export async function listClientRequestHistory(): Promise<ClientRequestHistory[]> {
  log('listClientRequestHistory'); maybeFail();
  if (params.has('empty')) return [];
  return [
    { id: requestId, service_category: 'Plomberie', city: 'Rabat', description: 'Une fuite sous le lavabo.', status: 'completed', created_at: '2026-10-04T09:00:00Z' },
    { id: 'request-older', service_category: 'Serrurerie', city: 'Fès', description: null, status: 'validated', created_at: '2026-09-23T09:00:00Z' },
  ];
}
let notifications: ClientNotification[] = [
  { id: 'notification-1', type: 'c_mission_completed', title: 'Intervention terminée', message: 'Votre artisan a terminé. Confirmez pour valider la mission.', read: false, related_entity_type: 'service_request', related_entity_id: requestId, created_at: '2026-10-04T11:00:00Z' },
  { id: 'notification-2', type: 'c_mission_accepted', title: 'Artisan affecté', message: 'Un artisan a accepté votre demande.', read: false, related_entity_type: 'service_request', related_entity_id: requestId, created_at: '2026-10-04T10:00:00Z' },
  { id: 'notification-3', type: 'c_mission_validated', title: 'Mission validée', message: 'Votre validation est enregistrée.', read: true, related_entity_type: 'service_request', related_entity_id: 'request-older', created_at: '2026-09-23T10:00:00Z' },
];
export async function listClientNotifications() { log('listClientNotifications'); maybeFail(); return params.has('empty') ? [] : notifications; }
export async function markClientNotificationRead(id: string) { log('markClientNotificationRead', id); notifications = notifications.map(item => item.id === id ? { ...item, read: true } : item); }
export async function getClientMissionDetail(id: string) { log('getClientMissionDetail', id); maybeFail(); return snapshot(); }
export async function getMissionTimeline(id: string) { log('getMissionTimeline', id); return status === 'assigned' ? [] : [{ event_type: 'arrived', created_at: '2026-10-04T10:30:00Z' }]; }
export async function listMissionEvidence(id: string): Promise<MissionEvidence[]> {
  log('listMissionEvidence', id);
  if (params.has('evidenceError')) throw new Error('FIXTURE_EVIDENCE_UNAVAILABLE');
  // Optional single-pixel assets exercise image rendering only; not used in aesthetic captures.
  return params.has('photos') ? (['before', 'after'] as const).map(kind => ({ id: 'evidence-' + kind, kind, mime_type: 'image/png', created_at: '2026-10-04T10:30:00Z', signed_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==' })) : [];
}
export async function confirmCompletedRequest(id: string) { log('confirmCompletedRequest', id); status = 'validated'; return { ok: true }; }
let change: MissionChangeProposal | null = params.has('change') ? { id: 'change-1', mission_id: missionId, proposed_price: canonicalEstimator.outcomes.price.price.amount_mad, reason: 'Fourniture supplémentaire à confirmer.', version: 1, status: 'presented' } : null;
export async function getMissionChange(id: string) { log('getMissionChange', id); return change; }
export async function respondMissionChange(id: string, approve: boolean) { log('respondMissionChange', id, approve); if (change) change = { ...change, status: approve ? 'client_accepted' : 'client_rejected' }; return { ok: true }; }

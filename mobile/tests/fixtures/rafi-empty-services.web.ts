/** Explicit test-only boundaries. No backend, no fabricated mission, offer or AI result. */
export async function getStableSession() { return { user: { id: 'visual-fixture-only' } }; }
export async function resolveRole() { return 'client'; }
export async function signOut() {}
export const supabase = { removeChannel: async () => {} };
export async function getMyCurrentClientMission() { return null; }
export async function getMyCurrentClientRequest() { return null; }
export async function getMyCurrentArtisanMission() { return null; }
export async function getMyMobileDecisionContext() { return { cue: null }; }
export async function getArtisanWorkspaceSummary() { return null; }
export async function getDispatchOffers() { return []; }
export function watchClientNotifications() { return null; }
export function watchClientRequest() { return null; }
export async function getClientRequestStatus() { return null; }
export async function isCurrentDevicePushEnabled() { return false; }
export async function registerCurrentDeviceForPush() { return { ok: false, reason: 'unsupported_platform' }; }
export async function createRequest(): Promise<never> { throw new Error('VISUAL_FIXTURE_NO_BACKEND'); }
export async function acceptDispatchOffer(): Promise<never> { throw new Error('VISUAL_FIXTURE_NO_BACKEND'); }
export const hasRafiServerGateway = () => false;
export async function transcribeRafiVoice(): Promise<never> { throw new Error('VISUAL_FIXTURE_NO_AI'); }
export async function analyzeMobileDiagnosticPhoto(): Promise<never> { throw new Error('VISUAL_FIXTURE_NO_AI'); }

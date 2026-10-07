import AsyncStorage from '@react-native-async-storage/async-storage';
import { onSessionRejected, privateSessionGeneration } from './authEvents';
import type { ClientIntelligenceContext } from './clientIntelligence';
import type { MobileDiagnosticResult } from './mobileDiagnostic';
import type { MobileEstimatorRequest, MobileEstimatorResponse } from './mobileEstimatorContract';

export type EstimatorDraft = {
  result: MobileEstimatorResponse | null; answer: string | number | boolean;
  started: boolean; history: { result: MobileEstimatorResponse; label: string; answer: string | number | boolean }[];
  phone: string; confirming: boolean; stopped: boolean;
  lastAction: MobileEstimatorRequest | null; pendingConfirmation: MobileEstimatorRequest | 'direct' | null;
  directKey: string | null; error: { kind: string; message: string } | null;
};
export type ClientDraft = {
  id: string; updatedAt: number; problem: string; city: string; declaredService: string;
  problemConfirmedFromRafi: boolean; photoUri: string | null; photoMimeType: string;
  photoDiagnostic: MobileDiagnosticResult | null; photoReviewed: boolean;
  diagnosticReference?: string; diagnosticCity: string; persistPhoto: boolean;
  safetyStopped: boolean; safetyMessage: string; estimateContext: ClientIntelligenceContext | null;
  estimateOpen: boolean; estimator: EstimatorDraft | null; submissionKey: string | null;
};
const prefix = 'fixeo.client-drafts.v1.';
const cache = new Map<string, ClientDraft[]>();
const pending = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const removed = new Set<string>();
let writes = Promise.resolve();
let epoch = 0;
export const draftStorageGeneration = () => epoch;
const notify = () => listeners.forEach(listener => listener());
export function subscribeDrafts(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function clientDrafts(owner: string) { return cache.get(owner) || []; }
export async function loadClientDrafts(owner: string) {
  if (cache.has(owner)) return clientDrafts(owner);
  if (!pending.has(owner)) {
    const generation = privateSessionGeneration(), started = epoch;
    pending.set(owner, (async () => {
      const value = await AsyncStorage.getItem(prefix + owner).catch(() => null);
      if (generation !== privateSessionGeneration() || started !== epoch) return;
      let drafts: ClientDraft[] = [];
      try { const parsed = JSON.parse(value || '[]'); if (Array.isArray(parsed)) drafts = parsed.filter(item => item && typeof item.id === 'string' && typeof item.problem === 'string' && typeof item.city === 'string'); } catch {}
      cache.set(owner, drafts.filter(item => !removed.has(owner + ':' + item.id))); notify();
    })().finally(() => { if (started === epoch) pending.delete(owner); }));
  }
  await pending.get(owner);
  return clientDrafts(owner);
}
function persist(owner: string) {
  const value = JSON.stringify(clientDrafts(owner));
  writes = writes.catch(() => undefined).then(() => AsyncStorage.setItem(prefix + owner, value));
  // Memory remains available if device storage is temporarily unavailable.
  void writes.catch(() => undefined); notify();
}
export function saveClientDraft(owner: string, draft: ClientDraft) {
  if (!owner || removed.has(owner + ':' + draft.id) || (!draft.problem.trim() && !draft.photoUri)) return;
  cache.set(owner, [draft, ...clientDrafts(owner).filter(item => item.id !== draft.id)]);
  persist(owner);
}
export function removeClientDraft(owner: string, id: string) {
  removed.add(owner + ':' + id);
  cache.set(owner, clientDrafts(owner).filter(item => item.id !== id)); persist(owner);
}
export function clearClientDrafts() {
  epoch++;
  cache.clear(); pending.clear(); removed.clear(); notify();
  writes = writes.catch(() => undefined).then(async () => {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter(key => key.startsWith(prefix)));
  });
  void writes.catch(() => undefined);
}
onSessionRejected(clearClientDrafts);

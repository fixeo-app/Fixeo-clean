import AsyncStorage from '@react-native-async-storage/async-storage';
import { onSessionRejected, privateSessionGeneration } from './authEvents';
export type QuoteDraft = {
  id: string; baseline?: string; origin: string; clientId: string; requestId: string; title: string;
  lines: { type: 'service' | 'labor' | 'supply'; label: string; quantity: string; price: string }[];
  discount: string; notes: string; validity: string; duration: string; section: number;
};
const prefix = 'fixeo.quote-draft.v1.';
let writes = Promise.resolve();
const key = (owner: string, scope: string) => prefix + owner + '.' + encodeURIComponent(scope);
export async function loadQuoteDraft(owner: string, scope: string): Promise<QuoteDraft | null> {
  const generation = privateSessionGeneration();
  await writes.catch(() => undefined);
  const raw = await AsyncStorage.getItem(key(owner, scope));
  if (!raw || generation !== privateSessionGeneration()) return null;
  try {
    const d = JSON.parse(raw);
    if (!d || !['personal', 'fixeo'].includes(d.origin) || !Number.isInteger(d.section) || d.section < 0 || d.section > 2 || !Array.isArray(d.lines) || d.lines.length < 1 || d.lines.length > 50) return null;
    for (const field of ['id','clientId','requestId','title','discount','notes','validity','duration']) if (typeof d[field] !== 'string') return null;
    if (!d.lines.every((line: QuoteDraft['lines'][number]) => line && ['service','labor','supply'].includes(line.type) && ['label','quantity','price'].every(field => typeof (line as any)[field] === 'string'))) return null;
    return d;
  } catch { return null; }
}
export function saveQuoteDraft(owner: string, scope: string, draft: QuoteDraft) {
  const generation = privateSessionGeneration(), value = JSON.stringify(draft);
  writes = writes.catch(() => undefined).then(async () => {
    if (generation === privateSessionGeneration()) await AsyncStorage.setItem(key(owner, scope), value);
  });
  return writes;
}
export function removeQuoteDraft(owner: string, scope: string) {
  writes = writes.catch(() => undefined).then(() => AsyncStorage.removeItem(key(owner, scope)));
  return writes;
}
onSessionRejected(reason => {
  if (reason !== 'logout') return;
  writes = writes.catch(() => undefined).then(async () => {
    const keys = await AsyncStorage.getAllKeys(); await AsyncStorage.multiRemove(keys.filter(k => k.startsWith(prefix)));
  });
  void writes.catch(() => undefined);
});

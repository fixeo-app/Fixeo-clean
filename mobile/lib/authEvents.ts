// No identity or token retained here. The app owner decides how to clear its UI.
const listeners = new Set<(reason: 'revoked' | 'logout') => void>();
let generation = 0;
export const privateSessionGeneration = () => generation;
export function onSessionRejected(fn: (reason: 'revoked' | 'logout') => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function rejectPrivateSession(reason: 'revoked' | 'logout' = 'revoked') { generation++; listeners.forEach(fn => fn(reason)); }

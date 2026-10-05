/** No session, credentials, backend calls or auth writes in this UI fixture. */
export async function signOut() { await new Promise(resolve => setTimeout(resolve, 400)); }

import AsyncStorage from '@react-native-async-storage/async-storage';
import { privateSessionGeneration } from './authEvents';
const prefix='fixeo.pending-business.v1.';
type Pending = { version:1; payload:Record<string,unknown> };
const inflight=new Map<string,Promise<unknown>>();
const key=(owner:string,scope:string)=>prefix+owner+'.'+encodeURIComponent(scope);
export async function readPendingBusinessWrite(owner:string,scope:string) {
  const generation=privateSessionGeneration();
  const raw=await AsyncStorage.getItem(key(owner,scope));
  if(generation!==privateSessionGeneration())throw Error('SESSION_REVOKED');
  if(!raw)return null;
  const record=JSON.parse(raw) as Pending;
  if(record.version!==1 || !record.payload || typeof record.payload.id!=='string')throw Error('PENDING_WRITE_INVALID');
  return record.payload;
}
/** Durable intent before mutation. Unknown outcomes keep an immutable owner-scoped payload. */
export async function guardedBusinessWrite<T>(owner:string,scope:string,payload:Record<string,unknown>,write:()=>Promise<T>):Promise<T> {
  const storageKey=key(owner,scope),generation=privateSessionGeneration();
  if(inflight.has(storageKey))throw Error('PENDING_WRITE_BUSY');
  const task=(async()=>{
    const previous=await readPendingBusinessWrite(owner,scope);
    if(previous && JSON.stringify(previous)!==JSON.stringify(payload))throw Error('PENDING_WRITE_LOCKED');
    await AsyncStorage.setItem(storageKey,JSON.stringify({version:1,payload}));
    if(generation!==privateSessionGeneration())throw Error('SESSION_REVOKED');
    let result:T;
    try { result=await write(); }
    catch(error){
      // Only definitive server rejections release the immutable intent. Network/auth/timeout keep it.
      const e=error as {message?:string;code?:string};
      if(/^(?:BUSINESS_|LEDGER_INVALID|LEDGER_JOB_INVALID|LEDGER_CLIENT_MISMATCH|JOB_INVALID|QUOTE_VERSION_CONFLICT|QUOTE_VERSION_REQUIRED|CLIENT_VERSION_CONFLICT|QUOTE_LINKS_ALREADY_RECORDED|JOB_LINKS_ALREADY_RECORDED)/.test(e.message||'') || ['23503','23514','22007','22003'].includes(e.code||'')) await AsyncStorage.removeItem(storageKey);
      throw error;
    }
    await AsyncStorage.removeItem(storageKey);
    if(generation!==privateSessionGeneration())throw Error('SESSION_REVOKED');
    return result;
  })();
  inflight.set(storageKey,task);
  try{return await task;}finally{inflight.delete(storageKey);}
}

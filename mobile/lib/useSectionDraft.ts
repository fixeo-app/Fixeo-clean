import { useEffect, useState } from 'react';
import { equalDraft, reconcileSection, type SectionDraft } from './sectionDraft';
/** Hydrates clean sections only. Dirty sections keep values and their original baseline. */
export function useSectionDraft<T>(scope: string, remote: T) {
  const [state,set] = useState<SectionDraft<T>>(()=>reconcileSection(null,scope,remote));
  const signature=JSON.stringify(remote);
  useEffect(()=>{set(previous=>reconcileSection(previous,scope,JSON.parse(signature) as T));},[scope,signature]);
  return { ...state, dirty:!equalDraft(state.value,state.baseline),
    edit:(value:T)=>set(previous=>({...previous,value})),
    acceptRemote:()=>set(previous=>({...previous,value:previous.remote,baseline:previous.remote,conflict:false})),
    reapply:()=>set(previous=>({...previous,baseline:previous.remote,conflict:false})),
    confirm:(value:T)=>set(previous=>({...previous,value,baseline:value,remote:value,conflict:false})) };
}

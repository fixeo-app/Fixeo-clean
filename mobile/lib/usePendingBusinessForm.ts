import { useEffect, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { artisanAccess } from './artisanOS';
import { onSessionRejected } from './authEvents';
import { readPendingBusinessWrite } from './pendingBusinessWrite';
export function usePendingBusinessForm(scope:string,restore:(payload:Record<string,unknown>)=>void) {
  const apply=useRef(restore);apply.current=restore;
  const [frozen,setFrozen]=useState(false),[ready,setReady]=useState(false),[error,setError]=useState('');
  const mounted=useRef(true), currentScope=useRef(scope); currentScope.current=scope;
  async function refresh(hydrate=false){
    try{
      const actor=await artisanAccess(),pending=await readPendingBusinessWrite(actor.user_id,scope);
      if(!mounted.current || currentScope.current!==scope)return;
      if(pending && hydrate)apply.current(pending);
      setFrozen(!!pending);setReady(true);setError('');
    }catch{if(mounted.current){setReady(false);setError('Impossible de vérifier les opérations en attente. Réessayez avant d’enregistrer.');}}
  }
  useEffect(()=>{mounted.current=true;void refresh(true);const unsubscribe=onSessionRejected(()=>{setReady(false);setFrozen(true);});return()=>{mounted.current=false;unsubscribe();};},[scope]); // eslint-disable-line react-hooks/exhaustive-deps
  return {frozen,ready,error,refresh:()=>refresh(true),lock:()=>{Keyboard.dismiss();setFrozen(true);},settle:()=>refresh(false)};
}

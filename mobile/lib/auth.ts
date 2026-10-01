import { supabase } from './supabase';
import { disableCurrentDevice } from './push';
import { resolveWorkspaces } from './workspaces';

export type FixeoRole='client'|'artisan'|'admin';

export async function signIn(email:string,password:string){
  const {data,error}=await supabase.auth.signInWithPassword({email,password});
  if(error)throw error;
  return data;
}

export async function signOut(){
  try{await disableCurrentDevice();}catch{}
  const {error}=await supabase.auth.signOut();
  if(error)throw error;
}

export async function resolveRole():Promise<FixeoRole>{
  const resolution=await resolveWorkspaces();
  return resolution.global_role;
}

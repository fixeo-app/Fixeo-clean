import { supabase } from './supabase';
export type FixeoRole='client'|'artisan'|'admin';
export async function signIn(email:string,password:string){const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;return data;}
export async function signOut(){const {error}=await supabase.auth.signOut();if(error)throw error;}
export async function resolveRole():Promise<FixeoRole>{const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('AUTH_REQUIRED');const {data,error}=await supabase.from('profiles').select('role').eq('id',user.id).single();if(error)throw error;const role=String(data?.role||'');if(!['client','artisan','admin'].includes(role))throw new Error('ROLE_INVALID');return role as FixeoRole;}

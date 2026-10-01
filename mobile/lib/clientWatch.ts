import {supabase} from './supabase';
export function watchClientNotifications(userId:string,onEvent:(payload:any)=>void){return supabase.channel('mobile-client-'+userId).on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:'recipient_user_id=eq.'+userId},onEvent).subscribe();}

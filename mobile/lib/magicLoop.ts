import { supabase } from './supabase';
export async function createRequest(service:string,city:string,description:string,idempotencyKey:string){
 const {data,error}=await supabase.rpc('create_my_service_request_v1',{p_service_category:service,p_city:city,p_description:description,p_idempotency_key:idempotencyKey}); if(error) throw error; return data;
}
export async function getOffers(){ const {data,error}=await supabase.rpc('get_my_mission_offers'); if(error) throw error; return data ?? []; }
export async function claimMission(id:string){ const {data,error}=await supabase.rpc('claim_mission',{p_mission_id:id}); if(error) throw error; return data; }
export async function declineMission(id:string){ const {data,error}=await supabase.rpc('decline_mission',{p_mission_id:id}); if(error) throw error; return data; }
export async function getMission(id:string){ const {data,error}=await supabase.rpc('get_accepted_mission_detail',{p_mission_id:id}); if(error) throw error; return data; }

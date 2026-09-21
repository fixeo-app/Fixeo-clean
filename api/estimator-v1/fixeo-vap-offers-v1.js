'use strict';
const crypto=require('node:crypto');
const {buildBreakdown,VERSION}=require('../../data/pricing/engine/vap-bp33-v1');
const {tariffBreakdown,quantityUnits}=require('../../data/pricing/engine/vap-tariff-v1');
const catalogue=require('../../data/pricing/canonical/vap-approved-v1.json');

// Only exact, reviewed scope/zone matches qualify. No inference from legacy total.
function selectTariff(session,entries=catalogue.entries){
 if(require('../../data/pricing/engine/serrurerie-pilot-v1').guard(session.service_code,session.known_inputs))return null;
 if(require('../../data/pricing/engine/climatisation-pilot-v1').guard(session.service_code,session.known_inputs))return null;
 if(require('../../data/pricing/engine/electricity-pilot-v1').guard(session.service_code,session.known_inputs))return null;
 return entries.find(t=>t.approved===true && t.service_code===session.service_code &&
  t.city_slug===session.entry_context?.city_slug && t.outcome_type===session.outcome?.outcome_type &&
  t.inputs && Object.keys(t.inputs).length>0 &&
  (!t.quantity_guard || (()=>{try{quantityUnits(t.quantity_guard,session.known_inputs);return true;}catch{return false;}})()) &&
  Object.entries(t.inputs).every(([k,v])=>session.known_inputs?.[k]===v)) || null;
}
async function attachOffer(session,payload,{entries=catalogue.entries,fetchImpl=fetch,env=process.env}={}){
 const tariff=selectTariff(session,entries);if(!tariff){if(/^(plomberie|electricite|climatisation|serrurerie|jardinage|carrelage|maconnerie|demenagement|peinture)\./.test(session.service_code||''))throw Error('Service scope or city not eligible for VAP');return null;}
 const breakdown=tariffBreakdown(tariff,session.known_inputs);
 if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_ROLE_KEY)throw Error('VAP persistence unavailable');
 const id=crypto.randomUUID();
 const row={id,offer_key:crypto.randomUUID(),pricing_version:VERSION,currency:'MAD',service_code:payload.service_code,
 catalogue_version:tariff.catalogue_version,city:payload.city_slug,
 scope:{context_id:payload.context_id,session_id:payload.session_id,outcome_type:payload.outcome_type,inputs:/^serrurerie\./.test(session.service_code)?tariff.inputs:session.known_inputs},
 vap_minor:breakdown.vapMinor,materials_minor:breakdown.materialsMinor,commission_minor:breakdown.commissionMinor,
 client_total_minor:breakdown.clientTotalMinor,expires_at:new Date(payload.expires_at).toISOString()};
 const r=await fetchImpl(env.SUPABASE_URL+'/rest/v1/fixeo_pricing_offers_v1',{method:'POST',headers:{'Content-Type':'application/json',apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,Prefer:'return=minimal'},body:JSON.stringify(row),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('VAP persistence failed');
 payload.pricing_version=VERSION;payload.offer_id=id;payload.financial_breakdown=breakdown;
 payload.amount_mad=breakdown.clientTotalMinor/100;
 if(payload.outcome_type==='LABOUR_PLUS_PART_READY')payload.labour_amount_mad=payload.amount_mad;
 return breakdown;
}
function validateFinancialContext(payload){
 if(/^serrurerie\./.test(payload.service_code||'')){const s=require('../../data/pricing/engine/serrurerie-pilot-v1').services[payload.service_code];if(!s||payload.pricing_version!==VERSION||payload.amount_mad!==s.total_minor/100||payload.financial_breakdown?.vapMinor!==s.vap_minor||payload.financial_breakdown?.materialsMinor!==0||payload.financial_breakdown?.commissionMinor!==6000||payload.outcome_type!==(payload.service_code==='serrurerie.diagnostic'?'DIAGNOSTIC_READY':'PRICE_READY')||!catalogue.entries.some(t=>t.approved===true&&t.catalogue_version==='serrurerie-pilot-v1'&&t.service_code===payload.service_code&&t.city_slug===payload.city_slug))throw Error('Serrurerie requires current approved VAP offer');}
 if(!payload.pricing_version && !payload.offer_id && !payload.financial_breakdown)return null;
 if(payload.pricing_version!==VERSION || !/^[0-9a-f-]{36}$/i.test(payload.offer_id||''))throw Error('Invalid pricing version/offer');
 const b=payload.financial_breakdown;
 if(!b)throw Error('Missing financial breakdown');
 const expected=buildBreakdown({pricingVersion:payload.pricing_version,vapMinor:b.vapMinor,materialsMinor:b.materialsMinor});
 for(const k of Object.keys(expected))if(b[k]!==expected[k])throw Error('Invalid financial breakdown');
 if(payload.amount_mad!==expected.clientTotalMinor/100)throw Error('Invalid client total');
 if(payload.outcome_type==='LABOUR_PLUS_PART_READY' && payload.labour_amount_mad!==payload.amount_mad)throw Error('Invalid labour total');
 return expected;
}
module.exports={selectTariff,attachOffer,validateFinancialContext};

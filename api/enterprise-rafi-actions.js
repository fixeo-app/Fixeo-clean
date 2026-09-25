'use strict';

const ACTION_TYPES=Object.freeze([
  'create_governed_request',
  'propose_internal_assignment',
  'propose_hybrid_dispatch',
  'decide_approval',
  'upsert_control_tower_escalation',
  'prepare_maintenance_action'
]);
const MUTATING_TYPES=new Set(ACTION_TYPES);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(v,max){v=String(v==null?'':v).trim();return v.slice(0,max);}
function cleanValue(v,depth=0){
  if(depth>3)return null;
  if(v==null||typeof v==='boolean')return v;
  if(typeof v==='number')return Number.isFinite(v)?v:null;
  if(typeof v==='string')return cleanText(v,1000);
  if(Array.isArray(v))return v.slice(0,20).map(x=>cleanValue(x,depth+1));
  if(typeof v==='object'){
    const o={};for(const [k,x] of Object.entries(v).slice(0,30)){
      if(/^[a-z][a-z0-9_]{0,63}$/i.test(k))o[k]=cleanValue(x,depth+1);
    }return o;
  }
  return null;
}
function normalizeAction(raw){
  if(!raw||typeof raw!=='object')return null;
  const type=cleanText(raw.type,80);
  if(!ACTION_TYPES.includes(type))return null;
  const target=raw.target&&typeof raw.target==='object'?cleanValue(raw.target):{};
  const params=raw.params&&typeof raw.params==='object'?cleanValue(raw.params):{};
  return Object.freeze({
    proposal_version:'h1',
    type,
    title:cleanText(raw.title,160)||'Action proposée par RAFI',
    summary:cleanText(raw.summary,600),
    target,
    params,
    impact:cleanText(raw.impact,600),
    requires_confirmation:true,
    executable:false
  });
}
function normalizeActions(raw){
  if(!Array.isArray(raw))return [];
  return raw.slice(0,3).map(normalizeAction).filter(Boolean);
}
function validateProposal(action,enterpriseId){
  if(!action||action.proposal_version!=='h1'||!ACTION_TYPES.includes(action.type))return false;
  if(!UUID.test(enterpriseId||''))return false;
  if(action.requires_confirmation!==true||action.executable!==false)return false;
  return true;
}
module.exports={ACTION_TYPES,MUTATING_TYPES,normalizeAction,normalizeActions,validateProposal};

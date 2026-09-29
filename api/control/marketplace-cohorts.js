'use strict';
// Wilson score interval, NIST/SEMATECH e-Handbook 7.2.4.1. Observational uncertainty, never a forecast.
const NIST='https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm';
const count=x=>Number.isSafeInteger(x)&&x>=0;
// SQL supplies both authoritative business dates and UTC boundaries. Do not
// reinterpret those dates with a second runtime timezone database.
const civilDay=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return NaN;const t=Date.parse(value+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===value?t/86400000:NaN;};
function comparable(scope,a,b){
 const start=civilDay(scope.from),end=civilDay(scope.to),previous=civilDay(scope.previous_from);
 const same=(x,y)=>Number.isFinite(Date.parse(x))&&Date.parse(x)===Date.parse(y);
 return scope.timezone==='Africa/Casablanca'&&end-start===scope.days&&start-previous===scope.days&&scope.days>0&&
  same(a.start_at,scope.from_utc)&&same(a.end_at,scope.to_utc)&&same(b.start_at,scope.previous_from_utc)&&same(b.end_at,scope.from_utc)&&
  Date.parse(a.end_at)>Date.parse(a.start_at)&&Date.parse(b.end_at)>Date.parse(b.start_at);
}
function wilson(k,n){
 if(!count(k)||!count(n)||n===0||k>n)return null;
 const z=1.959963984540054,z2=z*z,p=k/n,d=1+z2/n,center=(p+z2/(2*n))/d,half=z*Math.sqrt(p*(1-p)/n+z2/(4*n*n))/d;
 return {lower:Math.max(0,center-half),upper:Math.min(1,center+half),confidence:0.95,method:'Wilson score',assumption:'binomial uncertainty; observational records, no causal interpretation',reference:NIST};
}
function rate(r){
 const k=r.accepted_within_horizon,n=r.observable_denominator;
 const status=r.unknown_acceptance>0?'PARTIAL':n===0?'UNKNOWN':r.censored>0?'CENSORED':'FRESH';
 return {status,numerator:k,denominator:n,unknown:r.unknown_acceptance,censored:r.censored,value:status==='PARTIAL'||n===0?null:k/n,interval:status==='PARTIAL'?null:wilson(k,n),small_sample:n<30,grain:'request',rule_version:'fixed-horizon-v1'};
}
function build(data,now=Date.now()){
 const at=Date.parse(data?.as_of);
 const valid=data?.contract_version==='marketplace-cohorts-v1'&&count(data.scope?.days)&&data.scope.days>0&&[1,24,72,168].includes(data.scope.horizon_hours)&&Number.isFinite(at)&&at<=now+5000&&Array.isArray(data.cohorts)&&data.cohorts.length===2&&['current','previous'].every(l=>data.cohorts.filter(c=>c.label===l).length===1)&&data.cohorts.every(c=>{
  const r=c.requests;return r&&['total','mature','censored','unknown_acceptance','observable_denominator','accepted_within_horizon','external_within_horizon','internal_within_horizon'].every(k=>count(r[k]))&&r.mature+r.censored===r.total&&r.observable_denominator+r.unknown_acceptance===r.mature&&r.accepted_within_horizon<=r.observable_denominator&&r.external_within_horizon<=r.accepted_within_horizon&&r.internal_within_horizon<=r.accepted_within_horizon;
 });
 if(!valid)return {status:'UNAVAILABLE',error:'INVALID_COHORT_PROVENANCE',as_of:null,cohorts:null,comparison:null};
 const cohorts=data.cohorts.map(c=>({...c,conversion:rate(c.requests)})),a=cohorts.find(c=>c.label==='current'),b=cohorts.find(c=>c.label==='previous');
 let reason=null;
 if(!comparable(data.scope,a,b)||data.undated_requests!==0)reason='INCOMPARABLE_OR_UNDATED';
 else if(now-at>60000)reason='STALE';
 else if([a,b].some(c=>c.conversion.status==='PARTIAL'))reason='PARTIAL_SOURCE';
 else if([a,b].some(c=>c.conversion.censored>0))reason='CENSORED_COHORT';
 else if([a,b].some(c=>c.conversion.denominator===0))reason='EMPTY_DENOMINATOR';
 else if([a,b].some(c=>c.conversion.small_sample))reason='SMALL_SAMPLE';
 const delta=a.conversion.value!==null&&b.conversion.value!==null?(a.conversion.value-b.conversion.value)*100:null;
 const separated=!reason&&(a.conversion.interval.upper<b.conversion.interval.lower||b.conversion.interval.upper<a.conversion.interval.lower);
 return {...data,cohorts,status:now-at>60000?'STALE':cohorts.some(c=>c.conversion.status==='PARTIAL')?'PARTIAL':'FRESH',
 comparison:{status:reason?'NOT_ESTABLISHED':separated?'OBSERVED_DIFFERENCE':'INCONCLUSIVE',reason,delta_percentage_points:delta,
 volume_difference:a.requests.total-b.requests.total,volume_relative_change:b.requests.total>0?(a.requests.total-b.requests.total)/b.requests.total:null,
 volume_reference_reason:b.requests.total===0?'BASELINE_ZERO':null,rule_version:'comparable-cohorts-v1',minimum_observable_per_cohort:30,
 interpretation:'Equal business-date windows, same fixed acceptance horizon. Descriptive comparison only; composition, seasonality and causal drivers are not controlled.',
 action:{kind:'RECOMMENDATION',population:'cohort',text:'Examiner les populations et les preuves avant toute décision.'}},execution_authorized:false};
}
module.exports={wilson,rate,build};

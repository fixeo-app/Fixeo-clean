'use strict';
const VERSION='marketplace-intelligence-v1',SOURCES=Object.freeze(['operations','network','commerce']);
const stamp=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
function sourceState(source,data,error,now=Date.now()){
 if(error)return {source,status:error.code==='FORBIDDEN'?'FORBIDDEN':'UNAVAILABLE',error:error.code||'DEPENDENCY_UNAVAILABLE',as_of:null,data:null};
 const at=stamp(data?.as_of);
 if(data?.contract_version!==VERSION||data.source!==source||at===null||at>now+5000||!data.scope_hash||!Array.isArray(data.items)||!Number.isSafeInteger(data.total_cells)||data.total_cells<data.items.length||typeof data.has_more!=='boolean'||data.items.some(x=>typeof x.key!=='string'||!x.facts))return {source,status:'UNAVAILABLE',error:'INVALID_SOURCE_PROVENANCE',as_of:null,data:null};
 return {source,status:now-at>60000?'STALE':'FRESH',error:null,as_of:data.as_of,data};
}
function build(sources,{now=Date.now()}={}){
 const usable=SOURCES.filter(s=>sources[s]?.status==='FRESH');
 const first=usable.length?sources[usable[0]].data:null;
 const states=Object.fromEntries(SOURCES.map(s=>[s,sources[s]||sourceState(s,null,{code:'SOURCE_UNAVAILABLE'},now)]));
 for(const s of usable)if(states[s].data.scope_hash!==first.scope_hash||JSON.stringify(states[s].data.items.map(x=>x.key))!==JSON.stringify(first.items.map(x=>x.key))){states[s]={...states[s],status:'PARTIAL',error:'CONCURRENT_SOURCE_WINDOW',data:null};}
 const cells=first?first.items.map(x=>({key:x.key,city:x.city,trade:x.trade,...Object.fromEntries(SOURCES.map(s=>[s,states[s].status==='FRESH'?states[s].data.items.find(y=>y.key===x.key)?.facts??null:null]))})):[];
 return {contract_version:VERSION,generated_at:new Date(now).toISOString(),status:SOURCES.every(s=>states[s].status==='FRESH')?'FRESH':SOURCES.every(s=>states[s].data===null||states[s].status==='STALE')?'UNAVAILABLE':'PARTIAL',
 sources:states,scope:first?.scope??null,scope_hash:first?.scope_hash??null,cells,total_cells:first?.total_cells??null,has_more:first?.has_more??false,next_cursor:first?.next_cursor??null,
 unattributed_missions:states.operations.status==='FRESH'?states.operations.data.unattributed_missions:null,
 completeness:'exact cell facts; paginated cell selection; unavailable sources remain null',execution_authorized:false};
}
module.exports={VERSION,SOURCES,sourceState,build};

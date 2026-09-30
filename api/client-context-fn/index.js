'use strict';

const { publicConfig } = require('../supabase-environment');

class ClientContextError extends Error {
  constructor(code,status=400){ super(code); this.code=code; this.status=status; }
}

function send(res,status,body){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  return res.status(status).json(body);
}

function sameOrigin(req,env){
  const origin=String(req.headers?.origin||'');
  const allowed=new Set(['https://www.fixeo.ma','https://fixeo.ma']);
  if(env.VERCEL_ENV==='preview'&&env.VERCEL_URL) allowed.add('https://'+env.VERCEL_URL);
  if(origin && !allowed.has(origin)) throw new ClientContextError('ORIGIN_REJECTED',403);
  if(req.headers?.['sec-fetch-site'] && req.headers['sec-fetch-site']!=='same-origin')
    throw new ClientContextError('ORIGIN_REJECTED',403);
}

function bearer(req){
  const value=String(req.headers?.authorization||'');
  if(!/^Bearer [A-Za-z0-9._-]{20,4096}$/.test(value)) throw new ClientContextError('AUTH_REQUIRED',401);
  return value.slice(7);
}

async function boundedJson(response,max=512*1024){
  const text=await response.text();
  if(Buffer.byteLength(text)>max) throw new ClientContextError('DEPENDENCY_RESPONSE_TOO_LARGE',502);
  if(!text) return null;
  try{return JSON.parse(text);}catch(_){throw new ClientContextError('DEPENDENCY_INVALID_JSON',502);}
}

async function rest(cfg,token,path){
  const response=await fetch(cfg.SUPABASE_URL+'/rest/v1/'+path,{
    method:'GET',
    headers:{apikey:cfg.SUPABASE_ANON_KEY,Authorization:'Bearer '+token,Accept:'application/json'},
    signal:AbortSignal.timeout(12000),
    redirect:'error'
  });
  if(!response.ok) throw new ClientContextError('DATA_UNAVAILABLE',response.status===401||response.status===403?403:502);
  return (await boundedJson(response))||[];
}

async function authUser(cfg,token){
  const response=await fetch(cfg.SUPABASE_URL+'/auth/v1/user',{
    headers:{apikey:cfg.SUPABASE_ANON_KEY,Authorization:'Bearer '+token},
    signal:AbortSignal.timeout(12000),
    redirect:'error'
  });
  if(!response.ok) throw new ClientContextError('AUTH_REQUIRED',401);
  const data=await boundedJson(response,128*1024);
  if(!data||!data.id) throw new ClientContextError('AUTH_REQUIRED',401);
  return data;
}

function lower(v){return String(v||'').toLowerCase().trim();}
function isActiveStatus(s){return ['new','assigned','in_progress','completed','nouvelle','acceptée','acceptee','en_cours','en cours','terminée','terminee'].includes(lower(s));}
function isCompletedAwaiting(s){return ['completed','terminée','terminee'].includes(lower(s));}
function isInProgress(s){return ['in_progress','en_cours','en cours'].includes(lower(s));}
function isAssigned(s){return ['assigned','acceptée','acceptee','accepted'].includes(lower(s));}

function decisionFrom(context){
  const requests=context.requests,quotes=context.quotes,missions=context.missions,notifications=context.notifications;
  const byUpdated=requests.slice().sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));
  const awaiting=byUpdated.find(r=>isCompletedAwaiting(r.status));
  if(awaiting) return {
    kind:'confirm_completed',tone:'attention',title:'Votre confirmation est attendue',
    text:'Une intervention est indiquée comme terminée. Vérifiez la prestation avant de la confirmer.',
    action:'go-requests',target_id:awaiting.id,quote_id:null,
    evidence:[{type:'service_request',id:awaiting.id,status:awaiting.status,created_at:awaiting.created_at}]
  };
  const pendingQuote=quotes.find(q=>lower(q.status)==='pending');
  if(pendingQuote){
    const request=requests.find(r=>r.id===pendingQuote.request_id)||null;
    return {
      kind:'review_quote',tone:'attention',title:'Une proposition vous attend',
      text:'Un devis enregistré attend votre décision.',
      action:'go-requests',target_id:pendingQuote.request_id,quote_id:pendingQuote.id,
      evidence:[
        {type:'quote',id:pendingQuote.id,status:pendingQuote.status,created_at:pendingQuote.created_at},
        request?{type:'service_request',id:request.id,status:request.status,created_at:request.created_at}:null
      ].filter(Boolean)
    };
  }
  const live=byUpdated.find(r=>isInProgress(r.status));
  if(live) return {
    kind:'track_mission',tone:'live',title:'Intervention en cours',
    text:'Votre intervention est actuellement indiquée en cours dans le dossier FIXEO.',
    action:'go-missions',target_id:live.id,quote_id:null,
    evidence:[{type:'service_request',id:live.id,status:live.status,created_at:live.created_at}]
  };
  const assigned=byUpdated.find(r=>isAssigned(r.status));
  if(assigned) return {
    kind:'track_mission',tone:'live',title:'Votre demande est prise en charge',
    text:'Un artisan est assigné à cette demande selon l’état canonique disponible.',
    action:'go-missions',target_id:assigned.id,quote_id:null,
    evidence:[{type:'service_request',id:assigned.id,status:assigned.status,created_at:assigned.created_at}]
  };
  const unread=notifications.find(n=>n.read===false);
  if(unread) return {
    kind:'review_notification',tone:'notice',title:'Une mise à jour FIXEO vous attend',
    text:'Une notification non lue est disponible dans votre espace.',
    action:'go-notifications',target_id:unread.related_entity_id||null,quote_id:null,
    evidence:[{type:'notification',id:unread.id,created_at:unread.created_at}]
  };
  const active=byUpdated.find(r=>isActiveStatus(r.status));
  if(active) return {
    kind:'track_request',tone:'search',title:'Recherche en cours',
    text:'Votre demande est enregistrée. Le prochain état affiché dépendra uniquement des événements réellement enregistrés.',
    action:'go-requests',target_id:active.id,quote_id:null,
    evidence:[{type:'service_request',id:active.id,status:active.status,created_at:active.created_at}]
  };
  return {
    kind:'new_request',tone:'calm',title:'Tout est calme',
    text:'Aucune intervention active ne requiert votre attention.',
    action:'new-request',target_id:null,quote_id:null,evidence:[]
  };
}

function requestPath(uid){
  return 'service_requests?client_profile_id=eq.'+encodeURIComponent(uid)
    +'&select=id,service_category,city,status,urgency,tracking_ref,created_at'
    +'&order=created_at.desc&limit=40';
}
function missionPath(uid){
  return 'missions?client_profile_id=eq.'+encodeURIComponent(uid)
    +'&select=id,request_id,status,agreed_price,created_at'
    +'&order=created_at.desc&limit=40';
}
function notificationPath(uid){
  return 'notifications?recipient_user_id=eq.'+encodeURIComponent(uid)
    +'&select=id,type,title,related_entity_type,related_entity_id,read,created_at'
    +'&order=created_at.desc&limit=40';
}
function quotePath(ids){
  if(!ids.length) return null;
  return 'quotes?request_id=in.('+ids.map(encodeURIComponent).join(',')+')'
    +'&select=id,request_id,status,proposed_price,created_at'
    +'&order=created_at.desc&limit=80';
}

module.exports=async function handler(req,res){
  try{
    if(req.method!=='POST'){res.setHeader('Allow','POST');return send(res,405,{ok:false,error:'METHOD_NOT_ALLOWED'});}
    sameOrigin(req,process.env);
    const body=req.body&&typeof req.body==='object'?req.body:{};
    if(Object.keys(body).length) throw new ClientContextError('NO_PARAMETERS_ALLOWED',400);
    const token=bearer(req),cfg=publicConfig(process.env),user=await authUser(cfg,token);
    const roles=await rest(cfg,token,'users?id=eq.'+encodeURIComponent(user.id)+'&select=role&limit=1');
    if(!roles[0]||lower(roles[0].role)!=='client') throw new ClientContextError('CLIENT_ROLE_REQUIRED',403);

    const [requests,missions,notifications]=await Promise.all([
      rest(cfg,token,requestPath(user.id)),
      rest(cfg,token,missionPath(user.id)),
      rest(cfg,token,notificationPath(user.id))
    ]);
    const qPath=quotePath(requests.map(r=>r.id).filter(Boolean));
    const quotes=qPath?await rest(cfg,token,qPath):[];
    const context={requests,missions,quotes,notifications};
    const decision=decisionFrom(context);
    return send(res,200,{
      ok:true,
      source:'client_context_v1',
      as_of:new Date().toISOString(),
      evidence:{
        requests:requests.length,
        active_requests:requests.filter(r=>isActiveStatus(r.status)).length,
        missions:missions.length,
        quotes:quotes.length,
        pending_quotes:quotes.filter(q=>lower(q.status)==='pending').length,
        unread_notifications:notifications.filter(n=>n.read===false).length
      },
      decision
    });
  }catch(error){
    const status=error instanceof ClientContextError?error.status:502;
    const code=error instanceof ClientContextError?error.code:'CLIENT_CONTEXT_UNAVAILABLE';
    if(!(error instanceof ClientContextError)) console.warn('[Client Context]',error&&error.message);
    return send(res,status,{ok:false,error:code});
  }
};

module.exports._test={decisionFrom,isActiveStatus,isCompletedAwaiting,isInProgress,isAssigned};

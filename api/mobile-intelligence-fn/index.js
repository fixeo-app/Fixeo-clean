'use strict';
const { send } = require('../mobile-rafi-common');
const { createClientTransport } = require('./transport');
const { unsealToken } = require('../estimator-v1/fixeo-estimator-token-v1');
const security = require('./security');
const actions = {
  start: ['entry_context'], answer: ['session_token', 'question_id', 'answer'],
  select_service: ['session_token', 'service_code'], evaluate: ['session_token'],
  verify_pricing_context: ['pricing_context_token'],
  confirm_request: ['pricing_context_token', 'client_phone', 'service_code', 'city_slug', 'confirmed'],
  confirm_quote: ['session_token','client_phone','confirmed'],
};
function createHandler(dependencies = {}) {
  return async function handler(req, res) {
    try {
      if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
      const env = security.staging(dependencies.env || process.env);
      if (req.headers?.origin) security.fail('ORIGIN_REJECTED', 403);
      const auth = await security.client(req, dependencies.fetchImpl);
      const transport = dependencies.transport || createClientTransport({ auth, env, fetchImpl: dependencies.fetchImpl });
      await security.quota(transport);
      const input = req.body;
      if (!input || typeof input !== 'object' || Array.isArray(input) || Buffer.byteLength(JSON.stringify(input)) > 96000) security.fail('INVALID_BODY', 413);
      if (!Object.hasOwn(actions, input.action)) security.fail('INVALID_ACTION');
      if (Object.keys(input).some((key) => key !== 'action' && !actions[input.action].includes(key))) security.fail('INVALID_BODY');
      const body = { ...input };
      if (body.action === 'start') {
        const ctx = body.entry_context;
        if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx) || Object.keys(ctx).some((key) => !['city_slug','description','metier_hint','service_hint','diagnostic_token'].includes(key))) security.fail('INVALID_CONTEXT');
        security.city(ctx.city_slug);
        if (typeof ctx.description !== 'string' || ctx.description.length > 1000) security.fail('INVALID_CONTEXT');
        body.entry_context = { ...ctx, source: 'mobile', known_inputs: {} };
        if (ctx.diagnostic_token) body.entry_context.diagnostic_token = security.unwrap(ctx.diagnostic_token, 'diagnostic', auth.userId, env);
      }
      let clarificationCount=body.session_token?security.qualificationCount(body.session_token,auth.userId,env):0;
      if (body.session_token) body.session_token = security.unwrap(body.session_token, 'session', auth.userId, env);
      if(body.session_token && unsealToken(body.session_token,env.FIXEO_ESTIMATOR_SECRET).state==='SAFETY_STOP')
        security.fail('DIAGNOSTIC_SAFETY_STOP',409);
      if (body.pricing_context_token) body.pricing_context_token = security.unwrap(body.pricing_context_token, 'pricing', auth.userId, env);
      if (['answer','select_service'].includes(body.action)) {
        if (clarificationCount >= 64) security.fail('ESTIMATOR_QUALIFICATION_LIMIT',409);
      }
      const canonical = dependencies.canonical || require('../estimator-v1');
      const trusted = security.trustedRequest(req, auth.token, body, env);
      const bridge=require('../diagnostic/estimator-bridge');
      const diagnosticReference=await bridge.beforeAction(trusted,{setHeader(){}},body,env.FIXEO_ESTIMATOR_SECRET,{env,transport});
      const handlers={env,diagnosticReference,persistOffer:row=>transport.offer(row),confirmRpc:args=>transport.confirm(args),
        dispatch:id=>transport.dispatch(id).catch(()=>({ok:false,reason:'retry_required'}))};
      let result;
      if (body.action === 'confirm_request') {
        if (body.confirmed !== true) security.fail('CLIENT_CONFIRMATION_REQUIRED');
        if (!body.pricing_context_token) security.fail('PRICING_CONTEXT_INVALID');
        const payload = unsealToken(body.pricing_context_token, env.FIXEO_ESTIMATOR_SECRET);
        if (body.service_code !== payload.service_code || body.city_slug !== payload.city_slug) security.fail('PRICING_CONTEXT_INVALID', 409);
        result = await canonical.mobileAction(body,env.FIXEO_ESTIMATOR_SECRET,handlers);
      } else if (body.action === 'confirm_quote') {
        if(body.confirmed!==true || !body.session_token)security.fail('CLIENT_CONFIRMATION_REQUIRED');
        result=await security.invoke((r,res)=>bridge.confirmQuote(r,res,{diagnostic_estimator_token:body.session_token,client_phone:body.client_phone},{env,transport,dispatch:handlers.dispatch}),trusted);
      } else result = await canonical.mobileAction(body,env.FIXEO_ESTIMATOR_SECRET,handlers);
      if(['answer','select_service'].includes(body.action) && result.body?.ok===true)clarificationCount++;
      if(body.action==='start' && result.body?.session?.session_token) {
        const safety=require('../diagnostic/safety').evaluateSafety({description:body.entry_context.description||body.entry_context.free_text||'',answers:{},safety_signals:[]},null,[]);
        if(safety.stop)result=canonical.mobileFallback(result.body.session.session_token,env.FIXEO_ESTIMATOR_SECRET,safety);
      }
      // PB1: follow every canonical branch, including safety questions. The
      // signed count bounds abuse without truncating the native questionnaire.
      if (body.action === 'verify_pricing_context') {
        if (result.body.valid !== true) security.fail('PRICING_CONTEXT_INVALID', 422);
        result.body.ok = true;
      }
      if (result.status >= 400 || result.body.ok !== true) {
        // Only stable codes cross the boundary. No reason, stack or provider/SQL payload.
        const error = String(result.body.error || 'ESTIMATOR_UNAVAILABLE');
        return send(res, result.status, { ok: false, error: /^[A-Za-z_]{3,80}$/.test(error) ? error : 'ESTIMATOR_UNAVAILABLE' });
      }
      const output = result.body;
      if (output.session?.session_token) output.session.session_token = security.wrap(output.session.session_token, 'session', auth.userId, env,clarificationCount);
      if (output.pricing_context_token) output.pricing_context_token = security.wrap(output.pricing_context_token, 'pricing', auth.userId, env);
      delete output.guest_token;
      delete output.dispatch_reason;
      return send(res, result.status, output);
    } catch (error) {
      const code = String(error.code || 'GATEWAY_UNAVAILABLE');
      const safe = /^(AUTH_|ROLE_|ORIGIN_|INVALID_|CITY_|DIAGNOSTIC_|MOBILE_|DEPENDENCY_|ESTIMATOR_|PRICING_CONTEXT_|CLIENT_CONFIRMATION_|GATEWAY_)[A-Z_]+$/.test(code);
      return send(res, safe ? error.status || 503 : 503, { ok: false, error: safe ? code : 'GATEWAY_UNAVAILABLE' });
    }
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;

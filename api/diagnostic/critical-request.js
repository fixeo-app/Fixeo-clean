'use strict';
const crypto = require('node:crypto');
const { hash } = require('./auth');
const { RISK_VERSION } = require('./safety');
const { DiagnosticError } = require('./transport');
const ACK_VERSION = 'fixeo-critical-ack-v1';

async function confirmCritical({ body, data, actor, transport, env }) {
  const s = data.session,
    run = data.run,
    safety = run?.result?.safety;
  if (
    !s ||
    !run ||
    s.revision !== body.revision ||
    run.revision !== s.revision ||
    run.id !== s.selected_run_id ||
    !['ready', 'bound'].includes(s.state) ||
    run.state !== 'complete' ||
    safety?.version !== RISK_VERSION ||
    safety.level !== 'CRITICAL' ||
    safety.stop !== true
  )
    throw new DiagnosticError('DIAGNOSTIC_NOT_QUALIFIED', 409);
  const ack = body.acknowledgement;
  if (
    ack?.accepted !== true ||
    ack.version !== ACK_VERSION ||
    ack.run_id !== run.id
  )
    throw new DiagnosticError('SAFETY_ACKNOWLEDGEMENT_REQUIRED', 409);
  const phone =
    typeof body.client_phone === 'string'
      ? body.client_phone.replace(/[\s().-]+/g, '')
      : '';
  if (!/^(\+212|0)[5-7][0-9]{8}$/.test(phone))
    throw new DiagnosticError('INVALID_PHONE');
  const token = crypto
    .createHmac('sha256', env.FIXEO_ESTIMATOR_SECRET)
    .update('fixeo-diagnostic-critical-guest:' + s.id)
    .digest('hex');
  const tracking =
    'FX-' +
    crypto
      .createHmac('sha256', env.FIXEO_ESTIMATOR_SECRET)
      .update('fixeo-diagnostic-critical-tracking:' + s.id)
      .digest('hex')
      .slice(0, 16)
      .toUpperCase();
  const confirmation = await transport.rpc(
    'create_diagnostic_critical_request_v1',
    {
      p_diagnostic: {
        session_id: s.id,
        revision: s.revision,
        run_id: run.id,
        actor,
        acknowledged: true,
      },
      p_client_phone: phone,
      p_tracking_ref: tracking,
      p_guest_token_hash: hash(token),
      p_ack_version: ACK_VERSION,
    },
  );
  if (!confirmation.ok) throw new DiagnosticError('CONFIRMATION_REJECTED', 409);
  return {
    ...confirmation,
    guest_token: token,
    risk_level: 'CRITICAL',
    urgency: 'now',
  };
}
module.exports = { confirmCritical, ACK_VERSION };

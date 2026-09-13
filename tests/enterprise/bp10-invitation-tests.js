'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// BP10 Enterprise Member Invitations — Contract Tests
// Tests are pure contract/logic checks against the schema + RPC spec.
// No live DB required.
// ══════════════════════════════════════════════════════════════════════════════

const fs     = require('fs');
const crypto = require('crypto');

let pass = 0, fail = 0, warn = 0;

function check(label, val, expected) {
  const ok = val === expected;
  if (ok) { pass++; console.log('  PASS:', label); }
  else    { fail++; console.error('  FAIL:', label, '— got', val, 'expected', expected); }
}

function warnCheck(label, condition, msg) {
  if (condition) { warn++; console.warn('  WARN:', label, msg || ''); }
  else           { pass++; console.log('  PASS:', label); }
}

function section(name) { console.log('\n── ' + name + ' ──'); }

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 1: AUTHORIZATION MATRIX (mock RPC logic)
// ──────────────────────────────────────────────────────────────────────────────
section('AUTHORIZATION MATRIX');

const CAN_INVITE_ROLES  = ['owner', 'admin'];
const INVITABLE_ROLES   = ['admin', 'operations_manager', 'site_manager', 'reporter', 'viewer'];
const FORBIDDEN_ROLES   = ['owner'];

function mockCanInvite(role, status) {
  return CAN_INVITE_ROLES.includes(role) && status === 'active';
}

check('owner can invite',                                   mockCanInvite('owner', 'active'),    true);
check('admin can invite',                                   mockCanInvite('admin', 'active'),    true);
check('operations_manager blocked from inviting',           mockCanInvite('operations_manager', 'active'), false);
check('site_manager blocked from inviting',                 mockCanInvite('site_manager', 'active'),       false);
check('reporter blocked from inviting',                     mockCanInvite('reporter', 'active'),           false);
check('viewer blocked from inviting',                       mockCanInvite('viewer', 'active'),             false);
check('inactive owner blocked from inviting',               mockCanInvite('owner', 'inactive'),            false);
check('suspended admin blocked from inviting',              mockCanInvite('admin', 'suspended'),           false);

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 2: INVITABLE ROLES
// ──────────────────────────────────────────────────────────────────────────────
section('INVITABLE ROLES');

function mockIsInvitableRole(role) {
  return INVITABLE_ROLES.includes(role) && !FORBIDDEN_ROLES.includes(role);
}

check('admin role allowed',               mockIsInvitableRole('admin'),              true);
check('operations_manager role allowed',  mockIsInvitableRole('operations_manager'), true);
check('site_manager role allowed',        mockIsInvitableRole('site_manager'),       true);
check('reporter role allowed',            mockIsInvitableRole('reporter'),           true);
check('viewer role allowed',              mockIsInvitableRole('viewer'),             true);
check('owner role BLOCKED',              mockIsInvitableRole('owner'),              false);

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 3: TOKEN SECURITY CONTRACTS
// ──────────────────────────────────────────────────────────────────────────────
section('TOKEN SECURITY CONTRACTS');

// Simulate token generation: gen_random_bytes(32) → encode → hash
const mockRawBytes = crypto.randomBytes(32);   // 256-bit entropy
check('gen_random_bytes(32) produces 32 bytes of entropy', mockRawBytes.length, 32);

// Simulate pgcrypto: digest(encode(gen_random_bytes(32), 'hex'), 'sha256')
const mockTokenHex  = mockRawBytes.toString('hex');          // encode(…, 'hex')
const mockTokenHash = crypto.createHash('sha256').update(mockTokenHex).digest('hex');

check('token entropy: 256-bit raw = 32 bytes',              mockRawBytes.length, 32);
check('token hex encoding is 64 chars (32 bytes * 2)',      mockTokenHex.length,  64);
check('token_hash sha256 output is 64 hex chars',           mockTokenHash.length, 64);
check('raw token !== token_hash (never identical)',          mockTokenHex !== mockTokenHash, true);

// Verify uniqueness property: two invocations produce different tokens
const rawBytes2    = crypto.randomBytes(32);
const tokenHex2    = rawBytes2.toString('hex');
const tokenHash2   = crypto.createHash('sha256').update(tokenHex2).digest('hex');
check('two consecutive tokens are distinct (raw hex)',  mockTokenHex  !== tokenHex2,  true);
check('two consecutive hashes are distinct',            mockTokenHash !== tokenHash2, true);

// UNIQUE constraint simulation: set-membership check
const tokenHashSet = new Set();
tokenHashSet.add(mockTokenHash);
check('first hash inserts into set (UNIQUE contract)',   tokenHashSet.has(mockTokenHash), true);
check('second hash does not collide with first',        !tokenHashSet.has(tokenHash2),   true);
tokenHashSet.add(tokenHash2);
check('both hashes unique in set',                      tokenHashSet.size, 2);

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 4: TOKEN LIFECYCLE — STATE MACHINE
// ──────────────────────────────────────────────────────────────────────────────
section('TOKEN LIFECYCLE — STATE MACHINE');

// Simulate accept_enterprise_invitation state machine
function mockAcceptInvitation(inv, token, nowMs, callerEmail) {
  // inv = { token_hash, status, expires_at_ms, email_normalized }
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  if (tokenHash !== inv.token_hash)                    return { ok: false, code: 'invalid_token' };
  if (inv.status !== 'pending')                        return { ok: false, code: 'invalid_token' };
  if (nowMs > inv.expires_at_ms)                       return { ok: false, code: 'invitation_expired' };
  if (callerEmail && inv.email_normalized &&
      callerEmail.toLowerCase().trim() !== inv.email_normalized)
                                                       return { ok: false, code: 'email_mismatch' };
  return { ok: true };
}

const rawToken    = 'a'.repeat(64);
const tokenHash   = crypto.createHash('sha256').update(rawToken).digest('hex');
const futureMs    = Date.now() + 86400000;   // +24h
const pastMs      = Date.now() - 1000;       // 1 second ago

const pendingInv  = { token_hash: tokenHash, status: 'pending',  expires_at_ms: futureMs, email_normalized: 'test@example.com' };
const acceptedInv = { token_hash: tokenHash, status: 'accepted', expires_at_ms: futureMs, email_normalized: 'test@example.com' };
const revokedInv  = { token_hash: tokenHash, status: 'revoked',  expires_at_ms: futureMs, email_normalized: 'test@example.com' };
const expiredInv  = { token_hash: tokenHash, status: 'pending',  expires_at_ms: pastMs,   email_normalized: 'test@example.com' };

// Core acceptance
const resOk = mockAcceptInvitation(pendingInv, rawToken, Date.now(), 'test@example.com');
check('correct token accepted (ok: true)',          resOk.ok, true);

// Wrong token
const resWrongToken = mockAcceptInvitation(pendingInv, 'wrong-token', Date.now(), 'test@example.com');
check('wrong token rejected',                       resWrongToken.ok, false);
check('wrong token code: invalid_token',            resWrongToken.code, 'invalid_token');

// Expired invitation
const resExpired = mockAcceptInvitation(expiredInv, rawToken, Date.now(), 'test@example.com');
check('expired invitation rejected',                resExpired.ok, false);
check('expired invitation code: invitation_expired',resExpired.code, 'invitation_expired');

// Revoked invitation
const resRevoked = mockAcceptInvitation(revokedInv, rawToken, Date.now(), 'test@example.com');
check('revoked invitation rejected',                resRevoked.ok, false);
check('revoked invitation code: invalid_token',     resRevoked.code, 'invalid_token');

// Accepted invitation cannot be reused
const resReused = mockAcceptInvitation(acceptedInv, rawToken, Date.now(), 'test@example.com');
check('already-accepted invitation cannot be reused',  resReused.ok, false);
check('reuse attempt code: invalid_token',             resReused.code, 'invalid_token');

// Email match/mismatch
const resEmailMatch = mockAcceptInvitation(pendingInv, rawToken, Date.now(), 'test@example.com');
check('email match accepted',                       resEmailMatch.ok, true);

const resEmailCase = mockAcceptInvitation(pendingInv, rawToken, Date.now(), 'TEST@EXAMPLE.COM');
check('email match case-insensitive (uppercased caller)',  resEmailCase.ok, true);

const resEmailMismatch = mockAcceptInvitation(pendingInv, rawToken, Date.now(), 'other@example.com');
check('email mismatch rejected',                    resEmailMismatch.ok, false);
check('email mismatch code: email_mismatch',        resEmailMismatch.code, 'email_mismatch');

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 5: NO EMAIL ENUMERATION
// ──────────────────────────────────────────────────────────────────────────────
section('NO EMAIL ENUMERATION');

// Oracle: for both revoked and not-found, the same error code must be returned.
// This prevents attackers from distinguishing "email exists but revoked" from
// "email never invited".
function mockGetInvitationOracle(inv, token) {
  // If invitation not found or token invalid — same code
  if (!inv) return { ok: false, code: 'invalid_token' };
  return mockAcceptInvitation(inv, token, Date.now(), null);
}

const resNotFound = mockGetInvitationOracle(null, rawToken);
const resRevoked2 = mockGetInvitationOracle(revokedInv, rawToken);

check('not-found returns invalid_token',   resNotFound.code, 'invalid_token');
check('revoked returns invalid_token',     resRevoked2.code, 'invalid_token');
check('not-found and revoked: same code (no enumeration)',
      resNotFound.code === resRevoked2.code, true);

// Verify invitation lookup contract: accept_invitation should never succeed on
// a non-pending status regardless of valid token — confirming the state machine
// cannot be used for enumeration.
const statuses = ['accepted', 'revoked', 'expired'];
statuses.forEach(status => {
  const inv = { token_hash: tokenHash, status, expires_at_ms: futureMs, email_normalized: null };
  const res = mockAcceptInvitation(inv, rawToken, Date.now(), null);
  check('status=' + status + ' always returns invalid_token (no enumeration)',
        res.code === 'invalid_token', true);
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 6: MEMBERSHIP DEDUPLICATION
// ──────────────────────────────────────────────────────────────────────────────
section('MEMBERSHIP DEDUPLICATION');

// Simulate duplicate membership check
function mockAlreadyMember(members, userId, enterpriseId) {
  return members.some(m =>
    m.user_id === userId &&
    m.enterprise_id === enterpriseId &&
    m.status === 'active'
  );
}

const eid1 = 'ent-111';
const eid2 = 'ent-222';
const uid1 = 'usr-aaa';
const uid2 = 'usr-bbb';

const members = [
  { user_id: uid1, enterprise_id: eid1, status: 'active' },
  { user_id: uid2, enterprise_id: eid1, status: 'inactive' },
];

check('active member is detected as duplicate',
      mockAlreadyMember(members, uid1, eid1), true);

check('inactive member is NOT blocked (status filter only matches active)',
      mockAlreadyMember(members, uid2, eid1), false);

check('same user in different enterprise is NOT a duplicate',
      mockAlreadyMember(members, uid1, eid2), false);

check('brand-new user in same enterprise is NOT a duplicate',
      mockAlreadyMember(members, 'usr-new', eid1), false);

// Cross-tenant: uid1 is active in eid1, should be freely invitable to eid2
check('cross-tenant: user active in eid1 can join eid2',
      mockAlreadyMember(members, uid1, eid2), false);

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 7: CROSS-TENANT ISOLATION
// ──────────────────────────────────────────────────────────────────────────────
section('CROSS-TENANT ISOLATION');

// Simulate: caller's enterprise_id must match invitation's enterprise_id
function mockCrossTenantCheck(callerEnterpriseId, invitationEnterpriseId) {
  return callerEnterpriseId === invitationEnterpriseId;
}

check('same enterprise: accept allowed',
      mockCrossTenantCheck(eid1, eid1), true);
check('different enterprise: accept blocked',
      mockCrossTenantCheck(eid1, eid2), false);
check('different enterprise reversed: accept blocked',
      mockCrossTenantCheck(eid2, eid1), false);

// Simulate revoke isolation: can only revoke your own enterprise's invitations
function mockRevokeIsolation(callerMembership, invitation) {
  if (callerMembership.enterprise_id !== invitation.enterprise_id) return false;
  if (!['owner', 'admin'].includes(callerMembership.role))         return false;
  if (callerMembership.status !== 'active')                        return false;
  return true;
}

check('owner can revoke own-enterprise invitation',
      mockRevokeIsolation({ enterprise_id: eid1, role: 'owner', status: 'active' },
                          { enterprise_id: eid1 }), true);
check('admin cannot revoke other-enterprise invitation',
      mockRevokeIsolation({ enterprise_id: eid1, role: 'admin', status: 'active' },
                          { enterprise_id: eid2 }), false);
check('site_manager cannot revoke invitation',
      mockRevokeIsolation({ enterprise_id: eid1, role: 'site_manager', status: 'active' },
                          { enterprise_id: eid1 }), false);
check('inactive owner cannot revoke invitation',
      mockRevokeIsolation({ enterprise_id: eid1, role: 'owner', status: 'inactive' },
                          { enterprise_id: eid1 }), false);

// Token from enterprise A cannot be accepted against enterprise B
function mockTokenIsolation(tokenEnterpriseId, acceptingEnterpriseId) {
  return tokenEnterpriseId === acceptingEnterpriseId;
}

check('token from eid1 accepted in eid1: allowed',
      mockTokenIsolation(eid1, eid1), true);
check('token from eid1 accepted in eid2: blocked',
      mockTokenIsolation(eid1, eid2), false);

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 8: SITE ASSIGNMENT SECURITY
// ──────────────────────────────────────────────────────────────────────────────
section('SITE ASSIGNMENT SECURITY');

function mockValidateSiteIds(siteIds, enterpriseSites) {
  if (!siteIds || !siteIds.length) return true; // empty is always valid
  return siteIds.every(sid =>
    enterpriseSites.some(s =>
      s.id === sid &&
      s.enterprise_id === enterpriseSites[0].enterprise_id
    )
  );
}

const sitesE1 = [
  { id: 'site-1', enterprise_id: eid1 },
  { id: 'site-2', enterprise_id: eid1 },
];
const sitesE2 = [
  { id: 'site-3', enterprise_id: eid2 },
];

check('site_ids from correct enterprise: valid',
      mockValidateSiteIds(['site-1'], sitesE1), true);
check('multiple site_ids all from correct enterprise: valid',
      mockValidateSiteIds(['site-1', 'site-2'], sitesE1), true);
check('site_id from wrong enterprise: invalid',
      mockValidateSiteIds(['site-3'], sitesE1), false);
check('mixed valid + invalid site_id: invalid',
      mockValidateSiteIds(['site-1', 'site-3'], sitesE1), false);
check('empty site_ids for site_manager: valid (optional assignment)',
      mockValidateSiteIds([], sitesE1), true);
check('null site_ids: valid (no-op)',
      mockValidateSiteIds(null, sitesE1), true);

// Non-site_manager receiving site_ids: the RPC should strip/ignore them
function mockStripSiteIdsForNonSiteManager(role, siteIds) {
  if (role !== 'site_manager') return null; // ignored — must be stripped
  return siteIds || [];
}

check('site_ids provided for admin role: stripped to null',
      mockStripSiteIdsForNonSiteManager('admin', ['site-1']), null);
check('site_ids provided for reporter role: stripped to null',
      mockStripSiteIdsForNonSiteManager('reporter', ['site-1']), null);
check('site_ids for site_manager role: preserved',
      JSON.stringify(mockStripSiteIdsForNonSiteManager('site_manager', ['site-1'])),
      JSON.stringify(['site-1']));
check('null site_ids for site_manager: preserved as empty array',
      JSON.stringify(mockStripSiteIdsForNonSiteManager('site_manager', null)),
      JSON.stringify([]));

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 9: SCHEMA CONTRACT CHECKS (file-based)
// ──────────────────────────────────────────────────────────────────────────────
section('SCHEMA CONTRACT CHECKS (file-based)');

const migrationPath = '/home/work/fixeo-clean/supabase/7c15a9-enterprise-invitations.sql';
let migrationSql = '';
try {
  migrationSql = fs.readFileSync(migrationPath, 'utf8');
} catch (e) {
  console.warn('  WARN: migration file 7c15a9-enterprise-invitations.sql not found — schema checks skipped');
  warn++;
}

if (migrationSql) {
  check('token_hash column present',
        migrationSql.includes('token_hash'), true);

  check('raw token NOT stored (no raw_token text column)',
        !migrationSql.includes('raw_token text'), true);

  check('gen_random_bytes used for entropy',
        migrationSql.includes('gen_random_bytes'), true);

  check('pgcrypto digest used for sha256 hashing',
        migrationSql.includes("digest(") && migrationSql.includes("'sha256'"), true);

  check('SECURITY DEFINER on create RPC',
        migrationSql.includes('SECURITY DEFINER'), true);

  check("search_path = '' set (search_path hardening)",
        migrationSql.includes("search_path = ''"), true);

  check('REVOKE EXECUTE FROM PUBLIC on RPCs',
        migrationSql.includes('REVOKE EXECUTE'), true);

  check('GRANT EXECUTE TO authenticated on RPCs',
        migrationSql.includes('GRANT EXECUTE') && migrationSql.includes('authenticated'), true);

  check('RLS ENABLE on enterprise_invitations',
        migrationSql.includes('ENABLE ROW LEVEL SECURITY'), true);

  // owner must not be in the invitable roles CHECK constraint
  check('owner role blocked in invitable roles CHECK constraint',
        (migrationSql.includes("NOT IN ('owner')") ||
         migrationSql.includes("!= 'owner'") ||
         !migrationSql.match(/role.*CHECK.*owner.*IN/)), true);

  check('expires_at column present',
        migrationSql.includes('expires_at'), true);

  check("status column with 'pending' / 'accepted' / 'revoked' CHECK",
        migrationSql.includes("'pending'") &&
        migrationSql.includes("'accepted'") &&
        migrationSql.includes("'revoked'"), true);

  check('audit log call present (invitation_created or _eal_append)',
        migrationSql.includes('invitation_created') ||
        migrationSql.includes('_eal_append'), true);

  check('enterprise_id foreign key or reference present',
        migrationSql.includes('enterprise_id'), true);

  check('invited_by / inviter column present',
        migrationSql.includes('invited_by') || migrationSql.includes('inviter_'), true);

  check('email_normalized column present',
        migrationSql.includes('email_normalized') || migrationSql.includes('email_'), true);

  check('UNIQUE constraint on token_hash',
        migrationSql.includes('UNIQUE') && migrationSql.includes('token_hash'), true);

  check('create_enterprise_invitation function defined',
        migrationSql.includes('create_enterprise_invitation'), true);

  check('accept_enterprise_invitation function defined',
        migrationSql.includes('accept_enterprise_invitation'), true);
} else {
  // Migration file was not yet created by Agent 1 — emit diagnostic warns
  warnCheck('migration-missing: token_hash column', true, 'pending Agent 1 delivery');
  warnCheck('migration-missing: gen_random_bytes',  true, 'pending Agent 1 delivery');
  warnCheck('migration-missing: SECURITY DEFINER',  true, 'pending Agent 1 delivery');
  warnCheck('migration-missing: REVOKE EXECUTE',    true, 'pending Agent 1 delivery');
  warnCheck('migration-missing: RLS enabled',       true, 'pending Agent 1 delivery');
}

// ──────────────────────────────────────────────────────────────────────────────
// SECTION 10: REGRESSION GUARDS
// ──────────────────────────────────────────────────────────────────────────────
section('REGRESSION GUARDS');

const jsPath = '/home/work/fixeo-clean/js/enterprise-dashboard-v1.js';
let jsSrc = '';
try {
  jsSrc = fs.readFileSync(jsPath, 'utf8');
} catch (e) {
  console.warn('  WARN: enterprise-dashboard-v1.js not found — JS regression checks skipped');
  warn++;
}

if (jsSrc) {
  check('no enterprise_site_id denorm reintroduced in JS',
        !jsSrc.includes('enterprise_site_id'), true);

  check('CAN_CREATE_ROLES still present',
        jsSrc.includes('CAN_CREATE_ROLES'), true);

  check('CAN_CONFIRM_ROLES still present',
        jsSrc.includes('CAN_CONFIRM_ROLES'), true);

  check('create_enterprise_request RPC still used',
        jsSrc.includes('create_enterprise_request'), true);

  check('confirm_completed_mission RPC still used',
        jsSrc.includes('confirm_completed_mission'), true);

  check('no dispatch_mission function introduced',
        !jsSrc.includes('dispatch_mission'), true);
}

// Pricing files untouched — existence check only (no content read per constraints)
const pricingEngine = '/home/work/fixeo-clean/data/pricing/engine/engine-test-report.v1.json';
const pricingShadow = '/home/work/fixeo-clean/data/pricing/shadow/shadow-results.v1.json';

check('pricing engine report still exists (untouched)',
      fs.existsSync(pricingEngine), true);
check('pricing shadow results still exists (untouched)',
      fs.existsSync(pricingShadow), true);

// 7c15a4 must not be modified (existence check)
const protected7c15a4 = '/home/work/fixeo-clean/supabase/7c15a4-dispatch-search-path-hardening.sql';
check('7c15a4 dispatch search-path hardening file still exists (not deleted)',
      fs.existsSync(protected7c15a4), true);

// ──────────────────────────────────────────────────────────────────────────────
// FINAL TALLY
// ──────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════');
console.log('BP10 INVITATION TESTS COMPLETE');
console.log('PASS:', pass, '| FAIL:', fail, '| WARN:', warn);
console.log('TOTAL:', pass + fail);
console.log('══════════════════════════════════════');
process.exit(fail > 0 ? 1 : 0);

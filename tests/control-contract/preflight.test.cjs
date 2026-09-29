'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {baseline} = require('./fixture.cjs');
test('Preflight accepts equivalent explicit/default ACLs but rejects changed grants and owners', async () => {
  const db = await baseline();
  const sql = fs.readFileSync(path.join(__dirname,'../../docs/control-os/bloc1/01-preflight-readonly.sql'),'utf8');
  try {
    await db.exec('GRANT EXECUTE ON FUNCTION fixeo_private._bp15_validate_member_site_assignment() TO PUBLIC;');
    await db.exec(sql);
    await db.exec('REVOKE EXECUTE ON FUNCTION fixeo_private._bp15_validate_member_site_assignment() FROM PUBLIC;');
    await assert.rejects(db.exec(sql), /BASELINE_FUNCTION_DRIFT/);
    await db.exec('ROLLBACK; GRANT EXECUTE ON FUNCTION fixeo_private._bp15_validate_member_site_assignment() TO PUBLIC;');
    await db.exec('ALTER FUNCTION fixeo_private._bp15_validate_member_site_assignment() OWNER TO authenticated;');
    await assert.rejects(db.exec(sql), /BASELINE_FUNCTION_DRIFT/);
    await db.exec('ROLLBACK;');
  } finally { await db.close(); }
});

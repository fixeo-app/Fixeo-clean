// SDK-shaped, in-memory double. Never connects to Supabase or accepts credentials.
const assert = require('node:assert/strict');
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const USER = uuid(1);
const member = (n, role = 'owner', status = 'active', user_id = USER) => ({
  enterprise_id: uuid(100 + n), user_id, role, status
});
const account = (n, status = 'active', name = `Entreprise ${n}`) => ({ id: uuid(100 + n), name, status });

function fixture(options = {}) {
  const state = {
    session: { user: { id: USER, user_metadata: { role: 'admin' } }, access_token: 'fixture-token' },
    verifiedUser: { id: USER },
    users: [{ id: USER, role: 'client' }],
    enterprise_members: [], enterprise_accounts: [],
    ...options
  };
  const calls = [];
  let sessionCalls = 0;
  const client = {
    auth: {
      async getSession() {
        calls.push({ method: 'getSession' });
        sessionCalls++;
        if (state.sessionError) return { data: null, error: { message: 'fixture session error' } };
        return { data: { session: sessionCalls > 1 && 'finalSession' in state ? state.finalSession : state.session }, error: null };
      },
      async getUser(token) {
        calls.push({ method: 'getUser' });
        assert.equal(token, state.session.access_token);
        if (state.verificationError) return { data: null, error: { message: 'fixture invalid token' } };
        return { data: { user: state.verifiedUser }, error: null };
      }
    },
    schema(schema) {
      assert.equal(schema, 'public');
      return { from(table) {
        assert.ok(['users', 'enterprise_members', 'enterprise_accounts'].includes(table), `Forbidden table: ${table}`);
        const call = { table, filters: [], orders: [] };
        calls.push(call);
        const query = {
          select(columns, options) { call.columns = columns; call.options = options; return query; },
          eq(column, value) { call.filters.push({ column, value, kind: 'eq' }); return query; },
          in(column, value) { call.filters.push({ column, value, kind: 'in' }); return query; },
          order(column, options) { call.orders.push({ column, options }); return query; },
          range(from, to) { call.range = [from, to]; return query; },
          maybeSingle() { call.single = true; return query; },
          then(resolve, reject) {
            return Promise.resolve().then(() => {
              if (state.throwTable === table) throw new Error('fixture SDK failure with private details');
              if (state.errorTable === table) return { data: null, error: { message: 'fixture read error' } };
              let data = state[table].filter(row => call.filters.every(f =>
                f.kind === 'eq' ? row[f.column] === f.value : f.value.includes(row[f.column])));
              for (const order of [...call.orders].reverse()) data.sort((a, b) =>
                a[order.column] < b[order.column] ? -1 : a[order.column] > b[order.column] ? 1 : 0);
              const count = data.length;
              if (call.range) data = data.slice(call.range[0], Math.min(call.range[1] + 1, call.range[0] + (state.serverCap || Infinity)));
              const response = { data: call.single ? (data[0] || null) : data, error: null, count };
              return state.transform ? state.transform(table, call, response) : response;
            }).then(resolve, reject);
          }
        };
        return query;
      } };
    }
  };
  return { client, calls, state };
}

module.exports = { fixture, member, account, uuid, USER };

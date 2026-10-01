import { supabase } from './supabase';

export type GlobalRole = 'client' | 'artisan' | 'admin';
export type EnterpriseRole = 'owner' | 'admin' | 'operations_manager' | 'site_manager' | 'reporter' | 'viewer';

export type EnterpriseSpace = {
  type: 'enterprise';
  enterprise_id: string;
  enterprise_name: string;
  member_role: EnterpriseRole;
};

export type WorkspaceResolution = {
  user_id: string;
  global_role: GlobalRole;
  enterprise_spaces: EnterpriseSpace[];
  has_multiple_spaces: boolean;
};

const GLOBAL_ROLES = new Set<GlobalRole>(['client','artisan','admin']);
const ENTERPRISE_ROLES = new Set<EnterpriseRole>(['owner','admin','operations_manager','site_manager','reporter','viewer']);

export async function resolveWorkspaces(): Promise<WorkspaceResolution> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('AUTH_REQUIRED');

  const { data: canonical, error: canonicalError } = await supabase
    .from('users')
    .select('id,role')
    .eq('id', user.id)
    .maybeSingle();
  if (canonicalError || !canonical || canonical.id !== user.id) throw new Error('CANONICAL_USER_UNAVAILABLE');

  const globalRole = String(canonical.role || '') as GlobalRole;
  if (!GLOBAL_ROLES.has(globalRole)) throw new Error('INVALID_GLOBAL_ROLE');

  const { data: memberships, error: membershipError } = await supabase
    .from('enterprise_members')
    .select('enterprise_id,user_id,role,status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('enterprise_id', { ascending: true })
    .limit(200);
  if (membershipError || !Array.isArray(memberships)) throw new Error('ENTERPRISE_MEMBERSHIP_READ_ERROR');

  const seen = new Set<string>();
  const validMemberships = memberships.map((member: any) => {
    const enterpriseId = String(member.enterprise_id || '');
    const role = String(member.role || '') as EnterpriseRole;
    if (member.user_id !== user.id || !enterpriseId || !ENTERPRISE_ROLES.has(role) || seen.has(enterpriseId)) {
      throw new Error('INVALID_ENTERPRISE_MEMBERSHIP');
    }
    seen.add(enterpriseId);
    return { enterpriseId, role };
  });

  if (!validMemberships.length) {
    return { user_id:user.id, global_role:globalRole, enterprise_spaces:[], has_multiple_spaces:false };
  }

  const ids = validMemberships.map(x => x.enterpriseId);
  const { data: accounts, error: accountError } = await supabase
    .from('enterprise_accounts')
    .select('id,name,status')
    .in('id', ids);
  if (accountError || !Array.isArray(accounts)) throw new Error('ENTERPRISE_ACCOUNT_READ_ERROR');

  const byId = new Map(accounts.map((account: any) => [String(account.id), account]));
  const spaces: EnterpriseSpace[] = [];

  for (const membership of validMemberships) {
    const account: any = byId.get(membership.enterpriseId);
    if (!account) throw new Error('ENTERPRISE_ACCOUNT_UNAVAILABLE');
    if (String(account.status || '') !== 'active') continue;
    const name = String(account.name || '').trim();
    if (!name) throw new Error('INVALID_ENTERPRISE_ACCOUNT');
    spaces.push({
      type:'enterprise',
      enterprise_id:membership.enterpriseId,
      enterprise_name:name,
      member_role:membership.role,
    });
  }

  return {
    user_id:user.id,
    global_role:globalRole,
    enterprise_spaces:spaces,
    has_multiple_spaces:spaces.length > 0,
  };
}

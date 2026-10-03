import { supabase } from './supabase';

export type ArtisanAvailability = 'available' | 'unavailable' | 'busy';

export type ArtisanWorkspaceSummary = {
  availability: ArtisanAvailability | null;
  clients: number;
  quotes: number;
  jobs: number;
  ledgerEntries: number;
};

export type ArtisanBusinessClient = {
  id: string;
  full_name: string;
  phone: string | null;
  city: string | null;
  updated_at: string;
};

export type ArtisanBusinessQuote = {
  id: string;
  quote_number: string;
  title: string | null;
  status: string;
  total: number | null;
  updated_at: string;
};

export type ArtisanBusinessJob = {
  id: string;
  title: string;
  status: string;
  scheduled_at: string | null;
  amount: number | null;
  updated_at: string;
};

export type ArtisanLedgerEntry = {
  id: string;
  entry_type: string;
  category: string | null;
  amount: number;
  occurred_on: string;
  note: string | null;
};

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error || new Error('UNAUTHENTICATED');
  return data.user.id;
}

async function countOwned(table: string, ownerUserId: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', ownerUserId);
  if (error) throw error;
  return Number(count || 0);
}

export async function getArtisanWorkspaceSummary(): Promise<ArtisanWorkspaceSummary> {
  const ownerUserId = await currentUserId();

  const [{ data: artisan, error: artisanError }, clients, quotes, jobs, ledgerEntries] =
    await Promise.all([
      supabase
        .from('artisans')
        .select('availability')
        .eq('owner_user_id', ownerUserId)
        .maybeSingle(),
      countOwned('artisan_business_clients', ownerUserId),
      countOwned('artisan_business_quotes', ownerUserId),
      countOwned('artisan_business_jobs', ownerUserId),
      countOwned('artisan_business_ledger', ownerUserId),
    ]);

  if (artisanError) throw artisanError;

  const availability = String(artisan?.availability || '') as ArtisanAvailability;
  return {
    availability: ['available', 'unavailable', 'busy'].includes(availability)
      ? availability
      : null,
    clients,
    quotes,
    jobs,
    ledgerEntries,
  };
}

export async function setArtisanAvailability(
  status: ArtisanAvailability,
): Promise<ArtisanAvailability> {
  const { data, error } = await supabase.rpc('update_artisan_availability', {
    p_status: status,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(String(data?.reason || 'AVAILABILITY_UPDATE_FAILED'));
  return String(data.status) as ArtisanAvailability;
}

export async function listArtisanBusinessClients(limit = 40): Promise<ArtisanBusinessClient[]> {
  const ownerUserId = await currentUserId();
  const { data, error } = await supabase
    .from('artisan_business_clients')
    .select('id,full_name,phone,city,updated_at')
    .eq('owner_user_id', ownerUserId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as ArtisanBusinessClient[];
}

export async function listArtisanBusinessQuotes(limit = 40): Promise<ArtisanBusinessQuote[]> {
  const ownerUserId = await currentUserId();
  const { data, error } = await supabase
    .from('artisan_business_quotes')
    .select('id,quote_number,title,status,total,updated_at')
    .eq('owner_user_id', ownerUserId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((row: any) => ({
    ...row,
    total: row.total == null ? null : Number(row.total),
  })) as ArtisanBusinessQuote[];
}

export async function listArtisanBusinessJobs(limit = 40): Promise<ArtisanBusinessJob[]> {
  const ownerUserId = await currentUserId();
  const { data, error } = await supabase
    .from('artisan_business_jobs')
    .select('id,title,status,scheduled_at,amount,updated_at')
    .eq('owner_user_id', ownerUserId)
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((row: any) => ({
    ...row,
    amount: row.amount == null ? null : Number(row.amount),
  })) as ArtisanBusinessJob[];
}

export async function listArtisanLedger(limit = 60): Promise<ArtisanLedgerEntry[]> {
  const ownerUserId = await currentUserId();
  const { data, error } = await supabase
    .from('artisan_business_ledger')
    .select('id,entry_type,category,amount,occurred_on,note')
    .eq('owner_user_id', ownerUserId)
    .order('occurred_on', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((row: any) => ({
    ...row,
    amount: Number(row.amount || 0),
  })) as ArtisanLedgerEntry[];
}

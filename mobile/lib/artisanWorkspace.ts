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


export async function createArtisanBusinessClient(input: {
  fullName: string;
  phone?: string | null;
  city?: string | null;
}): Promise<ArtisanBusinessClient> {
  const ownerUserId = await currentUserId();
  const fullName = input.fullName.trim();
  if (!fullName) throw new Error('CLIENT_NAME_REQUIRED');

  const { data, error } = await supabase
    .from('artisan_business_clients')
    .insert({
      owner_user_id: ownerUserId,
      full_name: fullName,
      phone: input.phone?.trim() || null,
      city: input.city?.trim() || null,
    })
    .select('id,full_name,phone,city,updated_at')
    .single();
  if (error) throw error;
  return data as ArtisanBusinessClient;
}

export async function createArtisanBusinessQuote(input: {
  title: string;
  total?: number | null;
  description?: string | null;
}): Promise<ArtisanBusinessQuote> {
  const ownerUserId = await currentUserId();
  const title = input.title.trim();
  if (!title) throw new Error('QUOTE_TITLE_REQUIRED');
  const total = Math.max(0, Number(input.total || 0));
  const quoteNumber = `DEV-${Date.now().toString(36).toUpperCase()}`;

  const { data, error } = await supabase
    .from('artisan_business_quotes')
    .insert({
      owner_user_id: ownerUserId,
      quote_number: quoteNumber,
      title,
      description: input.description?.trim() || null,
      subtotal: total,
      total,
      status: 'draft',
    })
    .select('id,quote_number,title,status,total,updated_at')
    .single();
  if (error) throw error;
  return {
    ...data,
    total: data.total == null ? null : Number(data.total),
  } as ArtisanBusinessQuote;
}

export async function createArtisanBusinessJob(input: {
  title: string;
  scheduledAt?: string | null;
  amount?: number | null;
}): Promise<ArtisanBusinessJob> {
  const ownerUserId = await currentUserId();
  const title = input.title.trim();
  if (!title) throw new Error('JOB_TITLE_REQUIRED');

  const { data, error } = await supabase
    .from('artisan_business_jobs')
    .insert({
      owner_user_id: ownerUserId,
      title,
      scheduled_at: input.scheduledAt || null,
      amount: input.amount == null ? null : Math.max(0, Number(input.amount)),
      status: 'planned',
    })
    .select('id,title,status,scheduled_at,amount,updated_at')
    .single();
  if (error) throw error;
  return {
    ...data,
    amount: data.amount == null ? null : Number(data.amount),
  } as ArtisanBusinessJob;
}

export async function createArtisanLedgerEntry(input: {
  entryType: 'income' | 'expense';
  amount: number;
  category?: string | null;
  note?: string | null;
}): Promise<ArtisanLedgerEntry> {
  const ownerUserId = await currentUserId();
  const amount = Math.max(0, Number(input.amount || 0));
  if (!amount) throw new Error('LEDGER_AMOUNT_REQUIRED');

  const { data, error } = await supabase
    .from('artisan_business_ledger')
    .insert({
      owner_user_id: ownerUserId,
      entry_type: input.entryType,
      amount,
      category: input.category?.trim() || 'other',
      note: input.note?.trim() || null,
    })
    .select('id,entry_type,category,amount,occurred_on,note')
    .single();
  if (error) throw error;
  return {
    ...data,
    amount: Number(data.amount || 0),
  } as ArtisanLedgerEntry;
}

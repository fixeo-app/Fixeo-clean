import { supabase } from "./supabase";
import { calculateQuote, type QuoteLine } from "./artisanExperience";
import { getDispatchOffers } from "./magicLoop";
import { getMyCurrentArtisanMission } from "./missionTerrain";

export type BusinessClient = {
  id: string;
  full_name: string;
  phone: string | null;
  city: string | null;
  address: string | null;
  notes: string | null;
  email: string | null;
  updated_at: string;
};
export type BusinessQuote = {
  id: string;
  quote_number: string;
  title: string;
  client_id: string | null;
  source: "personal" | "fixeo";
  status: string;
  total: number;
  subtotal: number;
  discount: number;
  items: QuoteLine[];
  notes: string | null;
  validity_date: string | null;
  estimated_duration: string | null;
  updated_at: string;
};
export type BusinessJob = {
  id: string;
  title: string;
  status: string;
  scheduled_at: string | null;
  amount: number | null;
  client_id: string | null;
  quote_id: string | null;
  source: "personal" | "fixeo";
  notes: string | null;
  updated_at: string;
};
export type LedgerEntry = {
  id: string;
  entry_type: "income" | "expense";
  category: string;
  amount: number;
  occurred_on: string;
  note: string | null;
  client_id: string | null;
  job_id: string | null;
  source: "personal" | "fixeo";
};
export type ArtisanProfile = {
  id: string;
  owner_user_id: string;
  name: string;
  city: string;
  work_zone: string | null;
  description: string;
  phone_public: string;
  service_category: string;
  services: string[];
  availability: string;
  rating: number | null;
  review_count: number | null;
  completed_missions: number | null;
  response_time_min: number | null;
  badge_label: string | null;
  verified: boolean;
  photo_url: string;
};
export type MarketplaceQuote = {
  id: string;
  request_id: string;
  proposed_price: number;
  service_description: string | null;
  supplies_description: string | null;
  estimated_duration: string | null;
  message: string | null;
  status: string;
  review_status: string;
  quote_version: number;
  created_at: string;
};
export type ArtisanMission = {
  mission_id: string;
  request_id: string;
  request_status: string;
  service_category: string | null;
  city: string | null;
  description: string | null;
  agreed_price: number | null;
  accepted_at: string | null;
};
export type ArtisanNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string;
};

type ArtisanActor = {
  user_id: string;
  artisan_id: string | null;
};
let pendingAccess: Promise<ArtisanActor> | null = null;
// Share only concurrent checks. Every later load checks the live session again.
export function artisanAccess(): Promise<ArtisanActor> {
  if (!pendingAccess) {
    pendingAccess = readArtisanAccess().finally(() => {
      pendingAccess = null;
    });
  }
  return pendingAccess;
}
async function readArtisanAccess(): Promise<ArtisanActor> {
  const { data, error } = await supabase.rpc("get_my_mobile_artisan_access_v1");
  if (error) throw error;
  if (!data?.ok) throw new Error(String(data?.reason || "ARTISAN_REQUIRED"));
  return data;
}
async function owned<T>(
  table: string,
  columns: string,
  order: string,
  limit: number,
): Promise<T[]> {
  const actor = await artisanAccess();
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("owner_user_id", actor.user_id)
    .order(order, { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as T[];
}
export const loadBusinessClients = () =>
  owned<BusinessClient>(
    "artisan_business_clients",
    "id,full_name,phone,city,address,notes,email,updated_at",
    "updated_at",
    100,
  );
export const loadBusinessQuotes = () =>
  owned<BusinessQuote>(
    "artisan_business_quotes",
    "id,quote_number,title,client_id,source,status,total,subtotal,discount,items,notes,validity_date,estimated_duration,updated_at",
    "updated_at",
    100,
  );
export const loadBusinessJobs = () =>
  owned<BusinessJob>(
    "artisan_business_jobs",
    "id,title,status,scheduled_at,amount,client_id,quote_id,source,notes,updated_at",
    "updated_at",
    150,
  );
export const loadLedger = () =>
  owned<LedgerEntry>(
    "artisan_business_ledger",
    "id,entry_type,category,amount,occurred_on,note,client_id,job_id,source",
    "occurred_on",
    200,
  );
export async function loadArtisanProfile(): Promise<ArtisanProfile | null> {
  const actor = await artisanAccess();
  const { data, error } = await supabase
    .from("artisans")
    .select(
      "id,owner_user_id,name,city,work_zone,description,phone_public,service_category,services,availability,rating,review_count,completed_missions,response_time_min,badge_label,verified,photo_url",
    )
    .eq("owner_user_id", actor.user_id)
    .maybeSingle();
  if (error) throw error;
  return data;
}
export function artisanProfileCities(profile: ArtisanProfile | null): string[] {
  if (!profile) return [];
  // The canonical activity RPC maintains this public profile projection.
  // Association tables are intentionally not exposed to authenticated clients.
  const cities = (profile.work_zone || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return cities.length ? cities : profile.city ? [profile.city] : [];
}
export async function loadArtisanMissions(): Promise<ArtisanMission[]> {
  const { data, error } = await supabase.rpc(
    "list_my_mobile_artisan_missions_v1",
  );
  if (error) throw error;
  if (!data?.ok) throw new Error("MISSIONS_UNAVAILABLE");
  return data.missions;
}
export async function loadMarketplaceQuotes(): Promise<MarketplaceQuote[]> {
  const actor = await artisanAccess();
  if (!actor.artisan_id) return [];
  const { data, error } = await supabase
    .from("quotes")
    .select(
      "id,request_id,proposed_price,service_description,supplies_description,estimated_duration,message,status,review_status,quote_version,created_at",
    )
    .eq("artisan_profile_id", actor.artisan_id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}
export async function loadArtisanNotifications(): Promise<
  ArtisanNotification[]
> {
  const actor = await artisanAccess();
  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id,type,title,message,read,related_entity_type,related_entity_id,created_at",
    )
    .eq("recipient_user_id", actor.user_id)
    .eq("recipient_role", "artisan")
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) throw error;
  return data || [];
}
export async function markArtisanNotification(id: string) {
  const actor = await artisanAccess();
  const { data, error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", id)
    .eq("recipient_user_id", actor.user_id)
    .select("id")
    .single();
  if (error) throw error;
  return data;
}
export async function saveBusinessClient(
  input: {
    id: string;
    full_name: string;
    phone: string;
    city: string;
    address: string;
    notes: string;
  },
  exists = false,
): Promise<BusinessClient> {
  const actor = await artisanAccess();
  if (!input.full_name.trim()) throw new Error("CLIENT_NAME_REQUIRED");
  const payload = {
    ...input,
    full_name: input.full_name.trim(),
    owner_user_id: actor.user_id,
    updated_at: new Date().toISOString(),
  };
  const q = exists
    ? supabase
        .from("artisan_business_clients")
        .update(payload)
        .eq("id", input.id)
        .eq("owner_user_id", actor.user_id)
    : supabase
        .from("artisan_business_clients")
        .upsert(payload, { onConflict: "id" });
  const { data, error } = await q.select().single();
  if (error) throw error;
  return data;
}
export async function saveBusinessQuote(
  input: {
    id: string;
    title: string;
    client_id: string | null;
    items: Omit<QuoteLine, "total">[];
    discount: number;
    notes: string;
    validity_date: string | null;
    estimated_duration: string;
  },
  exists = false,
): Promise<BusinessQuote> {
  const actor = await artisanAccess();
  if (!input.title.trim()) throw new Error("QUOTE_TITLE_REQUIRED");
  const amounts = calculateQuote(input.items, input.discount);
  const payload = {
    ...input,
    ...amounts,
    title: input.title.trim(),
    owner_user_id: actor.user_id,
    source: "personal",
    updated_at: new Date().toISOString(),
  };
  if (exists) {
    const { data, error } = await supabase
      .from("artisan_business_quotes")
      .update(payload)
      .eq("id", input.id)
      .eq("owner_user_id", actor.user_id)
      .eq("source", "personal")
      .eq("status", "draft")
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  // Stable UUID permits reconciliation after a response timeout; no blind second insert.
  const previous = await supabase
    .from("artisan_business_quotes")
    .select("*")
    .eq("id", input.id)
    .eq("owner_user_id", actor.user_id)
    .maybeSingle();
  if (previous.error) throw previous.error;
  if (previous.data) return previous.data;
  const numbered = await supabase.rpc("artisan_business_next_quote_number");
  if (numbered.error) throw numbered.error;
  const { data, error } = await supabase
    .from("artisan_business_quotes")
    .insert({ ...payload, quote_number: numbered.data, status: "draft" })
    .select()
    .single();
  if (error) throw error;
  return data;
}
export async function recordQuoteDecision(
  id: string,
  decision: "sent" | "accepted" | "rejected",
) {
  const actor = await artisanAccess();
  if (decision === "accepted") {
    const { data, error } = await supabase.rpc(
      "artisan_business_accept_quote",
      { p_quote_id: id },
    );
    if (error) throw error;
    return data;
  }
  const at = new Date().toISOString();
  const patch =
    decision === "sent"
      ? { status: "sent", sent_at: at, sent_via: "artisan_confirmed" }
      : { status: "rejected", client_decision_at: at };
  const { data, error } = await supabase
    .from("artisan_business_quotes")
    .update({ ...patch, updated_at: at })
    .eq("id", id)
    .eq("owner_user_id", actor.user_id)
    .eq("source", "personal")
    .in("status", decision === "sent" ? ["draft", "sent"] : ["sent"])
    .select("id")
    .single();
  if (error) throw error;
  return data;
}
export async function submitMarketplaceQuote(input: {
  requestId: string;
  items: Omit<QuoteLine, "total">[];
  message: string;
  duration: string;
}) {
  await artisanAccess();
  const amounts = calculateQuote(input.items);
  const line = (x: QuoteLine) =>
    `${x.label} · ${x.quantity} × ${x.unit_price} MAD = ${x.total} MAD`;
  const { data, error } = await supabase.rpc("submit_artisan_quote_v2", {
    p_request_id: input.requestId,
    p_proposed_price: amounts.total,
    p_service_description: amounts.items
      .filter((x) => x.type !== "supply")
      .map(line)
      .join("\n"),
    p_supplies_description:
      amounts.items
        .filter((x) => x.type === "supply")
        .map(line)
        .join("\n") || null,
    p_estimated_duration: input.duration || null,
    p_message: input.message || null,
  });
  if (error) throw error;
  return data as MarketplaceQuote;
}
export async function saveBusinessJob(
  input: {
    id: string;
    title: string;
    client_id: string | null;
    scheduled_at: string;
    notes: string;
  },
  exists = false,
): Promise<BusinessJob> {
  const actor = await artisanAccess();
  if (!input.title.trim() || !Number.isFinite(Date.parse(input.scheduled_at)))
    throw new Error("JOB_INVALID");
  const payload = {
    ...input,
    owner_user_id: actor.user_id,
    source: "personal",
    updated_at: new Date().toISOString(),
  };
  const q = exists
    ? supabase
        .from("artisan_business_jobs")
        .update(payload)
        .eq("id", input.id)
        .eq("owner_user_id", actor.user_id)
        .eq("source", "personal")
    : supabase
        .from("artisan_business_jobs")
        .upsert({ ...payload, status: "planned" }, { onConflict: "id" });
  const { data, error } = await q.select().single();
  if (error) throw error;
  return data;
}
export async function saveLedgerEntry(input: {
  id: string;
  entry_type: "income" | "expense";
  amount: number;
  occurred_on: string;
  note: string;
  client_id: string | null;
  job_id: string | null;
}) {
  const actor = await artisanAccess();
  if (
    !Number.isFinite(input.amount) ||
    input.amount <= 0 ||
    input.amount > 500000
  )
    throw new Error("LEDGER_INVALID");
  const { data, error } = await supabase
    .from("artisan_business_ledger")
    .upsert(
      {
        ...input,
        owner_user_id: actor.user_id,
        source: "personal",
        category: "other",
      },
      { onConflict: "id" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}
type ProfileEdit = {
  phone: string;
  services: string[];
  cities: string[];
};
export async function saveArtisanProfile(
  input: ProfileEdit,
  previous?: ProfileEdit,
) {
  await artisanAccess();
  const sameValues = (a: string[], b: string[]) =>
    JSON.stringify([...new Set(a.map((v) => v.trim()))].sort()) ===
    JSON.stringify([...new Set(b.map((v) => v.trim()))].sort());
  for (const [name, args] of [
    ["update_my_artisan_contact_v1", { p_phone: input.phone }],
    [
      "w5_update_my_artisan_activity_v1",
      { p_services: input.services, p_cities: input.cities },
    ],
  ] as const) {
    // The loaded form snapshot only avoids redundant writes; server guards
    // remain authoritative for every change that is actually submitted.
    if (
      previous &&
      (name === "update_my_artisan_contact_v1"
        ? input.phone.trim() === previous.phone.trim()
        : sameValues(input.services, previous.services) &&
          sameValues(input.cities, previous.cities))
    )
      continue;
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw error;
    if (!data?.ok)
      throw new Error(String(data?.reason || "PROFILE_UPDATE_FAILED"));
  }
}
export async function loadArtisanHome() {
  const access = artisanAccess();
  const pending = Promise.allSettled([
    getDispatchOffers(),
    getMyCurrentArtisanMission(),
    loadArtisanProfile(),
    loadBusinessJobs(),
    loadBusinessQuotes(),
    loadLedger(),
  ]);
  await access;
  const results = await pending;
  const value = <T>(i: number): T | null =>
    results[i].status === "fulfilled"
      ? (results[i] as PromiseFulfilledResult<T>).value
      : null;
  return {
    offers: value<Awaited<ReturnType<typeof getDispatchOffers>>>(0),
    mission: value<Awaited<ReturnType<typeof getMyCurrentArtisanMission>>>(1),
    profile: value<ArtisanProfile>(2),
    jobs: value<BusinessJob[]>(3),
    quotes: value<BusinessQuote[]>(4),
    ledger: value<LedgerEntry[]>(5),
    partial: results.some((r) => r.status === "rejected"),
  };
}

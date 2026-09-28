alter table public.artisan_business_quotes
add column if not exists sent_via text,
add column if not exists client_decision_at timestamptz,
add column if not exists client_name_snapshot text,
add column if not exists client_phone_snapshot text;

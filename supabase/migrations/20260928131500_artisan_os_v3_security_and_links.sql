-- Artisan OS V3 — ownership, ACL and business-link hardening.
-- Applied to production before repository materialization on 2026-09-28.
begin;

alter table public.artisan_business_ledger
  add column if not exists client_id uuid
  references public.artisan_business_clients(id) on delete set null;

create index if not exists artisan_business_ledger_client_idx
  on public.artisan_business_ledger(owner_user_id, client_id, occurred_on desc);

create unique index if not exists artisan_business_jobs_quote_unique
  on public.artisan_business_jobs(quote_id)
  where quote_id is not null;

revoke truncate, references, trigger
  on public.artisan_business_clients,
     public.artisan_business_quotes,
     public.artisan_business_jobs,
     public.artisan_business_ledger
  from authenticated;

revoke all
  on public.artisan_business_clients,
     public.artisan_business_quotes,
     public.artisan_business_jobs,
     public.artisan_business_ledger
  from anon;

grant select, insert, update, delete
  on public.artisan_business_clients,
     public.artisan_business_quotes,
     public.artisan_business_jobs,
     public.artisan_business_ledger
  to authenticated;

drop policy if exists artisan_business_clients_owner on public.artisan_business_clients;
create policy artisan_business_clients_select
  on public.artisan_business_clients for select to authenticated
  using (owner_user_id = auth.uid());
create policy artisan_business_clients_insert
  on public.artisan_business_clients for insert to authenticated
  with check (owner_user_id = auth.uid());
create policy artisan_business_clients_update
  on public.artisan_business_clients for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());
create policy artisan_business_clients_delete
  on public.artisan_business_clients for delete to authenticated
  using (owner_user_id = auth.uid());

drop policy if exists artisan_business_quotes_owner on public.artisan_business_quotes;
create policy artisan_business_quotes_select
  on public.artisan_business_quotes for select to authenticated
  using (owner_user_id = auth.uid());
create policy artisan_business_quotes_insert_personal
  on public.artisan_business_quotes for insert to authenticated
  with check (owner_user_id = auth.uid() and source = 'personal');
create policy artisan_business_quotes_update_personal
  on public.artisan_business_quotes for update to authenticated
  using (owner_user_id = auth.uid() and source = 'personal')
  with check (owner_user_id = auth.uid() and source = 'personal');
create policy artisan_business_quotes_delete_personal
  on public.artisan_business_quotes for delete to authenticated
  using (owner_user_id = auth.uid() and source = 'personal');

drop policy if exists artisan_business_jobs_owner on public.artisan_business_jobs;
create policy artisan_business_jobs_select
  on public.artisan_business_jobs for select to authenticated
  using (owner_user_id = auth.uid());
create policy artisan_business_jobs_insert_personal
  on public.artisan_business_jobs for insert to authenticated
  with check (owner_user_id = auth.uid() and source = 'personal');
create policy artisan_business_jobs_update_personal
  on public.artisan_business_jobs for update to authenticated
  using (owner_user_id = auth.uid() and source = 'personal')
  with check (owner_user_id = auth.uid() and source = 'personal');
create policy artisan_business_jobs_delete_personal
  on public.artisan_business_jobs for delete to authenticated
  using (owner_user_id = auth.uid() and source = 'personal');

drop policy if exists artisan_business_ledger_owner on public.artisan_business_ledger;
create policy artisan_business_ledger_select
  on public.artisan_business_ledger for select to authenticated
  using (owner_user_id = auth.uid());
create policy artisan_business_ledger_insert_personal
  on public.artisan_business_ledger for insert to authenticated
  with check (owner_user_id = auth.uid() and source = 'personal');
create policy artisan_business_ledger_update_personal
  on public.artisan_business_ledger for update to authenticated
  using (owner_user_id = auth.uid() and source = 'personal')
  with check (owner_user_id = auth.uid() and source = 'personal');
create policy artisan_business_ledger_delete_personal
  on public.artisan_business_ledger for delete to authenticated
  using (owner_user_id = auth.uid() and source = 'personal');

create or replace function public.artisan_business_validate_links()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.client_id is not null
     and not exists (
       select 1 from public.artisan_business_clients c
       where c.id = new.client_id and c.owner_user_id = new.owner_user_id
     )
  then
    raise exception 'BUSINESS_CLIENT_NOT_OWNED';
  end if;

  if tg_table_name in ('artisan_business_jobs','artisan_business_ledger') then
    if new.quote_id is not null
       and not exists (
         select 1 from public.artisan_business_quotes q
         where q.id = new.quote_id and q.owner_user_id = new.owner_user_id
       )
    then
      raise exception 'BUSINESS_QUOTE_NOT_OWNED';
    end if;
  end if;

  if tg_table_name = 'artisan_business_ledger' then
    if new.job_id is not null
       and not exists (
         select 1 from public.artisan_business_jobs j
         where j.id = new.job_id and j.owner_user_id = new.owner_user_id
       )
    then
      raise exception 'BUSINESS_JOB_NOT_OWNED';
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists artisan_business_quotes_link_guard on public.artisan_business_quotes;
create trigger artisan_business_quotes_link_guard
before insert or update of owner_user_id, client_id
on public.artisan_business_quotes
for each row execute function public.artisan_business_validate_links();

drop trigger if exists artisan_business_jobs_link_guard on public.artisan_business_jobs;
create trigger artisan_business_jobs_link_guard
before insert or update of owner_user_id, client_id, quote_id
on public.artisan_business_jobs
for each row execute function public.artisan_business_validate_links();

drop trigger if exists artisan_business_ledger_link_guard on public.artisan_business_ledger;
create trigger artisan_business_ledger_link_guard
before insert or update of owner_user_id, client_id, job_id, quote_id
on public.artisan_business_ledger
for each row execute function public.artisan_business_validate_links();

revoke all on function public.artisan_business_validate_links() from public, anon;
grant execute on function public.artisan_business_validate_links() to authenticated, service_role;

create or replace function public.artisan_business_next_quote_number()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_n integer;
  v_year text := to_char(current_date,'YYYY');
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  select coalesce(max(nullif(substring(quote_number from '([0-9]+)$'),'')::integer), 0) + 1
    into v_n
  from public.artisan_business_quotes
  where owner_user_id = v_uid
    and quote_number like ('DEV-' || v_year || '-%');

  return 'DEV-' || v_year || '-' || lpad(v_n::text, 4, '0');
end
$$;

revoke all on function public.artisan_business_next_quote_number() from public, anon;
grant execute on function public.artisan_business_next_quote_number() to authenticated, service_role;

create or replace function public.artisan_business_accept_quote(p_quote_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_q public.artisan_business_quotes%rowtype;
  v_job uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select *
    into v_q
  from public.artisan_business_quotes
  where id = p_quote_id
    and owner_user_id = v_uid
    and source = 'personal'
  for update;

  if not found then raise exception 'QUOTE_NOT_FOUND'; end if;

  select id into v_job
  from public.artisan_business_jobs
  where quote_id = p_quote_id
    and owner_user_id = v_uid
  limit 1;

  if v_job is not null then
    return v_job;
  end if;

  if v_q.status in ('rejected','expired','cancelled') then
    raise exception 'QUOTE_NOT_ACCEPTABLE';
  end if;

  update public.artisan_business_quotes
  set status = 'accepted',
      accepted_at = coalesce(accepted_at, now()),
      client_decision_at = coalesce(client_decision_at, now()),
      updated_at = now()
  where id = p_quote_id;

  insert into public.artisan_business_jobs(
    owner_user_id, client_id, quote_id, source, title, status, amount, notes
  )
  values(
    v_uid, v_q.client_id, v_q.id, 'personal', v_q.title, 'planned', v_q.total, v_q.description
  )
  returning id into v_job;

  return v_job;
end
$$;

revoke all on function public.artisan_business_accept_quote(uuid) from public, anon;
grant execute on function public.artisan_business_accept_quote(uuid) to authenticated, service_role;

commit;

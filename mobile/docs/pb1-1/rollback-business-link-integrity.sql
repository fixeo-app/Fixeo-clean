BEGIN;
-- STAGING ONLY. Restores the previous validation function. No data deletion.
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


COMMIT;

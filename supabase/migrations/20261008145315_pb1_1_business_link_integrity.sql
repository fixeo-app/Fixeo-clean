-- PB1.1 authorized target: kqyhusnbybsukbcaoqtu STAGING only.
-- Existing triggers, RLS, grants and canonical actor are preserved.
BEGIN;
DO $$ BEGIN
 IF md5(pg_get_functiondef('public.artisan_business_validate_links()'::regprocedure)) <> '3accebd57a0c6c0da07752b3f5f5b449'
 THEN RAISE EXCEPTION 'PB11_FUNCTION_DRIFT'; END IF;
END $$;
CREATE OR REPLACE FUNCTION public.artisan_business_validate_links()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE linked_quote public.artisan_business_quotes; linked_job public.artisan_business_jobs;
BEGIN
 IF new.client_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM public.artisan_business_clients c WHERE c.id=new.client_id AND c.owner_user_id=new.owner_user_id
 ) THEN RAISE EXCEPTION 'BUSINESS_CLIENT_NOT_OWNED'; END IF;
 IF tg_table_name IN ('artisan_business_jobs','artisan_business_ledger') THEN
 IF new.quote_id IS NOT NULL THEN
  SELECT * INTO linked_quote FROM public.artisan_business_quotes q
    WHERE q.id=new.quote_id AND q.owner_user_id=new.owner_user_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUSINESS_QUOTE_NOT_OWNED'; END IF;
  IF new.client_id IS DISTINCT FROM linked_quote.client_id OR new.source<>linked_quote.source
    THEN RAISE EXCEPTION 'BUSINESS_QUOTE_CLIENT_MISMATCH'; END IF;
 END IF;
 END IF;
 IF tg_table_name='artisan_business_ledger' THEN
 IF new.job_id IS NOT NULL THEN
  SELECT * INTO linked_job FROM public.artisan_business_jobs j
    WHERE j.id=new.job_id AND j.owner_user_id=new.owner_user_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BUSINESS_JOB_NOT_OWNED'; END IF;
  IF new.client_id IS DISTINCT FROM linked_job.client_id OR new.source<>linked_job.source
    THEN RAISE EXCEPTION 'LEDGER_CLIENT_MISMATCH'; END IF;
  IF new.quote_id IS NOT NULL AND new.quote_id IS DISTINCT FROM linked_job.quote_id
    THEN RAISE EXCEPTION 'LEDGER_QUOTE_MISMATCH'; END IF;
 END IF;
 END IF;
 -- Prevent a later edit from detaching existing child associations.
 IF tg_op='UPDATE' AND tg_table_name='artisan_business_jobs' THEN
  IF EXISTS (SELECT 1 FROM public.artisan_business_ledger l WHERE l.job_id=new.id
   AND (l.owner_user_id<>new.owner_user_id OR l.client_id IS DISTINCT FROM new.client_id OR l.source<>new.source
     OR (l.quote_id IS NOT NULL AND l.quote_id IS DISTINCT FROM new.quote_id)))
   THEN RAISE EXCEPTION 'JOB_LINKS_ALREADY_RECORDED'; END IF;
 END IF;
 IF tg_op='UPDATE' AND tg_table_name='artisan_business_quotes' THEN
  IF EXISTS (SELECT 1 FROM public.artisan_business_jobs j WHERE j.quote_id=new.id
    AND (j.owner_user_id<>new.owner_user_id OR j.client_id IS DISTINCT FROM new.client_id OR j.source<>new.source))
   OR EXISTS (SELECT 1 FROM public.artisan_business_ledger l WHERE l.quote_id=new.id
    AND (l.owner_user_id<>new.owner_user_id OR l.client_id IS DISTINCT FROM new.client_id OR l.source<>new.source))
   THEN RAISE EXCEPTION 'QUOTE_LINKS_ALREADY_RECORDED'; END IF;
 END IF;
 RETURN new;
END $$;
-- Source participates in the association contract as well.
DROP TRIGGER artisan_business_jobs_link_guard ON public.artisan_business_jobs;
CREATE TRIGGER artisan_business_jobs_link_guard BEFORE INSERT OR UPDATE OF owner_user_id,client_id,quote_id,source ON public.artisan_business_jobs FOR EACH ROW EXECUTE FUNCTION public.artisan_business_validate_links();
DROP TRIGGER artisan_business_ledger_link_guard ON public.artisan_business_ledger;
CREATE TRIGGER artisan_business_ledger_link_guard BEFORE INSERT OR UPDATE OF owner_user_id,client_id,job_id,quote_id,source ON public.artisan_business_ledger FOR EACH ROW EXECUTE FUNCTION public.artisan_business_validate_links();
DROP TRIGGER artisan_business_quotes_link_guard ON public.artisan_business_quotes;
CREATE TRIGGER artisan_business_quotes_link_guard BEFORE INSERT OR UPDATE OF owner_user_id,client_id,source ON public.artisan_business_quotes FOR EACH ROW EXECUTE FUNCTION public.artisan_business_validate_links();
COMMIT;

# S1-A exact BEFORE / AFTER

Source: Production catalogue captures immediately before and after the authorized application.

## Grants

```sql
-- BEFORE
GRANT INSERT ON TABLE public.service_requests TO anon;
-- No explicit anon column INSERT grants.
-- AFTER
REVOKE INSERT ON TABLE public.service_requests FROM anon;
GRANT INSERT (service_category, city, description, status) ON TABLE public.service_requests TO anon;
```

## anon_insert

BEFORE

```sql
CREATE POLICY "anon_insert" ON public.service_requests AS PERMISSIVE FOR INSERT TO "anon" WITH CHECK (true);
```

AFTER

```sql
-- ABSENT
```

## anon_service_requests_insert

BEFORE

```sql
CREATE POLICY "anon_service_requests_insert" ON public.service_requests AS PERMISSIVE FOR INSERT TO "anon" WITH CHECK (true);
```

AFTER

```sql
CREATE POLICY "anon_service_requests_insert" ON public.service_requests AS PERMISSIVE FOR INSERT TO "anon" WITH CHECK (((status = 'new'::text) AND (client_profile_id IS NULL)));
```

## artisan_assign_new_requests

BEFORE

```sql
CREATE POLICY "artisan_assign_new_requests" ON public.service_requests AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((status = 'new'::text)) WITH CHECK ((status = 'assigned'::text));
```

AFTER

```sql
-- ABSENT
```

## artisan_update_assigned_requests

BEFORE

```sql
CREATE POLICY "artisan_update_assigned_requests" ON public.service_requests AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (missions m
     JOIN artisans a ON (((m.artisan_profile_id)::text = (a.id)::text)))
  WHERE ((m.request_id = (service_requests.id)::text) AND (((a.owner_user_id)::text = (auth.uid())::text) OR (a.phone_public = ( SELECT p.phone
           FROM profiles p
          WHERE ((p.id)::text = (auth.uid())::text)
         LIMIT 1))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (missions m
     JOIN artisans a ON (((m.artisan_profile_id)::text = (a.id)::text)))
  WHERE ((m.request_id = (service_requests.id)::text) AND (((a.owner_user_id)::text = (auth.uid())::text) OR (a.phone_public = ( SELECT p.phone
           FROM profiles p
          WHERE ((p.id)::text = (auth.uid())::text)
         LIMIT 1)))))));
```

AFTER

```sql
CREATE POLICY "artisan_update_assigned_requests" ON public.service_requests AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (missions m
     JOIN artisans a ON (((m.artisan_profile_id)::text = (a.id)::text)))
  WHERE ((m.request_id = (service_requests.id)::text) AND ((a.owner_user_id)::text = (auth.uid())::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (missions m
     JOIN artisans a ON (((m.artisan_profile_id)::text = (a.id)::text)))
  WHERE ((m.request_id = (service_requests.id)::text) AND ((a.owner_user_id)::text = (auth.uid())::text)))));
```

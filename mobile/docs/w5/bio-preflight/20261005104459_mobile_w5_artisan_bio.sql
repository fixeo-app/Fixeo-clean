-- W5 Bio candidate: staging kqyhusnbybsukbcaoqtu only.
-- Not applied: preflight detected the existing automatic updated_at side effect.
CREATE FUNCTION public.w5_update_my_artisan_bio_v1(p_description text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $w5_bio$
DECLARE
  v_uid uuid := fixeo_private.w5_artisan_actor_v1();
  v_artisan_id uuid;
  v_description text := trim(coalesce(p_description, ''));
BEGIN
  IF length(v_description) > 4000 THEN
    RAISE EXCEPTION 'BIO_TOO_LONG' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_artisan_id
  FROM public.artisans
  WHERE owner_user_id = v_uid
  ORDER BY updated_at DESC NULLS LAST, id
  LIMIT 1 FOR UPDATE;
  IF v_artisan_id IS NULL THEN
    RAISE EXCEPTION 'ARTISAN_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  UPDATE public.artisans
  SET description = v_description
  WHERE id = v_artisan_id AND owner_user_id = auth.uid();
  RETURN jsonb_build_object('ok', true, 'artisan_id', v_artisan_id);
END;
$w5_bio$;
REVOKE ALL ON FUNCTION public.w5_update_my_artisan_bio_v1(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.w5_update_my_artisan_bio_v1(text) TO authenticated;

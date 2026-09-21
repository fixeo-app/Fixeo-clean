CREATE OR REPLACE FUNCTION public.normalize_service_category_v1(p_category text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_category IS NULL OR btrim(p_category) = '' THEN NULL

    -- PLOMBERIE
    WHEN lower(btrim(p_category)) = 'plomberie'
      OR lower(p_category) LIKE '%débouchage%'
      OR lower(p_category) LIKE '%debouchage%'
      OR lower(p_category) LIKE '%fuite d''eau%'
      OR lower(p_category) LIKE '%installation sanitaire%'
    THEN 'plomberie'

    -- SERRURERIE
    WHEN lower(btrim(p_category)) = 'serrurerie'
      OR lower(p_category) LIKE '%ouverture de porte%'
    THEN 'serrurerie'

    -- ELECTRICITE
    WHEN lower(btrim(p_category)) IN (
      'électricité',
      'electricité',
      'électricite',
      'electricite'
    )
    THEN 'électricité'

    -- MACONNERIE
    WHEN lower(btrim(p_category)) IN (
      'maçonnerie',
      'maconnerie'
    )
    THEN 'maçonnerie'

    -- NETTOYAGE
    WHEN lower(btrim(p_category)) IN (
      'nettoyage',
      'désinfection',
      'desinfection'
    )
    THEN 'nettoyage'

    -- AUTRES CATEGORIES CANONIQUES
    WHEN lower(btrim(p_category)) IN (
      'climatisation',
      'menuiserie',
      'peinture',
      'carrelage',
      'jardinage',
      'bricolage',
      'demenagement',
      'déménagement'
    )
    THEN CASE
      WHEN lower(btrim(p_category)) = 'déménagement'
        THEN 'demenagement'
      ELSE lower(btrim(p_category))
    END

    -- volontairement non classés
    WHEN lower(btrim(p_category)) IN (
      'autre',
      'service à préciser',
      'service a préciser',
      'service à preciser',
      'service a preciser'
    )
    THEN NULL

    ELSE NULL
  END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_service_category_v1(p_category text, p_description text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(
    -- Priorité 1 : catégorie existante
    public.normalize_service_category_v1(p_category),

    -- Priorité 2 : comprendre la description
    CASE
      WHEN p_description IS NULL
        OR btrim(p_description) = ''
      THEN NULL

      -- PLOMBERIE
      WHEN lower(p_description) LIKE '%débouchage%'
        OR lower(p_description) LIKE '%debouchage%'
        OR lower(p_description) LIKE '%fuite d''eau%'
        OR lower(p_description) LIKE '%installation sanitaire%'
      THEN 'plomberie'

      -- CHAUFFAGE
      WHEN lower(p_description) LIKE '%chauffe-eau%'
        OR lower(p_description) LIKE '%chauffe eau%'
      THEN 'chauffage'

      -- SERRURERIE
      WHEN lower(p_description) LIKE '%ouverture de porte%'
        OR lower(p_description) LIKE '%serrure%'
      THEN 'serrurerie'

      ELSE NULL
    END
  );
$function$;

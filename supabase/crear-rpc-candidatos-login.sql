-- ============================================================================
-- PROMPT Z-bis (2026-10-25) — RPC de CANDIDATOS DEL LOGIN
-- Proyecto: mi-web-escolar (AulaNube / CETAC)
-- Ejecutar en: Supabase SQL Editor (función nueva, ADITIVA; no toca tablas)
--
-- OBJETIVO: el login hacía 4 peticiones en serie (PROFESORES, ALUMNOS, tutores
-- por usuario y por clave, y las credenciales iniciales del tutor). En una
-- ráfaga de 500 personas entrando en 10 s era justo el paso donde se caía el
-- sistema (INFORME-PROMPT-Z §3d). Con esta función son 1.
--
-- REGLA: la función NO decide quién entra. Devuelve los CANDIDATOS con las
-- mismas consultas que hacía la app, y la app los compara como siempre
-- (`validarAccesoPortal`: nombres normalizados, clave, scrypt). Si la función no
-- existe, la app hace las consultas de antes.
--
-- Mismas reglas que cada consulta a la que sustituye:
--   profesores  PROFESORES entero, las columnas de SELECT_PROFESOR
--   alumnos     ALUMNOS filtrado por p_patron (el ILIKE superconjunto de
--               patronFiltroNombre) en NOMBRE, P_APELLIDO o S_APELLIDO; sin
--               patrón, la tabla entera
--   tutor_usuario  el primero con `usuario ILIKE p_identificador` (recortado), con
--               \ % _ escapados como en buscarTutorPorUsuario y `*` como comodín
--               (PostgREST lo traduce a %)
--   tutor_clave    el tutor con `clave_tutor = upper(trim(p_identificador))` SOLO
--               si hay exactamente uno (maybeSingle: con 2 o más, ninguno)
--   hashes_iniciales  password_hash de tutor_credenciales_iniciales del tutor
--               elegido (usuario, y si no hay, clave)
--
-- SEGURIDAD: devuelve CLAVE y password_hash, como las consultas de hoy, al
-- SERVIDOR. SECURITY DEFINER + search_path fijo; EXECUTE SOLO a service_role.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.candidatos_login(p_identificador text, p_patron text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text := btrim(coalesce(p_identificador, ''));
  v_patron_usuario text;
  v_tutor_usuario jsonb;
  v_tutor_clave jsonb;
  v_tutor_id uuid;
BEGIN
  IF v_id = '' THEN
    RETURN jsonb_build_object('candidatos_v', 1, 'profesores', '[]'::jsonb, 'alumnos', '[]'::jsonb,
      'tutor_usuario', NULL, 'tutor_clave', NULL, 'hashes_iniciales', '[]'::jsonb);
  END IF;

  -- buscarTutorPorUsuario: escapa \ % _ y PostgREST convierte * en %.
  v_patron_usuario := replace(replace(replace(replace(v_id, '\', '\\'), '%', '\%'), '_', '\_'), '*', '%');

  SELECT to_jsonb(r) INTO v_tutor_usuario FROM (
    SELECT id, clave_tutor, nombre, apellidos, curp, telefono, correo, usuario, password_hash,
           debe_cambiar_credenciales, activo, created_at, updated_at
    FROM tutores WHERE usuario ILIKE v_patron_usuario LIMIT 1
  ) r;

  IF v_tutor_usuario IS NULL THEN
    SELECT to_jsonb(r) INTO v_tutor_clave FROM (
      SELECT id, clave_tutor, nombre, apellidos, curp, telefono, correo, usuario, password_hash,
             debe_cambiar_credenciales, activo, created_at, updated_at
      FROM tutores WHERE clave_tutor = upper(v_id)
    ) r
    WHERE (SELECT count(*) FROM tutores WHERE clave_tutor = upper(v_id)) = 1;
  END IF;

  v_tutor_id := coalesce(v_tutor_usuario->>'id', v_tutor_clave->>'id')::uuid;

  RETURN jsonb_build_object(
    'candidatos_v', 1,
    'profesores', (
      SELECT coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM (
        SELECT "ID", "NOMBRE/PROFESOR/DIRECTIVO", "CLAVE", "Permisos", debe_cambiar_credenciales
        FROM "PROFESORES"
      ) p
    ),
    'alumnos', (
      SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM (
        SELECT "CURP", "P_APELLIDO", "S_APELLIDO", "NOMBRE", "CLAVE"
        FROM "ALUMNOS"
        WHERE p_patron IS NULL
           OR "NOMBRE" ILIKE p_patron OR "P_APELLIDO" ILIKE p_patron OR "S_APELLIDO" ILIKE p_patron
      ) a
    ),
    'tutor_usuario', v_tutor_usuario,
    'tutor_clave', v_tutor_clave,
    'hashes_iniciales', (
      SELECT coalesce(jsonb_agg(c.password_hash), '[]'::jsonb)
      FROM tutor_credenciales_iniciales c WHERE v_tutor_id IS NOT NULL AND c.tutor_id = v_tutor_id
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.candidatos_login(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.candidatos_login(text, text) TO service_role;

-- Comprobación (SQL Editor): debe devolver candidatos_v = 1 y profesores > 0.
-- SELECT (candidatos_login('zz-nadie', NULL))->>'candidatos_v',
--        jsonb_array_length(candidatos_login('zz-nadie', NULL)->'profesores');

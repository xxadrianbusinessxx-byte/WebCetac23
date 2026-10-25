# RUMBO — en medio de qué estamos

**Generado por `node scripts/gen-rumbo.mjs`; la cabecera va a mano.**

- **Campaña:** cerrar las UIs pendientes del Océano.
- **Se da por terminada cuando:** las seis pantallas operan, CI verde.

## Fuera de alcance ahora

- Operación de persona: asignaciones y claves.
- `docs/sistema/MATRIZ-UX.md`: pendiente abierto.
- Legacy y fallbacks (R8): no se retiran.

<!-- GENERADO: no editar a mano, lo reescribe scripts/gen-rumbo.mjs -->
Contexto, no alcance: nada de esto entra en tu tarea si el prompt no lo nombra.
- **Rama y HEAD:** main · bff5809

## Qué cerró (últimos 10 commits)

- bff5809 · RLS: el servidor usa service_role y queda listo el SQL que cierra la cla…
- 1a25364 · PROMPT Z-bis: la ráfaga del login se degrada en vez de derrumbarse
- 544857e · PROMPT Z: capacidad gradual hasta 800 usuarios simultáneos sin cambiar d…
- b9038cf · Docs y pendientes de la FASE 11 y el PROMPT Y
- 4f38f54 · PROMPT Y: menos viajes por sesión para acercarse a 500 usuarios sin camb…
- 03b1060 · FASE 11: re-medición de rendimiento con las Server Actions reales
- ebba3c1 · Prompt X: SQL de boletas_activacion aplicado y verificado
- 40cb7f5 · Prompt X: prompt archivado con su retroalimentación, informe y pendiente…
- e899f3a · Prompt X, Parte B: boleta generada en el navegador, activada por parcial
- e56482e · Prompt X, Parte A: boletas_activacion, RPC activar_boleta y capacidad bo…

## Lo que más pesa hoy

- sql-agenda-citas — Agenda de citas: el directivo no ha publicado ningún horario (SQL ya aplicado) · `node scripts/diag-agenda-citas.mjs` · persona
- traspaso-sin-estrenar — asignaciones_profesor sigue con 0 filas · `node scripts/diag-asignaciones-profesor.mjs` · persona
- claves-compartidas-profesores — 15 de 22 profesores comparten contraseña · `node scripts/diag-credenciales-duplicadas.mjs` · persona
- rotar-password-supabase — Rotar la contraseña de Supabase · sin comando de verificación · persona
- rls-tablas-publicas — 401 tablas públicas sin RLS y políticas ALL true: con la clave anon se lee y modifica casi todo · `consulta final de supabase/crear-rls-cerrar-anon.sql (0 · 0 · 0 · 1) · node scripts/diag-rls-anon.mjs (anon ve 0) · get_advisors security sin rls_disabled_in_public · node scripts/fase11-perfil.mjs --sujetos=3 --runs=3` · persona
- tabla-calificaciones-inexistente — archivos_calificaciones: una action viva apunta a una tabla que no esta en public · `node scripts/check-supabase-public.mjs` · persona
- C10 (todo scripts/*.mjs tiene fila en scripts/README.md) = 19
- C11 (ningún componente de app/ se define a mano en más de un archivo) = 21
- C20 (ningún supabase/*.sql nuevo crea una política `true` ni da GRANT a anon) = 27
<!-- FIN GENERADO -->

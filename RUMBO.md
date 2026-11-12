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
- **Rama y HEAD:** main · 100f675

## Qué cerró (últimos 10 commits)

- 100f675 · Prompt e informe: PROMPT_AC / INFORME-PROMPT-AC.
- 8bab6d2 · Alumno de prueba fuera de las listas del personal y cuenta DIRECTIVO
- 1164a80 · test-auditoria-ciclo-f1 sigue al lector del ciclo de /oceano a /perfil
- 0b8066e · CLAUDE.md importa AGENTS.md para que Claude Code cargue las reglas al in…
- 67d4428 · Prompt e informe: PROMPT_AB / INFORME-PROMPT-AB.
- d2e5193 · Administración ve a los alumnos pendientes de grupo
- 4867d46 · El importador de horario prefiere el nombre exacto de la materia
- a15659c · El login mandaba a la portada a cualquier rol que no estuviera nombrado
- 5dad222 · Cuenta del rol Servicio Escolar creada (PROFESORES ID 23)
- 0171d9e · Rol Servicio Escolar (solo lectura) y el portal pasa de /oceano a /perfi…

## Lo que más pesa hoy

- sql-agenda-citas — Agenda de citas: el directivo no ha publicado ningún horario (SQL ya aplicado) · `node scripts/diag-agenda-citas.mjs` · persona
- traspaso-sin-estrenar — asignaciones_profesor sigue con 0 filas · `node scripts/diag-asignaciones-profesor.mjs` · persona
- claves-compartidas-profesores — 15 de 22 profesores comparten contraseña · `node scripts/diag-credenciales-duplicadas.mjs` · persona
- rotar-password-supabase — Rotar la contraseña de Supabase · sin comando de verificación · persona
- tabla-calificaciones-inexistente — archivos_calificaciones: una action viva apunta a una tabla que no esta en public · `node scripts/check-supabase-public.mjs` · persona
- C10 (todo scripts/*.mjs tiene fila en scripts/README.md) = 19
- C11 (ningún componente de app/ se define a mano en más de un archivo) = 21
- C20 (ningún supabase/*.sql nuevo crea una política `true` ni da GRANT a anon) = 27
<!-- FIN GENERADO -->

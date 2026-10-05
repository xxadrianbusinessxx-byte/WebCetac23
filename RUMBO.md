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
- **Rama y HEAD:** main · 5e4e8c9

## Qué cerró (últimos 10 commits)

- 5e4e8c9 · Prompt V, Parte C: el arranque y las normas dicen una sola verdad y ya n…
- 03eb384 · Prompt V, Parte B: los scripts de credenciales ya no imprimen claves ni…
- 19dc335 · Prompt V: retroalimentación de la auditoría externa de docs para IA y el…
- 48b8d53 · Prompt V, Parte A: las herramientas de contexto miden igual que el CI y…
- b184b01 · Prompt U, Parte B: «Alumnos / Tutores» del directivo abre el perfil de c…
- 0276097 · Prompt U, Parte A: el video de cada carrera es un enlace de YouTube o Ti…
- f45986d · Seguimiento médico: historial de quién lo editó y cuándo
- d9055e0 · Agenda de citas: el SQL está aplicado; falta que el directivo publique s…
- 1ca2310 · Prompt T, Parte B: la agenda de citas del directivo; alumno y tutor solo…
- 95157b0 · Prompt T, Parte A: los reportes disciplinarios llegan a Notificaciones d…

## Lo que más pesa hoy

- sql-agenda-citas — Agenda de citas: el directivo no ha publicado ningún horario (SQL ya aplicado) · `node scripts/diag-agenda-citas.mjs` · persona
- traspaso-sin-estrenar — asignaciones_profesor sigue con 0 filas · `node scripts/diag-asignaciones-profesor.mjs` · persona
- claves-compartidas-profesores — 15 de 22 profesores comparten contraseña · `node scripts/diag-credenciales-duplicadas.mjs` · persona
- rotar-password-supabase — Rotar la contraseña de Supabase · sin comando de verificación · persona
- tabla-calificaciones-inexistente — archivos_calificaciones: una action viva apunta a una tabla que no esta en public · `node scripts/check-supabase-public.mjs` · persona
- C10 (todo scripts/*.mjs tiene fila en scripts/README.md) = 19
- C11 (ningún componente de app/ se define a mano en más de un archivo) = 21
<!-- FIN GENERADO -->

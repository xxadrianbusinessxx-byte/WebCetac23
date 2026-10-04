# RUMBO — en medio de qué estamos

**Generado por `node scripts/gen-rumbo.mjs`; la cabecera va a mano.**

- **Campaña:** cerrar las UIs pendientes del Océano.
- **Se da por terminada cuando:** las seis pantallas operan, CI verde.

## Fuera de alcance ahora

- Operación de persona: asignaciones y claves.
- `docs/sistema/MATRIZ-UX.md`: pendiente abierto.
- Legacy y fallbacks (R8): no se retiran.

<!-- GENERADO: no editar a mano, lo reescribe scripts/gen-rumbo.mjs -->
- **Rama y HEAD:** main · 19dc335

## Qué cerró (últimos 10 commits)

- 19dc335 · Prompt V: retroalimentación de la auditoría externa de docs para IA y el…
- 48b8d53 · Prompt V, Parte A: las herramientas de contexto miden igual que el CI y…
- b184b01 · Prompt U, Parte B: «Alumnos / Tutores» del directivo abre el perfil de c…
- 0276097 · Prompt U, Parte A: el video de cada carrera es un enlace de YouTube o Ti…
- f45986d · Seguimiento médico: historial de quién lo editó y cuándo
- d9055e0 · Agenda de citas: el SQL está aplicado; falta que el directivo publique s…
- 1ca2310 · Prompt T, Parte B: la agenda de citas del directivo; alumno y tutor solo…
- 95157b0 · Prompt T, Parte A: los reportes disciplinarios llegan a Notificaciones d…
- d7b2803 · Justificantes: historial del profesor con sus materias justificadas El p…
- 93dd14e · Justificantes: el padre envía, el profesor justifica materias y el direc…

## Lo que más pesa hoy

- sql-agenda-citas — Agenda de citas: el directivo no ha publicado ningún horario (SQL ya aplicado) · `node scripts/diag-agenda-citas.mjs`
- traspaso-sin-estrenar — asignaciones_profesor sigue con 0 filas · `node scripts/diag-asignaciones-profesor.mjs`
- claves-compartidas-profesores — 15 de 22 profesores comparten contraseña · `node scripts/diag-credenciales-duplicadas.mjs`
- rotar-password-supabase — Rotar la contraseña de Supabase · sin comando de verificación
- tabla-calificaciones-inexistente — archivos_calificaciones: una action viva apunta a una tabla que no esta en public · `node scripts/check-supabase-public.mjs`
- C10 = 19
- C11 = 21
<!-- FIN GENERADO -->

# RUMBO — en medio de qué estamos

**Generado por `node scripts/gen-rumbo.mjs`; la cabecera va a mano.**

- **Campaña:** cerrar las UIs pendientes del Océano.
- **Se da por terminada cuando:** las seis pantallas operan, CI verde.

## Fuera de alcance ahora

- Operación de persona: asignaciones y claves.
- `docs/sistema/MATRIZ-UX.md`: pendiente abierto.
- Legacy y fallbacks (R8): no se retiran.

<!-- GENERADO: no editar a mano, lo reescribe scripts/gen-rumbo.mjs -->
- **Rama y HEAD:** main · f45986d

## Qué cerró (últimos 10 commits)

- f45986d · Seguimiento médico: historial de quién lo editó y cuándo
- d9055e0 · Agenda de citas: el SQL está aplicado; falta que el directivo publique s…
- 1ca2310 · Prompt T, Parte B: la agenda de citas del directivo; alumno y tutor solo…
- 95157b0 · Prompt T, Parte A: los reportes disciplinarios llegan a Notificaciones d…
- d7b2803 · Justificantes: historial del profesor con sus materias justificadas El p…
- 93dd14e · Justificantes: el padre envía, el profesor justifica materias y el direc…
- 9f171cd · Parte B del Prompt S, con su revisión: el calendario muestra el día por…
- 1397ae8 · Revisión de la Parte A del Prompt S: aceptada, con el traspaso después d…
- 64821c2 · Parte A del Prompt S: la subida de asistencia se guarda por materia sin…
- d7415a7 · Modelo B: el SQL correctivo está aplicado y la estructura, completa

## Lo que más pesa hoy

- sql-agenda-citas — Agenda de citas: el directivo no ha publicado ningún horario (SQL ya aplicado) · `node scripts/diag-agenda-citas.mjs`
- traspaso-sin-estrenar — asignaciones_profesor sigue con 0 filas · `node scripts/diag-asignaciones-profesor.mjs`
- claves-compartidas-profesores — 15 de 22 profesores comparten contraseña · `node scripts/diag-credenciales-duplicadas.mjs`
- rotar-password-supabase — Rotar la contraseña de Supabase · sin comando de verificación
- tabla-calificaciones-inexistente — archivos_calificaciones: una action viva apunta a una tabla que no esta en public · `node scripts/check-supabase-public.mjs`
- C10 = 34
- C11 = 21
<!-- FIN GENERADO -->

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
- **Rama y HEAD:** main · 4f38f54

## Qué cerró (últimos 10 commits)

- 4f38f54 · PROMPT Y: menos viajes por sesión para acercarse a 500 usuarios sin camb…
- 03b1060 · FASE 11: re-medición de rendimiento con las Server Actions reales
- ebba3c1 · Prompt X: SQL de boletas_activacion aplicado y verificado
- 40cb7f5 · Prompt X: prompt archivado con su retroalimentación, informe y pendiente…
- e899f3a · Prompt X, Parte B: boleta generada en el navegador, activada por parcial
- e56482e · Prompt X, Parte A: boletas_activacion, RPC activar_boleta y capacidad bo…
- 7ac451d · Cambio de nombre de pagina en page.tsx a Cetac23
- 3b57a0b · Prompt W: prompt archivado con su retroalimentación e informe
- dc95ddc · Prompt W: alta manual de alumno en Personas › Alumnos › Inscripciones
- 60930b9 · Iconos y assets de la portada: el tamaño lo decide el archivo, no el CSS

## Lo que más pesa hoy

- sql-agenda-citas — Agenda de citas: el directivo no ha publicado ningún horario (SQL ya aplicado) · `node scripts/diag-agenda-citas.mjs` · persona
- traspaso-sin-estrenar — asignaciones_profesor sigue con 0 filas · `node scripts/diag-asignaciones-profesor.mjs` · persona
- claves-compartidas-profesores — 15 de 22 profesores comparten contraseña · `node scripts/diag-credenciales-duplicadas.mjs` · persona
- rotar-password-supabase — Rotar la contraseña de Supabase · sin comando de verificación · persona
- tabla-calificaciones-inexistente — archivos_calificaciones: una action viva apunta a una tabla que no esta en public · `node scripts/check-supabase-public.mjs` · persona
- C10 (todo scripts/*.mjs tiene fila en scripts/README.md) = 19
- C11 (ningún componente de app/ se define a mano en más de un archivo) = 21
<!-- FIN GENERADO -->

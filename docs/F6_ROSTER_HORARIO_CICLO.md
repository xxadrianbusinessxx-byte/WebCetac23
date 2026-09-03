# F6 — Roster/horario consistente con el periodo

## Cambios
- `lib/escolar/roster-validacion.ts` (nuevo, puro):
  - `validarCoherenciaHorario(periodoId, grupos, grupoMaterias, materias, bloques)`:
    rechaza `periodo A + grupo B`, `materia de otro grupo`, materia inactiva y
    bloques con periodo incorrecto. `grupo_materias` sigue siendo la única
    relación materia→grupo.
  - `profesoresClaveAmbiguos(profesores)`: detecta CLAVEs duplicadas con IDs
    distintos (caso real: `4321` repetida). Nunca se elige uno arbitrariamente.

## Decisiones
- `horario_semanal` ya está versionado por `(periodo_id, grupo_id)`; no se
  reescribió el importador.
- La migración F5/F6 de profesores (CLAVE duplicada) NO se limpia de forma
  destructiva: se detecta y reporta.
- El roster/carga por Excel sigue operando sobre el ciclo activo; preparar un
  BORRADOR masivo por Excel queda como dependencia explícita (requiere
  adaptación de la carga, fuera de lo ya implementado con inscripciones
  explícitas por periodo en F3).

## Pruebas (`scripts/test-roster-validacion.mjs`, 5/5)
Grupo de otro periodo · materia ajena al grupo · bloque coherente · bloque del
otro periodo · profesor ambiguo (clave única no reportada).

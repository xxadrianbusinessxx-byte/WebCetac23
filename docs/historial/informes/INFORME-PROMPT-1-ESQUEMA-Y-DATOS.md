# INFORME — PROMPT-1: Esquema y datos del ciclo operativo

- **Fecha de ejecución:** 2026-09-06
- **Prompt:** `docs/historial/prompts/PROMPT-1-ESQUEMA-Y-DATOS.md`
- **Estado:** ejecutado T1–T6 con puntos de parada humanos resueltos (canónico de
  calendario, borrado de Fase B, deduplicación, borrado de los dos ciclos).

---

## 1. Medición inicial (pegada de los cuatro diagnósticos §3)

```
=== PERIODOS ===
[93b24c43] 2026-2027      activo=false  estado=historico
[7f5bf67c] BORRADOR       activo=false  estado=borrador
[7cf5cca7] AGO2026-ENE2027 activo=true  estado=operativo

Ciclo operativo: AGO2026-ENE2027 = 7cf5cca7
grupos=24 · materiasAct=241 · inscActivas=412 · bloquesHorario=168
asignacionesActivas=0 · CURPs con >1 inscripción activa: 55

CALENDARIO_ESCOLAR por texto (5 buckets, ninguno por periodo_id):
  "2026-2027": 78 clase · 3 descanso (2026-08-24 → 2026-12-14)
  "SEMESTRE AGO26-ENE27": 73 clase · 3 descanso · 1 festivo (08-31 → 12-15)
  "PRIMER PARCIAL (SEP-AGO)": 19 clase · 1 descanso
  "SEGUNDO PARCIAL (SEP-NOV)": 29 clase · 1 festivo
  "TERCER PARCIAL (NOV-DIC)": 24 clase · 2 festivo

clases_impartidas: 81 filas · asistencia_alumnos: ≥1000 (tope PostgREST)
Huérfanos en las 9 FK planeadas: 0
justificaciones_asistencia: 18 columnas, sin materia_clave ni grupo_materia_id
```

### Divergencias detectadas frente a la línea base (reportadas, decisión humana)

1. El bucket `2026-2027` (81 filas) estaba **ligado por `periodo_id` al operativo**
   (`7cf5cca7`) — la línea base decía «ninguno por periodo_id».
2. Las **9 FK de asistencia ya estaban declaradas** en la BD (diag-relaciones:
   22 FK), pese a que la línea base y T5 las daban por pendientes.
3. Conteo real de `asistencia_alumnos`: **3 863** (la línea base no lo medía).

**Decisión del directivo (punto de parada T2):** bucket canónico =
`SEMESTRE AGO26-ENE27`; primero desligar del operativo las 81 filas de
`2026-2027` y luego backfillear el canónico.

---

## 2. Qué se hizo (por tarea)

### T1 · Justificación por clase (`grupo_materia_id`)
- `supabase/agregar-grupo-materia-justificaciones.sql` (nuevo): columna
  `grupo_materia_id uuid REFERENCES grupo_materias(id) ON DELETE CASCADE` + dos
  UNIQUE parciales (día completo vs por clase) + retiro de la UNIQUE anterior.
- `supabase/agregar-materia-justificaciones.sql`: marcado **SUPERSEDIDO** (R8;
  no se borra). Nunca se ejecutó.
- `lib/escolar/asistencia/justificaciones.ts`: la identidad de la justificación
  por clase pasa a `grupo_materia_id`; `calcularClasesJustificadasPorDia` y
  `aplicarAsistenciaJustificada` siguen siendo el núcleo; se mantiene la
  idempotencia (fija el total aprobado, no suma). Compatibilidad aditiva: si la
  columna aún no existe (SQL pendiente), todo se trata como día completo.
- `scripts/test-justificacion-por-clase.mjs`: **20 verificaciones** (13 previas
  + casos nuevos: clase concreta por uuid, día completo, no duplicación).
- Validación: `test:compilar` OK · suite 20/20 · `tsc --noEmit` en 0 errores.

### T2 · Calendario a `periodo_id`
- `scripts/diag-calendario-canonico.mjs` (nuevo, LEE).
- `scripts/migrar-calendario-canonico.mjs` (nuevo, `ESCRIBE --apply`).
- Aplicado (con autorización humana): **Fase A** desligó las 81 filas del bucket
  `2026-2027` y ligó las **77 filas de `SEMESTRE AGO26-ENE27`** al operativo;
  **Fase B** (autorizada) eliminó las **157 filas restantes sin `periodo_id`**.
- Estado final: 1 bucket, 77 filas ligadas, 0 sin `periodo_id`.
- La ruta legacy por texto se conserva (R8).

### T3 · Deduplicar inscripciones
- `scripts/diag-inscripciones-duplicadas.mjs` (nuevo, LEE) y
  `scripts/migrar-deduplicar-inscripciones.mjs` (nuevo, `ESCRIBE --apply`).
- Roster: `things/Alumnos CETAC` (10 listas; la lista `6TOMCA.xlsx` → 5TO A
  MECATRONICA por decisión ya documentada del directivo).
- Aplicado con `--apply` (autorizado): **55 inscripciones desactivadas**
  (`activo=false`; nunca DELETE): 21 quedan en 3RO A RH, 24 en 5TO A
  MECATRONICA, 10 en 5TO A RH. **0 pendientes humanos**.
- Validación: `p0-diag-contexto.mjs` → CURPs duplicados **55 → 0**; activas
  **412 → 357** (−55 exacto).

### T4 · Borrar `2026-2027` y `BORRADOR`
- `scripts/diag-eliminar-ciclo.mjs` (nuevo, LEE) y
  `scripts/migrar-eliminar-ciclos.mjs` (nuevo, `ESCRIBE --apply`).
- Hallazgo reportado: ambos ciclos tenían **0 inscripciones ACTIVAS pero 453 y 37
  históricas inactivas** (duplicados del P0; sus CURPs ya viven en el operativo)
  que bloqueaban la RPC `eliminar_ciclo`. Autorizado: DELETE de las **490
  inscripciones históricas inactivas** y luego RPC sobre cada ciclo.
- RPC `eliminar_ciclo` OK en ambos (`2026-2027`: 24 grupos · 253 gm · 168
  horario; `BORRADOR`: 10 grupos · 101 gm).
- Operativo renombrado `AGO2026-ENE2027` → **`2026-2027`** (R5: el nombre nunca
  es identificador).
- Verificación: las 6 cifras del operativo **no cambiaron** (24/241/357/168/77/0).
- Las 81 filas de `clases_impartidas` NO se tocaron (T4).

### T5 · Claves foráneas de asistencia
- `supabase/agregar-fk-asistencia.sql` (nuevo, idempotente): versiona las 9 FK
  de `clases_impartidas` y `asistencia_alumnos` hacia `PROFESORES`,
  `grupo_materias`, `periodos`, `periodos_evaluacion` y `ALUMNOS`. Las FK **ya
  existen** en la BD con 0 huérfanos; el SQL solo crea las que faltaran.
- Validación: `probe-columnas-asistencia.mjs` → 0 huérfanos en las 9; `eliminar_ciclo`
  funcionó (probado en T4).

### T6 · Índices y `periodo_id` en asistencia
- Conteo exacto (count=exact): `clases_impartidas` **81** · `asistencia_alumnos`
  **3 863**.
- `scripts/diag-asistencia-periodo.mjs` (nuevo, LEE) y
  `scripts/migrar-asistencia-periodo.mjs` (nuevo, `ESCRIBE --apply`).
- Backfill aplicado: **3 795 filas** de `asistencia_alumnos` con
  `periodo_id`/`periodo_evaluacion_id` (rango 2026-08-31 → 2026-12-11). **68
  filas** históricas fuera del rango quedan NULL (reportadas, sin inventar).
  Las 81 de `clases_impartidas` no se tocaron (T4).
- `supabase/agregar-indices-asistencia.sql` (nuevo): `(periodo_id,
  grupo_materia_id, fecha)` · `(curp, periodo_id)` · único `(curp,
  grupo_materia_id, fecha)`. **No se particionó** (cambio aparte).
- Validación: `probe-columnas-asistencia.mjs` → **0 huérfanos** tras el backfill.



---

## 3. Antes / después (los mismos diagnósticos §3)

| Medida | Antes | Después |
|---|---|---|
| Periodos en `periodos` | 3 | **1** (`2026-2027` = `7cf5cca7`) |
| Grupos / gm act / insc. act / horario | 24 / 241 / 412 / 168 | 24 / 241 / **357** / 168 |
| CURPs con >1 inscripción activa | 55 | **0** |
| Buckets de calendario por texto | 5 | 1 (`SEMESTRE AGO26-ENE27`) |
| Calendario ligado por `periodo_id` | 81 (bucket `2026-2027`) | **77** (bucket canónico) |
| Filas de calendario sin `periodo_id` | 234−81 | **0** |
| `clases_impartidas` | 81, sin `periodo_id` | 81, intactas (históricas) |
| `asistencia_alumnos` | ≥1000 sin medir | 3 863 exacto → **3 795** con `periodo_id` |
| Huérfanos 9 FK de asistencia | 0 | **0** |
| `justificaciones_asistencia` | 18 cols, sin materia | SQL T1 pendiente humano |
| FK declaradas (diag-relaciones) | 22 | 22 (9 de asistencia presentes) |

---

## 4. Archivos tocados

- `supabase/agregar-grupo-materia-justificaciones.sql` (nuevo)
- `supabase/agregar-materia-justificaciones.sql` (cabecera SUPERSEDIDO)
- `supabase/agregar-fk-asistencia.sql` (nuevo)
- `supabase/agregar-indices-asistencia.sql` (nuevo)
- `lib/escolar/asistencia/justificaciones.ts` (identidad por `grupo_materia_id`)
- `scripts/test-justificacion-por-clase.mjs` (suite ampliada)
- `scripts/diag-calendario-canonico.mjs` · `scripts/migrar-calendario-canonico.mjs`
- `scripts/diag-inscripciones-duplicadas.mjs` · `scripts/migrar-deduplicar-inscripciones.mjs`
- `scripts/diag-eliminar-ciclo.mjs` · `scripts/migrar-eliminar-ciclos.mjs`
- `scripts/diag-asistencia-periodo.mjs` · `scripts/migrar-asistencia-periodo.mjs`
- `scripts/README.md` (filas de los scripts nuevos)
- `ESTADO-ACTUAL.md` (§2, §3, §5, §6)
- `docs/historial/informes/INFORME-PROMPT-1-ESQUEMA-Y-DATOS.md` (este)

## 5. Qué NO toqué pudiendo hacerlo

- `app/actions/` (C1) y el refactor de capas (C2/C5) → prompt 5.
- Permisos / rol técnico (`MATRIZ-PERMISOS.md` manda sobre el código) → prompts 2-3.
- UI de asignación profesor→materia (A2) y cambio forzado de clave (A4) → prompt 3.
- Configurador de ciclo ampliado (borrar datos, aliases, roster) → prompt 4.
- Reescribir `eliminar_ciclo` para apoyarse en las FK → cambio aparte (no se
  mezcló; T4 usó el RPC vigente).
- Particionar `asistencia_alumnos` → cambio aparte.
- `scripts/_peligrosos/` y `scripts/_archivo/` no se ejecutaron; legacy no se
  eliminó (R8); ningún identificador de texto nuevo (R5); sin segunda fuente de
  verdad (R6).

## 6. Validación global

- `npx tsc --noEmit` → 0 errores.
- `npm run test:compilar` → 13/13.
- `scripts/test-justificacion-por-clase.mjs` → 20/20.
- `scripts/test-ciclo-calendario.mjs` → 4/4 · `test-calendario-periodo-f5.mjs` → 7/7.
- `npm run build` → completa (9 rutas).

## 7. Pendiente humano (resumen)

1. Ejecutar en el SQL Editor los `.sql` de PROMPT-1 (T1, T5, T6) listados en
   `ESTADO-ACTUAL.md` §6. El de T1 habilita la justificación por clase.
2. Revisar las 68 filas de asistencia sin `periodo_id` (históricas fuera de rango).
3. Corregir CLAVE duplicadas de `PROFESORES` (tema de prompts siguientes).

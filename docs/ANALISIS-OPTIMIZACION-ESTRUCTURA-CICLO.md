# Análisis para mañana — Optimizar la estructura de ciclo/parciales

> Fecha: 2026-09-04. Escrito tras cerrar el Bloque 18.
> Todo lo de aquí está **medido**, no supuesto. Los scripts de diagnóstico que
> lo reproducen están en `scripts/diag-*.mjs` (solo lectura).
> Orden sugerido: O-1 → O-2 → O-3. O-4 y O-5 son independientes.

---

## O-1 · La RPC del perfil devuelve identidades de TODOS los ciclos (nuevo, urgente)

**Prioridad: alta. Es correctitud latente + coste que crece con cada ciclo.**

Al reparar `tabla_legacy` apareció esto:

```
RPC obtener_perfil_alumno('ZAFA100523MVZPMMA6')
  grupo_materias: 10
  identidades:    40      <-- deberían ser 10
```

**Causa** — `supabase/crear-rpc-obtener-perfil-alumno.sql`, ~línea 207:

```sql
FROM grupo_materias gm
LEFT JOIN grupos g ON g.id = gm.grupo_id
...
WHERE gm.tabla_legacy = ANY(v_tablas_legacy)     -- <-- sin filtro de periodo
```

La consulta busca por `tabla_legacy` **en toda la base**, sin acotar al periodo
ni al grupo del alumno. Como `2026-2027`, `AGO2026-ENE2027`, `AGO2026-DIC2026` y
`BORRADOR` comparten ahora los mismos valores de `tabla_legacy`, cada materia
del alumno devuelve ~4 filas.

**Por qué hoy no se nota:** la app las colapsa en un `Map` por `tablaLegacy`
(`app/actions/escolar.ts`, `identidades = new Map(...map(i => [i.tablaLegacy, i]))`),
así que **gana la última** y el alumno ve sus 10 materias correctas — porque hoy
la identidad (grado/grupo/carrera) coincide entre ciclos clonados.

**Por qué hay que arreglarlo igual:**
1. **Correctitud latente.** El día que un ciclo renombre un grupo o cambie una
   carrera, el perfil mostrará la identidad de *otro* ciclo, en silencio y de
   forma no determinista (depende del orden que devuelva Postgres).
2. **Coste O(nº de ciclos).** Hoy 4×. Cada ciclo escolar nuevo suma otro múltiplo
   al payload de la ruta más caliente del sistema (`/perfil`). En 3 años son 10×.
3. Contradice §4 (fuente única) y §11 (no duplicar consultas).

**Arreglo** — acotar la consulta al grupo del alumno, que la RPC ya tiene en
`v_grupo_id`:

```sql
WHERE gm.tabla_legacy = ANY(v_tablas_legacy)
  AND gm.grupo_id = v_grupo_id        -- <-- añadir
```

Es un cambio de una línea en el SQL de la RPC. **Verificar además** el camino de
fallback: `resolverIdentidadesCatalogo` en TypeScript probablemente tiene el
mismo problema (recibe solo `tablasLegacy`, sin el grupo) — revisarlo y acotarlo
igual, o el bug reaparece cuando la RPC no está disponible.

**Criterio de éxito:** la RPC devuelve `identidades: 10` para
`ZAFA100523MVZPMMA6`, y sigue devolviendo 10 tras crear un ciclo nuevo.

---

## O-2 · Contexto académico duplicado entre 4 periodos

**Prioridad: media-alta. Es la deuda #4 de `REGLAS_NO_HACER.md`.**

Estado medido (`scripts/diag-materias-alumno.mjs`):

| Periodo | grupos | grupo_materias activas | inscripciones |
|---|---|---|---|
| `AGO2026-ENE2027` (OPERATIVO) | 24 | 241 | 356 |
| `2026-2027` | 24 | 241 | 0 |
| `AGO2026-DIC2026` | 10 | 101 | 0 |
| `BORRADOR` | 10 | 101 | 0 |

`2026-2027` y `AGO2026-ENE2027` **representan el mismo ciclo real** con distinto
nombre: mismos 24 grupos, mismas 241 materias, mismos `tabla_legacy`. Es
exactamente lo que R4 prohíbe («no dividir el concepto de ciclo escolar»).

`AGO2026-DIC2026` y `BORRADOR` son borradores de pruebas, vacíos de alumnos.

**Consecuencias medibles:** 684 filas de `grupo_materias` donde bastarían 241;
es la causa directa del 4× de O-1; y cualquier consulta que busque por
`tabla_legacy` sin acotar periodo hereda el problema.

**Qué hacer:** decidir **una sola representación** del ciclo y retirar las otras
con el procedimiento seguro de §9 (identificar → verificar → cambiar consumidores
→ desactivar → marcar deprecated → eliminar cuando sea seguro). **No borrar
`2026-2027` a la ligera:** hay que confirmar antes que ningún histórico
(calificaciones, asistencia, justificaciones) cuelga de sus grupos.
La RPC `eliminar_ciclo` del Bloque 17 ya existe y **bloquea** el borrado de un
periodo con inscripciones — úsala, y corre primero
`actionDiagnosticoEliminarCiclo` para ver los conteos exactos.

---

## O-3 · `calendario_escolar` sigue relacionado por texto (deuda R5)

**Prioridad: media. Bloquea funcionalidad real hoy.**

El ciclo operativo **tiene 0 días de calendario**. Los 5 buckets de texto están
huérfanos:

```
2026-2027                 78 clase · 3 descanso     2026-08-24 → 2026-12-14
SEMESTRE AGO26-ENE27      73 clase · 3 descanso · 1 festivo   2026-08-31 → 2026-12-15
PRIMER PARCIAL (SEP-AGO)  19 clase · 1 descanso     2026-08-31 → 2026-09-25
SEGUNDO PARCIAL (SEP-NOV) 29 clase · 1 festivo      2026-09-28 → 2026-11-06
TERCER PARCIAL (NOV-DIC)  24 clase · 2 festivo      2026-11-02 → 2026-12-11
```

Mientras siga así, la plantilla de asistencias **no puede generarse** para el
ciclo operativo, por muy correcto que sea ya el código.

**Ojo con los tres buckets `... PARCIAL ...`:** son el anti-patrón R5 (nombres de
ciclo como identificador estructural) y además **`SEGUNDO` y `TERCER` se
solapan** (→11-06 vs 11-02→). La representación correcta ya existe y ya está
poblada: los 3 parciales activos en `periodos_evaluacion`.

**Plan:**
1. Backfill de `calendario_escolar.periodo_id` desde `SEMESTRE AGO26-ENE27`
   (73 días de clase, el rango que coincide con el ciclo). Ya existe
   `planBackfillCalendario` para proponerlo, y `scripts/diag-calendario-periodo.mjs`
   para ver qué días caen en qué parcial.
2. Resolver el solape antes de tocar nada.
3. Una vez todo cuelgue de `periodo_id`, retirar la ruta por texto (ya
   `@deprecated`) y cerrar R5.

---

## O-4 · Identidad del profesor (`PROFESORES.CLAVE` duplicada)

**Prioridad: alta si va a haber varios profesores usando el sistema; baja si hoy
solo lo usa uno.**

Medido con `scripts/diag-profesor-alcance.mjs`:

```
PROFESORES: 20 filas · claves distintas: 3
  !! CLAVE="4321" compartida por 16 profesores
  !! CLAVE="8080" compartida por 3 profesores
```

El SQL aditivo `supabase/agregar-profesor-id-asistencia.sql` ya está preparado
pero **sin ejecutar**. Hasta que se ejecute y las CLAVE se corrijan:

- los aportes de asistencia de 16 profesores se mezclan en la misma fila;
- `actionAnularAsistenciaProfesor` puede borrar el registro de otro profesor;
- las 81 filas históricas de `clases_impartidas` tienen **autoría
  irrecuperable** (no se backfilleó `profesor_id` a propósito: inventar la
  atribución sería peor que dejarla en NULL).

**Orden:** ejecutar el SQL → asignar CLAVEs únicas → activar
`debe_cambiar_credenciales` para forzarles el cambio en el siguiente acceso.

---

## O-5 · Ergonomía de las pruebas (barato, alto retorno diario)

Las 5 suites puras **no se pueden correr sin leer su cabecera**: cada una exige
un `npx tsc` distinto a un `.tmp-*` propio antes de ejecutarse. Hoy me di cuenta
porque las cinco «fallaron» hasta compilarlas a mano.

```bash
# lo que hay que teclear hoy para UNA suite
npx tsc lib/escolar/contexto-ciclo.ts --outDir scripts/.tmp-reparar-tabla-legacy \
  --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck
node scripts/test-reparar-tabla-legacy.mjs
```

**Arreglo (30 min):** scripts en `package.json` — `test:reparar`, `test:parciales`,
… y un `test` que los corra todos y devuelva código de salida distinto de 0 si
alguno falla. Con eso la validación de cada prompt de Cline pasa a ser `npm test`
en vez de seis invocaciones que es fácil ejecutar mal (o creer que fallan).

Los `.tmp-*` nuevos ya quedaron en `.gitignore` en este commit.

---

## Lo que NO recomiendo tocar todavía

- **Las 241 tablas físicas de materia con 0 filas** (detectado en la FASE 10).
  Es un riesgo estructural real, pero migrarlas es una fase propia y no bloquea
  nada hoy.
- **C-1 / C-3 / C-4 de `OPTIMIZACION_RENDIMIENTO_400_500.md`** (pg_trgm en el
  login, RPC de metadata OpenAPI, paginación del panel directivo). Están
  documentados con evidencia pero su cuello de botella no ha vuelto a medirse
  desde entonces. §16: medir antes de optimizar; el sistema cambió bastante.
- **Retirar `FALLBACK_TODAS_LAS_MATERIAS`.** Depende de que
  `asignaciones_profesor` se pueble, que es una decisión que ya se aplazó
  conscientemente.

---

## Resumen ejecutable

| # | Qué | Esfuerzo | Riesgo si se ignora |
|---|---|---|---|
| O-1 | Acotar `identidades` por `grupo_id` en la RPC (+ fallback TS) | 1 línea SQL + revisión | Identidad errónea silenciosa; payload ×nº ciclos |
| O-2 | Consolidar `2026-2027` / `AGO2026-ENE2027` | Fase propia, con diagnóstico | 684 filas donde bastan 241; alimenta O-1 |
| O-3 | Backfill `calendario_escolar.periodo_id` | Medio | La plantilla de asistencias no se puede generar |
| O-4 | Ejecutar SQL de `profesor_id` + CLAVEs únicas | Bajo (SQL) + trabajo tuyo | Asistencias mezcladas entre profesores |
| O-5 | `npm test` que corra las 5 suites | 30 min | Validaciones que parecen fallar sin fallar |

**Mi recomendación para mañana:** empezar por **O-1** (es una línea, y es el
único que introdujimos hoy sin querer), seguir con **O-5** (barato y hace más
fiable todo lo demás), y dejar O-2/O-3 para una sesión con tiempo, porque
requieren decisiones tuyas sobre datos históricos.

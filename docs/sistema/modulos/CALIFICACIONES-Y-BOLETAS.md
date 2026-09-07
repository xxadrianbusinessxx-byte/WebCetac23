# CALIFICACIONES Y BOLETAS — por qué las ~240 tablas físicas por materia son deliberadas

- **Fecha:** 2026-09-07 (PROMPT-5/B7)
- **Ámbito:** `lib/escolar/materia/**` · `app/actions/materias.ts`, `escolar.ts`,
  `calificaciones.ts` · `_borrador/calificaciones.ts`
- **Veredicto de diseño:** las tablas físicas por materia **no son deuda**; son el
  modelo deliberado del subsistema de calificaciones. **No "optimizarlas"** hacia una
  tabla única sin un rediseño explícito de producto.

---

## 1. Origen: los Excel de la escuela son la verdad

La escuela trabaja con **una hoja de calificaciones por grupo·materia por ciclo**
(archivos en `things/`, estructura tipo

> `2DO A MECATRONICA CONCIENCIA HISTORICA.xlsx`

). Cada hoja tiene:

- encabezados **variables por materia** (parciales, actividades, columnas extra);
- una fila por alumno (CURP + nombre + calificaciones por parcial);
- un orden y un esquema que **cambian de un ciclo a otro**.

La plataforma refleja ese origen: cada hoja es una **tabla física** (`grupo_materias.tabla_legacy`
es el nombre literal de la tabla). Una tabla única centralizada exigiría **inventar un
esquema universal** que la escuela no usa.

## 2. Cómo se materializa (deliberado)

- **Catálogo académico:** `periodos → grupos → grupo_materias → materias`. La fila
  `grupo_materias.tabla_legacy` apunta a la tabla física real de ese grupo·materia.
- **Esquema en caliente:** las columnas de cada tabla se sincronizan con el archivo
  subido (`escolar_sync_columns`, `schema-tabla.ts`). El esquema **no es fijo**: se
  descubre en runtime (`listarColumnasTabla`) y se amplía/recorta según el Excel.
- **Subida por parcial:** `materia-avance.ts` reemplaza el contenido de la tabla al
  subir un parcial (no suma: recalcula). `mapeo-columnas` alinea encabezados.
- **Una tabla por materia**, no una tabla por ciclo: el historial de calificaciones de
  un ciclo se conserva porque la tabla física perdura (R8).

## 3. Consecuencias que NO se deben "arreglar" de paso

| Tentación de "optimización" | Por qué NO hacerla |
|---|---|
| Unir las ~240 tablas en una tabla `calificaciones(tabla, fila, columna, valor)` | Inventa un esquema universal que no existe; rompe el origen Excel; exige migrar y re-mapear todos los encabezados; destruye la lectura directa por materia. |
| Normalizar columnas a un catálogo fijo de parciales | Cada materia decide sus parciales/columnas; forzar uno universal descarta información o inventa celdas vacías. |
| Borrar tablas "huérfanas" al desactivar una materia | Desactivar (`grupo_materias.activo=false`) oculta; borrar destruye historial (R8). |
| Mover el esquema a JSONB "para simplificar" | El motor relacional con columnas reales ya es el esquema; JSONB solo difiere el problema y complica la subida por parcial y el mapeo. |

## 4. Base del sistema de boletas digital (previsto)

Las calificaciones por materia alimentarán el **boleta por alumno** (promedios por
parcial, reprobadas, estatus). El diseño futuro **debe leer el subsistema actual**, no
reemplazarlo: por alumno (CURP) → inscripción (grupo) → `grupo_materias` del grupo →
lectura de cada tabla física → cálculo del boleta. El módulo `alumno/etiquetas-status`
ya hace la lectura cruzada de promedios para el estatus.

## 5. Referencias del código

- `lib/escolar/catalogo/catalogo-academico.ts` — identidad grupo·materia (C4.28).
- `lib/escolar/materia/schema-tabla.ts` — columnas reales de cada tabla física.
- `lib/escolar/materia/mapeo-columnas-materia.ts` — mapeo de encabezados.
- `lib/escolar/materia/materia-avance.ts` — reemplazo de contenido por parcial.
- `lib/escolar/materia/materia-vista-alumno.ts` — lectura por alumno de una materia.
- `lib/escolar/alumno/etiquetas-status.ts` — promedios para estatus/boleta.
- `lib/escolar/materia/nombres-visibles.ts` — `idInterno` (tabla física) vs `nombreVisible`.

## 6. Regla para futuros agentes

**No tocar la estructura física de calificaciones sin un prompt explícito de rediseño
de producto.** Este documento existe para que el próximo agente sepa que la deuda #3
del MAPA ("una tabla física por materia") es en realidad un **diseño deliberado con
origen en los Excel**, y que "optimizarla" sin autorización sería un error (R5).

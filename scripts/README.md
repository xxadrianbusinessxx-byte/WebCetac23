# scripts/ — inventario y reglas de ejecución

**Regla de oro:** ningún script de esta carpeta se ejecuta sin leer antes su fila en
esta tabla. El nombre del archivo NO es garantía de nada: hubo `probe-*` que borraban
tablas enteras (por eso existe `_peligrosos/`).

Todos leen las credenciales de `.env.local` con `service_role`, es decir **saltan RLS**.
No hay entorno de staging: lo que toques, lo tocas en producción.

## Antes de correr cualquier suite pura

Las suites `test-*.mjs` importan JS **ya compilado** desde `scripts/.tmp-*`. Esas
carpetas están en `.gitignore`, así que en un clon limpio no existen y la suite falla
con `ERR_MODULE_NOT_FOUND`. Recompilar con:

```bash
npm run test:compilar
```

(o `node scripts/compilar-suites.mjs <filtro>` para una sola). Hay que volver a
correrlo **cada vez que se modifica el módulo de `lib/` que la suite prueba** — si no,
se está probando la versión anterior y el resultado miente.

Seis suites son la excepción y **no** necesitan este paso porque se transpilan solas con
`ts.transpileModule`: `test-materia-identidad`, `test-mapeo-columnas-materia`,
`test-columnas-calificaciones`, `test-materia-avance`, `test-etiquetas-dinamicas` e
`test-importar-etiquetas`. Lo mismo aplica a las dos suites de permisos (PROMPT-2/3:
`test-permisos.mjs` y `test-auditoria-permisos.mjs`), que transpilan los módulos puros
de `lib/auth/`. Cada una lleva su propia lista de módulos a transpilar; si
añades un `import` al módulo bajo prueba, hay que añadir esa dependencia a la lista o la
suite falla con `Cannot find module`.

La salida compilada **espeja la estructura de `lib/escolar/`** (`.tmp-x/ciclo/…`), porque
los imports internos de esos módulos son relativos.

## Clasificación

| Etiqueta | Significado |
|---|---|
| `LEE` | Solo `GET`. Ejecutable sin autorización. |
| `LEE(fs)` | Solo lee archivos del repo. No toca la base. Ejecutable sin autorización. |
| `ESCRIBE --apply` | Por defecto hace DRY-RUN e imprime el plan. Solo escribe con `--apply`. Requiere autorización antes del `--apply`. |
| `ESCRIBE` | Escribe en cuanto arranca, sin guarda. |
| `DESTRUCTIVO` | Borra filas. |

---

## Raíz de `scripts/` — seguros salvo lo marcado

### Suites puras (`LEE(fs)`) — la red de seguridad del repo
Compilan el módulo puro a `.tmp-*/` y comparan resultados. No tocan la base.
Correr las que apliquen **antes y después** de cualquier cambio de dominio.

| Script | Módulo que prueba |
|---|---|
| `test-ciclo-estado.mjs` | `lib/escolar/ciclo/ciclo-estado-puro.ts` |
| `test-atribucion-profesor.mjs` | `lib/escolar/asistencia/atribucion-profesor.ts` |
| `test-asistencia-parciales.mjs` | `lib/escolar/asistencia/asistencia-parcial.ts` |
| `test-etiquetas-dinamicas.mjs` | `lib/escolar/alumno/etiquetas-dinamicas.ts` |
| `test-mapeo-columnas-materia.mjs` | `lib/escolar/materia/mapeo-columnas-materia.ts` |
| `test-fechas.mjs` | `lib/escolar/fechas.ts` |
| `test-orden-alumnos.mjs` | `lib/escolar/alumno/orden-alumnos.ts` (orden alfabetico por apellido paterno en descargas) |
| `test-roster-validacion.mjs` | `lib/escolar/catalogo/roster-validacion.ts` |
| `test-evaluaciones.mjs` | `lib/escolar/ciclo/evaluaciones.ts` |
| `test-justificacion-por-clase.mjs` | `lib/escolar/asistencia/justificaciones.ts` |
| `test-reparar-tabla-legacy.mjs` | `lib/escolar/ciclo/contexto-ciclo.ts` |
| `test-traspaso-materia.mjs` | `lib/escolar/materia/traspaso-materia.ts` |
| `test-materia-identidad.mjs` · `test-materia-avance.mjs` · `test-columnas-calificaciones.mjs` | identidad y columnas de materia |
| `test-importar-etiquetas.mjs` · `test-inscripciones-f3.mjs` · `test-ciclo-f3-pipeline.mjs` | importación y pipeline de ciclo |
| `test-auditoria-ciclo-f0..f8.mjs` | detectores de regresión por fase (lectura de código estático) |
| `test-auditoria-permisos.mjs` | (PROMPT-2/T5) detector de regresión de la centralización: ninguna Server Action pregunta por rol, toda action llama a `exigir()` (salvo las públicas de `portada.ver` y la delegación verificada de etiquetas), capacidades ⇄ §5, y el rol nunca se lee de FormData/parámetros |
| `test-permisos.mjs` | (PROMPT-2/T1/T2 + PROMPT-3 + PROMPT-4) pruebas puras de `lib/auth/permisos.ts`: transpila los módulos puros de `lib/auth`, valida `puede()` con los **5 roles** y compara el código contra la §4 completa del MATRIZ («Código ⇄ §4 (los 5 roles)», regla: la matriz implementada coincide con el documento) |
| `test-reactivacion-inscripciones.mjs` | (PROMPT-4/T1) suite pura (16 checks) que transpila `ciclo-estado-puro.ts`: la fila marcada con `decision_manual` jamás se reactiva/desactiva; sin marcas se conserva el comportamiento previo |
| `test-borrar-paso.mjs` | (PROMPT-4/T4) suite pura (10 checks) que transpila `borrar-paso-puro.ts` (`calcularBloqueosPaso`): académico con inscripciones bloquea, horario con actividad bloquea, roster del OPERATIVO bloquea, BORRADOR permite, evaluaciones nunca bloquea |
| `test-calendario-periodo-f5.mjs` · `test-ciclo-calendario.mjs` · `test-asistencia-contexto.mjs` · `test-activacion-ciclo-f8.mjs` | ciclo / calendario / contexto |

### Diagnósticos vivos (`LEE`) — el instrumental para medir antes de tocar
`AGENTS.md` exige medir antes de modificar. Estos son los que hay que usar.

| Script | Qué mide |
|---|---|
| `p0-diag-contexto.mjs` | ciclo activo + contexto académico completo. **El primero a correr ante cualquier duda.** |
| `p0-verificar-profesor.mjs` · `p0-verificar-restauracion.mjs` | identidad de profesor y estado tras una restauración |
| `diag-calendario-periodo.mjs` | días de clase por periodo/parcial (deuda 1) |
| `diag-calendario-canonico.mjs` | (PROMPT-1/T2) qué pasaría si cada bucket textual de `calendario_escolar` fuera el canónico del operativo: días por tipo, solapes, huérfanos y filas sin `periodo_id` |
| `diag-eliminar-ciclo.mjs` | (PROMPT-1/T4) conteos exactos y bloqueos previos al borrado de periodos (replica `diagnosticoEliminarCiclo`). Uso: `node scripts/diag-eliminar-ciclo.mjs <id>...` |
| `diag-asistencia-periodo.mjs` | (PROMPT-1/T6) conteo exacto (count=exact) y relleno de `periodo_id`/`periodo_evaluacion_id` en asistencia |
| `diag-inscripciones-duplicadas.mjs` | (PROMPT-1/T3) CURPs con >1 inscripción activa en el operativo, con grupo/ciclo/semestre y match contra roster (`--roster=`) |
| `diag-profesor-alcance.mjs` | qué ve un profesor y con qué identidad (deuda 2) |
| `diag-materias-alumno.mjs` | cobertura `tabla_legacy` + RPC de perfil |
| `diag-preview-reparar-tabla-legacy.mjs` | simula el preview de reparación sin escribir |
| `diag-relaciones-supabase.mjs` | mapa de FKs reales |
| `diag-duplicados-ciclos.mjs` · `diagnostico-ciclo-activo-bug.mjs` · `8-diagnostico-ciclos.mjs` | duplicados y exclusividad de ciclo |
| `probe-*` (los 16 que quedan aquí) | esquema y contenido de tablas: columnas, permisos, OpenAPI, CURPs duplicadas |
| `verificar-credenciales-iniciales.mjs` · `verificar-login-credenciales-iniciales.mjs` · `verificar-tablas-tutores.mjs` | credenciales y tutores |
| `6i/6j/6k-*.mjs` · `7-diagnostico-materias-alumnos.mjs` · `fase10-*.mjs` | diagnósticos de bloques anteriores, siguen siendo válidos |
| `check-supabase-public.mjs` · `check-documentos-route.mjs` | conectividad y rutas |
| `gen-materias-list.mjs` · `gen-registros-list.mjs` · `gen-tablas-desde-supabase.mjs` · `sync-decoraciones.mjs` | generan listados en disco (`LEE(fs)` + escritura de archivos del repo, no de la base) |
| `gen-matriz-permisos.mjs` | `LEE(fs)`. Regenera la §5 de `docs/sistema/MATRIZ-PERMISOS.md` desde `app/actions/**`. `npm run gen:matriz`; con `--check` no escribe y sale 1 si hay desfase. Respeta la §4 (la matriz de roles, que se edita a mano). |
| `gen-seccion4.mjs` | (PROMPT-3) Regenera la **tabla §4** de `docs/sistema/MATRIZ-PERMISOS.md` desde `lib/auth/permisos.ts` (la matriz implementada), para que documento y código no diverjan. `node scripts/gen-seccion4.mjs`; no lleva `--check`. |
| `migrar-crear-tecnico.mjs` | `ESCRIBE --apply` (PROMPT-3/T1). Crea la fila del rol **técnico** en `PROFESORES` (`Permisos='Tecnico'`, `debe_cambiar_credenciales=true`). Idempotente: si ya existe, no duplica. Dry-run por defecto. Autorizado 2026-09-06. |
| `probe-login-tecnico.mjs` | (PROMPT-3) Verifica el login del rol técnico contra la BD (rol, `profesorId`, flag de cambio forzado). |
| `diag-asignaciones-profesor.mjs` | (PROMPT-3/T3·A2) Estado de `asignaciones_profesor`: DDL C4.11 aplicado, filas totales y activas. Es el «¿ya se pobló la atribución?». |
| `diag-inscripciones-reactivacion.mjs` | (PROMPT-4/T1) Replica `sincronizarInscripcionesOperativo` (created_at desc, id desc) y cuenta cuántas filas «invertiría» al reactivar el ciclo. Con `decision_manual` presente elige solo entre las NO marcadas. Medición: 57 → 0. |
| `probe-curp.mjs` | (PROMPT-4/T1) `LEE`. Detalle de TODAS las filas de una CURP en el operativo (grupo, `activo`, `decision_manual`, motivo). Uso: `node scripts/probe-curp.mjs <CURP>`. |
| `migrar-marcar-decision-manual.mjs` | `ESCRIBE --apply` (PROMPT-4/T1, opción A). Marca `decision_manual=true`+motivo en las filas inactivas que la sincronización elegiría por encima de la activa (regla en cascada). Exige la columna (aplicar antes el `.sql`). Aplicado 2026-09-06: 58 filas. Dry-run por defecto. |
| `diag-inscripciones-vs-roster.mjs` | (PROMPT-5/A2) `LEE`. Compara las inscripciones ACTIVAS del operativo contra los Excel de `things/Alumnos CETAC` (carpeta = parámetro `--roster`, obligatorio). Reporta 4 listas: en base-no-Excel · en Excel-no-base · en ambos-grupo distinto · CURPs sin fila en ALUMNOS. Medición 2026-09-07: 0/0/0/0. |
| `diag-credenciales-duplicadas.mjs` | (PROMPT-5/A1) `LEE`. Claves compartidas en PROFESORES/ALUMNOS/tutores, `debe_cambiar_credenciales`, y el caso real (mismo nombre+clave en alumnos). |
| `migrar-marcar-claves-compartidas-profesores.mjs` | `ESCRIBE --apply` (PROMPT-5/A1). Marca `debe_cambiar_credenciales=true` a los profesores con clave compartida (19: 16 `4321` + 3 `8080`). No toca la cuenta técnica ID 21. Aplicado 2026-09-07. Dry-run por defecto. |
| `correr-todas-las-suites.mjs` | (PROMPT-5/B6) `LEE(fs)`. Ejecuta todas las `test-*.mjs` en orden; sale 1 si alguna falla. Lo usa el CI. |

### Con guarda de escritura

| Script | Etiqueta | Qué hace |
|---|---|---|
| `p0-restaurar-ciclo-operativo.mjs` | `ESCRIBE --apply` | Reactiva el ciclo operativo correcto y desactiva el prematuro (`PATCH periodos.activo`). Herramienta de emergencia, reutilizable. Sin `--apply` solo imprime el plan. |
| `migrar-calendario-canonico.mjs` | `ESCRIBE --apply` | (PROMPT-1/T2) Deja el calendario del operativo colgado de `periodo_id` con UN bucket canónico. Fase A (UPDATE): desliga buckets no canónicos y asigna el canónico (default `SEMESTRE AGO26-ENE27`). Fase B (DELETE, con `--borrar-sin-periodo`): borra filas que queden sin `periodo_id`. Dry-run por defecto. |
| `migrar-deduplicar-inscripciones.mjs` | `ESCRIBE --apply` | (PROMPT-1/T3) Ningún CURP con >1 inscripción activa: cruza contra roster (`--roster=`, obligatorio) y desactiva (`activo=false`) las que no corresponden. Lo que no casa = pendiente humano. Dry-run por defecto. |
| `migrar-eliminar-ciclos.mjs` | `ESCRIBE --apply` | (PROMPT-1/T4) Autorizado 2026-09-06: elimina inscripciones históricas inactivas de `2026-2027` y `BORRADOR`, ejecuta RPC `eliminar_ciclo` y renombra el operativo a `2026-2027`. Verifica antes/después las 6 cifras del operativo. Dry-run por defecto. |
| `migrar-asistencia-periodo.mjs` | `ESCRIBE --apply` | (PROMPT-1/T6) Rellena `periodo_id`/`periodo_evaluacion_id` en `asistencia_alumnos` por rango de fecha contra el operativo y sus parciales. Las 81 filas históricas de `clases_impartidas` NO se tocan (T4). Dry-run por defecto. |

---

## `_peligrosos/` — escriben o borran SIN guarda

No ejecutar nunca "para ver qué hace". Se conservan porque documentan cómo se
descubrió el esquema, no porque haya que volver a correrlos.

| Script | Daño real |
|---|---|
| `probe-materia-crud.mjs` | `DELETE ?id=not.is.null` → **vacía una tabla de materia completa**, luego inserta |
| `probe-hoja-schema.mjs` | `DELETE ?id=not.is.null` → **vacía la tabla que reciba** |
| `verificar-constraints-asistencias.mjs` | inserta filas `TEST*` y luego hace `DELETE calendario_escolar?ciclo_escolar=eq.2026-2027` → **borra el calendario del ciclo real** |
| `verificar-asistencias.mjs` | inserta y upserta filas reales en `clases_impartidas` / `asistencia_alumnos` |
| `test-consolidacion-tutores.mjs` | crea tutores y relaciones reales, luego intenta limpiarlos (si falla a la mitad, quedan huérfanos) |
| `probe-etiquetas.mjs` | inserta y borra `id=1` de `ETIQUETAS (STATUS)` |
| `probe-insert-hint.mjs` `2` `3` `4` | `POST` de filas basura a tablas de materia y a `COMENTARIOS` |
| `probe-comentarios.mjs` `2` `3` `-chat` | `POST` a `COMENTARIOS` |
| `probe-etiqueta-cols` · `probe-etiquetas2` · `probe-foto-col` · `probe-materia-cols` · `probe-materia-empty` · `probe-personal-comment` · `probe-profesores2` · `probe-status-cols` · `probe-status-schema` | `POST` de filas de prueba para descubrir columnas por el mensaje de error |

> Sospecha abierta, no confirmada: el calendario del ciclo operativo aparece hoy con 0 días.
> `verificar-constraints-asistencias.mjs` borra exactamente `calendario_escolar` del ciclo
> `2026-2027`. Vale la pena descartarlo antes de rehacer el calendario a mano.

## `_archivo/` — un solo uso, ya consumido

Historial, no herramientas. **No re-ejecutar.** Incluye:

- **Parches de código fuente** (`patch-*.py`, `patch-perfil-estatus.mjs`, `fix-div-tags.js`) — reescribían archivos de `app/`; ya están aplicados, volver a correrlos corrompe el código actual.
- **Subdivisión de agosto** (`7-subdivision-*.mjs` + sus `.csv`/`.md` de salida) — reasignación de grupos ya aplicada. Los scripts leen los CSV vecinos, por eso se movieron juntos.
- **Ajustes de datos de septiembre** (`quitar-3ro-extras`, `registrar-alumnos-extras-3ro`, `actualizar-inscripciones-listas`) — altas/bajas de alumnos concretos de un día concreto.
- **Creación de tablas y buckets** (`crear-tablas-*.mjs`, `crear-bucket-documentos.mjs`) — el equivalente vivo y versionado son los `.sql` de `supabase/`.
- **Migraciones ejecutadas** (`migrar-credenciales-iniciales`, `migrar-catalogo-desde-tablas`, `migrar-nombres-fisicos`).

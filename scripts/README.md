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

**Una suite ya no necesita este paso:** `test-fechas.mjs` importa
`../lib/escolar/fechas.ts` y Node lo ejecuta solo (type stripping, Node ≥ 22.6). Es el
piloto del PROMPT H, y es la única que puede hoy: su módulo no tiene imports relativos.
Las otras 38 lo intentaron y no: el resolver ESM de Node exige la **extensión exacta**
(`.ts`) en cada import relativo, y `lib/escolar/` escribe 142 imports sin extensión en 59
archivos. Medición completa y las dos salidas posibles, en
`docs/historial/informes/INFORME-PROMPT-H-TS-NATIVO.md`.

**Ojo con correr dos tandas de suites a la vez.** Cuatro suites que se transpilan solas
(`test-materia-identidad`, `test-materia-avance`, `test-columnas-calificaciones`,
`test-mapeo-columnas-materia`) comparten la MISMA carpeta `scripts/.tmp-tests/`: cada una
la vacía al arrancar. Dos procesos en paralelo se pisan y dan fallos falsos y distintos en
cada corrida. En serie, 39/39.

## Clasificación

| Etiqueta | Significado |
|---|---|
| `LEE` | Solo `GET`. Ejecutable sin autorización. |
| `LEE(fs)` | Solo lee archivos del repo. No toca la base. Ejecutable sin autorización. |
| `LEE(red)` | Solo lee, pero **por la red**: necesita credenciales de `.env.local`. No escribe en la base ni en el repo salvo su archivo de salida. **No es `LEE(fs)`** aunque empiece por `gen-`: sin red no corre. |
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
| `test-validacion.mjs` | `lib/validacion/esquemas-puro.ts` y `leer-form-data.ts` (PROMPT K): 70 comprobaciones de que la entrada se acepta o se rechaza con el mensaje de siempre, y de que el helper devuelve la MISMA forma que las actions (`{ok, datos}` / `{ok, error}`). Importa el FUENTE `.ts` directo: son módulos puros que solo importan `valibot` |
| `test-auditoria-ciclo-f0..f8.mjs` | detectores de regresión por fase (lectura de código estático) |
| `test-auditoria-permisos.mjs` | (PROMPT-2/T5) detector de regresión de la centralización: ninguna Server Action pregunta por rol, toda action llama a `exigir()` (salvo las públicas de `portada.ver` y la delegación verificada de etiquetas), capacidades ⇄ §5, y el rol nunca se lee de FormData/parámetros |
| `test-rediseno-oceano.mjs` | (rediseño Océano) los módulos puros que preparan las fases 1-7: `materia/facetas-materia` (selector de ámbito + buscador), `alumno/grupos-campos-personales` (reparto personal/médico, verifica que ningún campo de `CAMPOS_PERSONALES_PRIMARIOS` quede sin apartado), `asistencia/asistencia-tabular` (resumen por parcial → forma de boleta), `navegacion/mapa-navegacion` (tres niveles × cinco roles, incluido que el técnico no vea contenido académico ni apagado), `navegacion/notificaciones-alumno` (comentarios + justificaciones en una lista ordenada) y `buscar-en-filas` (qué fila es de qué alumno: el alcance del tutor). **180 verificaciones**. Transpila en `.tmp-oceano`; no toca la base |
| `gen-estado.mjs` | (`LEE(fs)`) **recolector**: junta el estado del repo en un solo `.panel/estado.json` (ignorado por git) y añade una línea a `.panel/historico.jsonl`. No mide casi nada por su cuenta — ejecuta una **lista blanca explícita** de fuentes (`test-orden --json`, `diag-restyle-oceano --json`, `verificar-estado-actual --json`, `verificar-docs --json`) y solo calcula lo que nadie más mide: git y tamaños. El coste de arranque **ya no se calcula aquí**: lo mide y lo vigila `verificar-docs.mjs`, y el panel lo lee de su JSON para no tener dos fuentes de la misma cifra (R6). La lista blanca es a mano y no hay `readdir`: en esta carpeta hay scripts que vacían tablas en producción. El histórico existe porque el problema del repo no es que un número esté mal, es que **empeora solo** (lint 140→151, archivos >1 000 líneas 4→7) — el panel tiene que decir «+11», no «151». `--salida=X.json`, `--sin-historico` |
| `gen-panel.mjs` | (`LEE(fs)`) **renderer**: dibuja `.panel/estado.json` como `.panel/panel.html`, autocontenido (el JSON va incrustado, porque `fetch` desde `file://` lo bloquea CORS y levantar un servidor para mirar un panel es la fricción que hace que no se mire). **No mide nada**, y es deliberado: un número que se calculara aquí no estaría en el JSON, no tendría histórico y no se podría verificar. Zonas: técnico, frontend, datos, documentación y pendientes humanos; arriba «atender primero» (roto + lo que empeoró) y abajo **lo que el panel NO mide**, porque una zona en silencio entrena a creer que está bien. Los dos juntos: `npm run panel` |
| `gen-informe.mjs` | (`LEE(fs)`) **el informe para personas**: `docs/informes/<AAAA-MM>.md`. No mide nada — lee `test-orden --json`, `verificar-docs --json`, `.panel/historico.jsonl`, `pendientes.json`, `INVARIANTES.md`, `RUMBO.md` y git. Lo que no existía en ningún sitio es su §1: **de los 16 invariantes, cuáles vigila una máquina y cuáles dependen de que alguien se acuerde**. El listón para contar como vigilado es duro —violar el invariante tiene que hacer fallar la regla—, y por eso salen 3 y no 6: una tabla que se infla sola es lo que este informe evita. Su §2 enseña **código real** que hoy cumple el principio, con el archivo elegido por el script y no clavado a mano. Si el ensayo gana o pierde una sección, el script **para**: la tabla de vigilancia es a mano y no puede quedarse corta en silencio. `--stdout`, `--salida=X.md` |
| `gen-contexto.mjs` | (`LEE(fs)`, aunque es `gen-`) arma el **contexto acotado** de un trabajo: se le pasan los archivos que se van a tocar y devuelve la capa de cada uno y qué exige, las suites que lo cubren y los términos del `GLOSARIO.md` que de verdad aparecen. **Nada se reescribe dentro del script** — todo se lee de su fuente, porque copiarlo crearía la segunda fuente que R6 prohíbe. Emite un documento distinto por agente, como manda `AGENTS.md` §Reparto: `--agente=cline` (por defecto) un **paquete de instrucciones** —presupuesto cerrado de `docs/00-INDICE.md`, qué no tocar y el CONTRATO §1—, y `--agente=claude` un **brief de diagnóstico** —qué está ya medido y por qué script, qué es deuda declarada y no un bug, qué pendientes tocan esos archivos, qué queda fuera de la campaña de `RUMBO.md` y, al final, los puntos ciegos: dónde no hay instrumento—. `--tareas` lista las tareas; `--salida=X.md` escribe a archivo |
| `test-documentos-permisos.mjs` | `lib/escolar/documentos-permisos-puro.ts` — los tres predicados de nivel (`puedeVer`/`puedeSubir`/`puedeEliminar`) con la tabla COMPLETA incluido `null`, la jerarquía `eliminar ⊃ subir ⊃ ver` por sus dos caminos (predicados y `nivelMayor`), y `rutaCarpeta`. Creada en el PROMPT B4: esas tres funciones deciden qué botones ve el usuario en Documentos y **no las cubría ningún test**, porque vivían dentro de un módulo con 14 funciones de I/O. Lleva documentado un hallazgo que NO se arregló ahí: `rutaCarpeta` entra en bucle infinito con un ciclo en `parent_id` |
| `test-uis-pendientes.mjs` | los módulos puros de las UIs pendientes (2026-09-17): `administracion/flujos-puro` —máquinas de estado de citas y constancias, gravedades y `sanearTexto`—, `materia/actividades-puro` —el estado ACTIVA/VENCIDA **derivado** de la fecha límite, no guardado, más el reparto de pesos y el orden de presentación— y el agrupado en hilos de `mensajes-internos`. **62 verificaciones.** Las que más valen son las que prohíben un salto: una cita `pendiente` no puede pasar a `finalizada` sin aceptarse, y una constancia no se entrega sin aprobarse |
| `test-orden.mjs` | **no prueba un módulo: prueba el REPO.** La mitad mecánica de `docs/normativo/ORDEN.md` — capas (`lib/escolar` sin alias `@/`, `lib/` sin importar `app/`, cliente sin `lib/supabase`, action sin llamar a otra action, `-puro` sin I/O), scripts (`test-`/`diag-`/`probe-` que no escriben), raíz cerrada, tamaño de archivo, **composición de UI** (C11: ninguna pieza de presentación definida a mano en dos archivos — hoy 21 copias sobrantes, el plan que las baja es `MATRIZ-UX` §7 F-UX1) y **entrada validada** (C12: ninguna action lee `formData` a mano). Doce reglas: diez **duras** (umbral 0, se cumplen hoy) y dos **trinquete** (deuda declarada con prompt asignado; fallan solo si el número sube). Neutraliza comentarios y literales de cadena antes de medir, porque el grep ingenuo daba falsos positivos reales. `--detalle` lista cada archivo |
| `test-permisos.mjs` | (PROMPT-2/T1/T2 + PROMPT-3 + PROMPT-4) pruebas puras de `lib/auth/permisos.ts`: transpila los módulos puros de `lib/auth`, valida `puede()` con los **5 roles** y compara el código contra la §4 completa del MATRIZ («Código ⇄ §4 (los 5 roles)», regla: la matriz implementada coincide con el documento) |
| `test-reactivacion-inscripciones.mjs` | (PROMPT-4/T1) suite pura (16 checks) que transpila `ciclo-estado-puro.ts`: la fila marcada con `decision_manual` jamás se reactiva/desactiva; sin marcas se conserva el comportamiento previo |
| `test-borrar-paso.mjs` | (PROMPT-4/T4) suite pura (10 checks) que transpila `borrar-paso-puro.ts` (`calcularBloqueosPaso`): académico con inscripciones bloquea, horario con actividad bloquea, roster del OPERATIVO bloquea, BORRADOR permite, evaluaciones nunca bloquea |
| `test-calendario-periodo-f5.mjs` · `test-ciclo-calendario.mjs` · `test-asistencia-contexto.mjs` · `test-activacion-ciclo-f8.mjs` | ciclo / calendario / contexto |

### Verificadores de documentación (`LEE(fs)`) — que los documentos no mientan

No prueban código: prueban que lo que los agentes leen siga siendo verdad. Los dos
salen con código 1 si divergen, y los dos exponen `--json` para que el panel lea su
medición en vez de recalcularla.

| Script | Qué vigila |
|---|---|
| `verificar-estado-actual.mjs` | Que `ESTADO-ACTUAL.md` siga siendo «qué es verdad hoy»: el `HEAD:` declarado es ancestro del real y no más de 10 commits atrás, el nº de suites coincide con `scripts/test-*.mjs`, y el archivo respeta su propio límite de ~150 líneas. Nació porque la cabecera llegó a estar 31 commits atrás, decía 34 suites habiendo 36, y tenía 517 líneas |
| `verificar-docs.mjs` | Que el **sistema** de documentos siga siendo utilizable. (1) **Rutas vivas**: ningún documento del presente cita un archivo retirado — el caso que lo originó es `MATRIZ-UX.md` señalando `ui/barra-navegacion.tsx` tres commits después de borrarlo. (2) **Coste de arranque**: los 6 archivos de lectura obligatoria por debajo de su techo en tokens, que es la única cifra que se paga en CADA sesión. `docs/historial/` **no** se escanea a propósito: citar lo que ya no existe es lo que lo hace historial. Las rutas citadas a propósito (`app/api/`, las cuarentenas retiradas, las piezas aún no construidas) van en una lista de excepciones **con su motivo**, y se imprimen en cada ejecución para que no sirvan de escondite |

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
| `diag-alcance-tutor.mjs` | (Fase 4 del rediseño) prueba de solo lectura del ALCANCE del tutor: (A) un CURP ajeno NO está en `listarCurpsDeTutor` (predicado que reusan calificaciones, horario y asistencia) y (B) el criterio de fila de `buscar-en-filas` (el módulo puro REAL, transpilado) devuelve 1 fila por alumno, nunca la tabla del grupo. Solo `GET`. Uso: `node scripts/diag-alcance-tutor.mjs [--tutor=<id>]` |
| `diag-materias-alumno.mjs` | cobertura `tabla_legacy` + RPC de perfil |
| `diag-restyle-oceano.mjs` | (rediseño Océano) avance de la migración visual: ocurrencias del tema glass CLARO vs tokens `--oc-*` del tema OSCURO, por archivo y por fase del plan. Sin Supabase: solo lee `app/**/*.{tsx,css}`, excluye `app/_borrador/`. Es el diagnóstico de los pasos 1 y 6 del CONTRATO en las fases 1-7. Uso: `node scripts/diag-restyle-oceano.mjs [--json] [--fase=N]` |
| `diag-preview-reparar-tabla-legacy.mjs` | simula el preview de reparación sin escribir |
| `diag-relaciones-supabase.mjs` | mapa de FKs reales |
| `diag-duplicados-ciclos.mjs` · `diagnostico-ciclo-activo-bug.mjs` · `8-diagnostico-ciclos.mjs` | duplicados y exclusividad de ciclo |
| `probe-*` (los 16 que quedan aquí) | esquema y contenido de tablas: columnas, permisos, OpenAPI, CURPs duplicadas |
| `verificar-credenciales-iniciales.mjs` · `verificar-login-credenciales-iniciales.mjs` · `verificar-tablas-tutores.mjs` | credenciales y tutores |
| `6i/6j/6k-*.mjs` · `7-diagnostico-materias-alumnos.mjs` · `fase10-*.mjs` | diagnósticos de bloques anteriores, siguen siendo válidos |
| `check-supabase-public.mjs` · `check-documentos-route.mjs` | conectividad y rutas |
| `gen-materias-list.mjs` · `gen-registros-list.mjs` · `gen-tablas-desde-supabase.mjs` · `sync-decoraciones.mjs` | generan listados en disco (`LEE(fs)` + escritura de archivos del repo, no de la base) |
| `gen-matriz-permisos.mjs` | `LEE(fs)`. Regenera la §5 de `docs/sistema/MATRIZ-PERMISOS.md` desde `app/actions/**`. `npm run gen:matriz`; con `--check` no escribe y sale 1 si hay desfase. Respeta la §4 (la matriz de roles, que se edita a mano). |
| `gen-invariantes.mjs` | `LEE(fs)`. Escribe `docs/normativo/INVARIANTES.md` con las 16 líneas `INVARIANTE:` del ensayo (`filosofia.estructural`), que sigue siendo la fuente. `npm run gen:invariantes`; con `--check` no escribe y sale 1 si hay desfase. Si una sección no declara invariante, para y lo reporta sin escribir. |
| `gen-rumbo.mjs` | `LEE(fs)`. Reescribe **solo** el bloque GENERADO de `RUMBO.md`: últimos 10 commits (`git log`), pendientes abiertos de riesgo alto (`docs/sistema/pendientes.json`) y reglas de `test-orden --json` que no están en 0. `npm run gen:rumbo`; con `--check` no escribe y sale 1 si hay desfase. La cabecera y «Fuera de alcance ahora» se editan a mano. |
| `gen-seccion4.mjs` | (PROMPT-3) Regenera la **tabla §4** de `docs/sistema/MATRIZ-PERMISOS.md` desde `lib/auth/permisos.ts` (la matriz implementada), para que documento y código no diverjan. `node scripts/gen-seccion4.mjs`; no lleva `--check`. |
| `gen-tipos-db.mjs` | (**PROMPT J**) `LEE(red)` — el único generador que **no** es `LEE(fs)`: lee el esquema REAL por la red y escribe `lib/supabase/database.types.ts`, con la cabecera «no editar a mano» dentro. `node scripts/gen-tipos-db.mjs` lo regenera; `--check` no escribe y sale 1 si el archivo del repo dejó de coincidir con la base — mismo contrato que `gen-matriz-permisos --check`. La versión de la CLI va **clavada** en el script porque `--check` compara su salida. **Hoy no se puede ejecutar en esta máquina**: `supabase gen types --db-url` exige Docker (arranca `postgres-meta`) y `--project-id` exige una sesión de la CLI. Ver `docs/historial/informes/INFORME-PROMPT-J-TIPOS-DESDE-LA-BASE.md`. |
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

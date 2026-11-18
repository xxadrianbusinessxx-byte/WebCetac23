# INFORME — Propiedad de materias: capturar no da la materia, la asigna el técnico

**Fecha:** 2026-11-17 · **Base:** `29ef742` · **Pedido por el usuario en chat**: permitir
que Servicio Escolar suba asistencias **sin** quedarse con la materia, o reemplazar el
sistema por una configuración desde el técnico. Eligió **las dos fases**, y lo implementa
Claude.

---

## 1. Qué se hizo

### Fase 1 — subir asistencia es CAPTURAR

| Antes | Ahora |
|---|---|
| Subir llamaba a `traspasar_materia_a_profesor`: quien subía se quedaba con la materia y con los registros de los demás | Subir no toca `asignaciones_profesor`. Nadie se queda con nada por capturar |
| Servicio Escolar: bloqueado donde la materia tenía dueño (guarda del 2026-11-16); dueño de lo que subía donde no lo tenía | Sube en cualquier materia sin quitársela a nadie. La guarda se retira |
| El directivo, al subir, también se quedaba con la materia | Captura igual que Servicio Escolar (decisión del usuario) |
| Clave del UPSERT con `profesor_id` dentro: dos capturistas = dos filas | Clave **natural**: alumno + materia + día (`curp,grupo_materia_id,fecha`) y materia + día para clases |
| Justificantes: el dueño de una falta era quien la capturó | El dueño es el profesor **asignado** a la materia; sin asignación, la ve cualquier profesor |

| Archivo | Qué cambió |
|---|---|
| `lib/escolar/asistencia/atribucion-profesor.ts` | claves naturales; ya no devuelve asignación; reglas 3 y 4 reescritas |
| `lib/escolar/asistencia/asistencia-plantillas.ts` | `confirmarAsistencias` sin traspaso; los «previos» se leen por materia, no por quien subió |
| `app/actions/asistencias.ts` | fuera la guarda de alcance (y sus imports) |
| `lib/escolar/asistencia/guarda-alcance-puro.ts` · `scripts/test-guarda-alcance.mjs` | **retirados**: su única razón era el traspaso |
| `lib/escolar/catalogo/asignaciones-profesor.ts` | `profesorActivoDeMateria` → `listarDuenosActivosDeMaterias` (lote, una consulta) |
| `lib/escolar/asistencia/justificaciones-puro.ts` | `asignarDuenoPorMateria` (pura) |
| `lib/escolar/asistencia/justificacion-dias.ts` | aplica el dueño asignado a cada línea del día |
| `lib/escolar/materia/traspaso-materia.ts` | marcado sin consumidores; se conserva (R8) |
| `supabase/agregar-unicidad-clases-por-materia.sql` | **nuevo**: UNIQUE `(grupo_materia_id, fecha)` en `clases_impartidas` |
| `scripts/diag-propiedad-materias.mjs` | **nuevo**, solo lectura |
| suites `test-atribucion-profesor`, `test-traspaso-materia`, `test-justificacion-circuito` | la regla nueva |
| `lib/auth/permisos.ts` | solo el comentario del rol Servicio Escolar; ninguna capacidad cambia |

Commit: `a1f1546`.

### Fase 2 — la propiedad la asigna el técnico, un dueño activo por materia

| Antes | Ahora |
|---|---|
| Técnico › Asignaciones permitía VARIOS dueños activos de la misma materia | Asignar **reemplaza** al dueño activo (pasa a inactivo, con `hasta`; nunca se borra) |
| El selector de materias no decía de quién era cada una | Cada materia muestra «actual: <profesor>» o «sin profesor», y un aviso antes de reemplazar |
| El alta en lote por grupo asignaba todas las materias del grupo | Asigna solo las que no tienen profesor (o ya son suyas); las de otro profesor **no se tocan** y se cuentan aparte |
| La exclusividad no existía en la base | UNIQUE parcial `(grupo_materia_id) WHERE activo` |

| Archivo | Qué cambió |
|---|---|
| `lib/escolar/catalogo/asignacion-materia-puro.ts` | **nuevo**: `planAsignarMateria`, `bloqueaPorOtroDueno`, `errorMateriaConOtroDueno` |
| `lib/escolar/catalogo/asignaciones-profesor.ts` | `crearAsignacion` sigue el plan (desactiva antes de activar) y acepta `reemplazar`; la oferta trae `profesorActual` |
| `app/actions/asignaciones-profesor.ts` | el tipo de entrada suma `reemplazar` (la action no cambia) |
| `app/components/asignaciones-admin.tsx` | dueño actual en el selector, aviso de reemplazo, lote que no reemplaza |
| `supabase/agregar-unicidad-dueno-materia.sql` | **nuevo**: un dueño activo por materia |
| `scripts/test-asignacion-materia.mjs` | **nueva** suite (19 checks) |
| `docs/sistema/MAPA-DEL-SISTEMA.md` | «quién es el dueño de una materia» y «la falta la justifica otro» |

## 2. Quién lo ejecutó y qué pudo / no pudo hacer

**Claude**, a petición del usuario. Toca `lib/auth/` (un comentario) y la fuente de verdad
de un dominio, que el reparto no delega sin revisión.

| Pudo | No pudo / no hizo |
|---|---|
| Medir la base en solo lectura antes de decidir (índices reales, filas, asignaciones) | Aplicar el SQL: es DDL y lo aplica la persona (o lo autoriza) |
| Probar la regla en suites puras | Probar con sesión real: ninguna cuenta del rol tiene clave conocida |
| Hacer el commit **solo con sus archivos** | — |

**Trabajo en paralelo.** Mientras se hacía este cambio, otra sesión dejó en el mismo
árbol, sin commitear, el trabajo de «Comentario personal» (`permisos.ts`, `capacidades.ts`,
`pendientes.json`, `ESTADO-ACTUAL.md`, `scripts/README.md`, entre otros). En los archivos
compartidos, el commit lleva solo los cambios de este trabajo, aplicados sobre `HEAD`; lo
suyo queda intacto en el árbol de trabajo.

## 3. Cómo se ejecutó y se midió

**El cambio de diseño respecto a lo que se le explicó al usuario.** La primera propuesta
de la Fase 1 era guardar la fila «a nombre del dueño» con una columna `capturado_por`. Al
leer `CONTRATO-DE-CAMBIO.md` §3 apareció un motivo de rechazo inmediato: *escribe
asistencia sin `profesor_id` de sesión*. Se cambió a la forma que lo respeta y además no
necesita columna nueva: `profesor_id` sigue siendo de la sesión (es **autoría**: quién
capturó) y la propiedad vive solo en `asignaciones_profesor`. Lo que impedía duplicar era
el traspaso; ahora lo impide la clave natural.

**Medición antes** (2026-11-17, solo lectura):

| | |
|---|---|
| `asignaciones_profesor` | 1 fila, **0 activas** (profesor 19, inactiva) |
| `asistencia_alumnos` · `clases_impartidas` | **0 · 0** filas (vaciadas el 2026-11-16 a petición del usuario) |
| UNIQUE `asistencia_alumnos (curp, grupo_materia_id, fecha)` | **existe** (`asistencia_alumnos_curp_gm_fecha_uidx`) |
| UNIQUE `clases_impartidas (grupo_materia_id, fecha)` | **no existe**; 0 duplicados por esa clave |
| `asistencia_traspasos_historico` | 0 filas |

**Por qué el alta en lote no reemplaza.** Asigna TODAS las materias de un grupo a UN
profesor. Con «asignar = reemplazar» habría dejado sin materia, de un clic, a todos los
demás profesores del grupo. El reemplazo solo ocurre en el alta individual, donde el técnico
ve al dueño actual; la decisión (`bloqueaPorOtroDueno`) es pura y tiene suite.

**Por qué desactivar ANTES de activar.** La UNIQUE parcial no admite dos activos ni un
instante. Si el segundo paso fallara, la materia queda sin dueño (se reintenta), nunca con dos.

**Verificación (Fase 1):** `test-atribucion-profesor` 28/28 · `test-traspaso-materia` 26/26 ·
`test-justificacion-circuito` 48/48 · `test-orden` 20/20 · `npx tsc --noEmit` limpio ·
`npm run test:ci` en un worktree con SOLO el cambio de la Fase 1: todo en verde salvo el
build, que Turbopack no corre con un `node_modules` enlazado fuera del worktree; el build se
corrió en el árbol principal.

**Verificación (Fase 2):** `test-asignacion-materia` 19/19 · `test-orden` · `tsc` · lint ·
`npm run test:ci` (ver el commit).

## 4. Qué normas respetó (CONTRATO §2)

| Norma | Cómo |
|---|---|
| Identidad | `profesor_id` sigue saliendo de la sesión; nunca la CLAVE |
| Fuente única | la propiedad, solo en `asignaciones_profesor`; se quitó la segunda vía (el traspaso al subir) |
| Capas | la decisión nueva es pura (`asignarDuenoPorMateria`); la lectura, en `lib/`; la action solo pierde código |
| Datos | SQL aditivo y reversible; ninguna fila tocada |
| UPSERT | la clave de conflicto apunta a una UNIQUE declarada en `supabase/` |
| R8 | la RPC de traspaso y su historial se quedan en la base; el envoltorio TS se marca sin consumidores |
| C6 | el diagnóstico no escribe: la sonda con UPSERT vacío que se probó primero se retiró por la regla, y el índice se comprueba con SQL de lectura |

## 5. ¿Sigue la filosofía y la arquitectura?

| Principio | Veredicto |
|---|---|
| Capacidad ≠ alcance | **Sí.** Ninguna capacidad cambia; cambia de dónde sale el dueño |
| Una fuente de verdad por dominio | **Mejor que antes.** La propiedad tenía dos escritores (técnico y subida); ahora uno |
| Autoría ≠ propiedad | **Separadas.** `profesor_id` de la fila = quién capturó; asignación = de quién es la materia |

## 6. Desviaciones y decisiones propias

Del usuario (preguntadas): las dos fases; lo implementa Claude; el directivo solo captura;
un profesor que sube una materia que no tiene asignada **puede** (es captura, no propiedad).

Mías:
- **Sin columna `capturado_por`**: `profesor_id` de la sesión ya es la autoría (ver §3).
- **Retirar la guarda del 2026-11-16** y su suite: sin traspaso, no hay nada que proteger.
- **Los «previos» de la plantilla** (sin cambios / actualizados) se leen por materia y no
  por quien sube: con la clave natural, el previo es la fila que se va a sobrescribir.
- **Anular** sigue acotado a lo que la sesión capturó (`profesor_id` de sesión): si otro
  recapturó encima, ya no es suyo.

## 7. Lo no verificado / pendiente

- ~~El SQL no está aplicado~~ **Aplicado el 2026-11-17** (los dos archivos), por Claude con
  `apply_migration` a petición del usuario. Verificado en `pg_indexes`:
  `clases_impartidas_gm_fecha_uidx` y `asignaciones_profesor_un_dueno_activo_uidx` existen.
- **Nadie ha capturado con sesión real** con el código nuevo.
- **El reemplazo desde Técnico no se ha ejercido con sesión.**
- **0 asignaciones activas**: hasta que el técnico asigne (pendiente
  `asignar-materias-desde-tecnico`), cualquier profesor ve y justifica cualquier falta.

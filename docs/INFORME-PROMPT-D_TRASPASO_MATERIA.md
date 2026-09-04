# INFORME — Prompt D: traspaso TOTAL de una materia al profesor que la sube

Fecha: 2026-09-04 · Ejecutado según `docs/PROMPT_CLINE_D_TRASPASO_MATERIA.md`
sobre el árbol del Prompt C (commit `8e0e0e8`), sin revertirlo.
No se ejecutó SQL (RPC preparada, idempotente y documentada para el directivo).

> Nota previa: en esta misma sesión se corrigió un error de sintaxis reportado
> en el SQL del Prompt C (`42601 … AS t(tabla text, …)`): las listas de
> columnas con tipos no son válidas en un `FOR … IN` de PL/pgSQL. Se
> reescribieron los dos bucles (`v_fk` y `v_idx`) con `UNION ALL` sin tipos
> (`supabase/agregar-atribucion-profesor-asistencia.sql`). Ver errata al final
> del informe C.

---

## Implementado

### R-1 · RPC transaccional `traspasar_materia_a_profesor` (autoridad única)
`supabase/crear-rpc-traspasar-materia.sql` (idempotente, `CREATE OR REPLACE`):

- Tabla nueva `asistencia_traspasos_historico` (archivo, **nunca borra datos**):
  misma forma de la fila origen + `tabla_origen`, `fila_origen_id`,
  `profesor_id_origen`, `profesor_clave_origen`, `profesor_id_destino`,
  `traspasado_en`.
- Función `public.traspasar_materia_a_profesor(p_grupo_materia uuid,
  p_profesor_id smallint) RETURNS jsonb`. En UNA transacción:
  1. valida que el grupo_materia y el profesor existan;
  2. desactiva (`activo=false, hasta=now()`) cualquier otra asignación ACTIVA
     de la materia (nunca DELETE);
  3. crea/reactiva la asignación del destino (`activo=true, hasta=null`,
     `desde=now()` solo si es nueva). Si la UNIQUE legacy
     `(grupo_materia_id, profesor_clave)` bloquea por CLAVE compartida, la RPC
     **falla alto** con mensaje claro (no busca ni reconcilia por contraseña);
  4. migra las filas de `clases_impartidas` y `asistencia_alumnos` de esa
     materia: SOLO cambian `profesor_id` (y `profesor_clave` → NULL). Colisión
     de UNIQUE (destino ya tiene fila para la misma materia/grupo/fecha): la
     fila del destino (o la más reciente de cada clave natural) es la
     autoritativa y la del profesor anterior se **archiva** (INSERT en el
     historial + DELETE del activo = mover, nunca perder);
  5. devuelve conteos: `asignaciones_desactivadas`, `asignacion_destino`
     (`creada | reactivada | ya_activa`), `clases_migradas/archivadas`,
     `asistencia_migradas/archivadas`.

### R-2 · El traspaso se dispara al confirmar la plantilla
- `lib/escolar/traspaso-materia.ts`: helper TS que invoca la RPC y traduce su
  jsonb (patrón `eliminarCicloRpc`/`activarCicloOperativoAtomico`). Si la RPC
  no está desplegada → `ERROR_RPC_TRASPASO_NO_DESPLEGADA` y NO se escribe nada.
- `confirmarAsistencias` (`lib/escolar/asistencias.ts`): orden crítico
  **1) resolver grupo_materia_id → 2) RPC traspasar → 3) UPSERT**. La RPC se
  llama ANTES de escribir, así las filas previas de A ya son de B cuando llega
  el UPSERT (sin colisiones en el caso común).
- `asegurarAsignacionActiva` (D-1 aditivo / D-2 rama por clave) **se eliminó**
  por completo: desaparece con ella la búsqueda por `profesor_clave`.

### R-3 · Reversibilidad
Sin código extra: que A vuelva a subir la materia ejecuta la misma RPC en
sentido contrario. Cubierto por el test (ida y vuelta con conteos estables).

### R-4 · Panel del directivo
`AsignacionesProfesorAdmin` (reactivado en Prompt C) ahora muestra la
asignación **activa** actual y las desactivadas con la fecha de `hasta`
("inactiva · DD/MM/AAAA — dejó de impartirla el …"), para ver quién la tuvo
antes.

### Regla 4 · `profesor_clave` dejó de ser criterio (sitios donde se eliminó)
- `lib/escolar/asistencias.ts`:
  - `asegurarAsignacionActiva` eliminada (buscaba por `profesor_id` y por
    `profesor_clave` legacy);
  - `profesorImparteEnGrupo` → solo `profesor_id`; sin él → `false`;
  - `obtenerEstadosAsistenciaAlumno` → acota por `profesor_id` (o nada);
    sin la columna devuelve `[]` (no filtra el aporte global ajeno);
  - `analizarPlantillaAsistencia` (previos "sin cambios") → acota por
    `profesor_id`; sin él no compara previos;
  - `confirmarAsistencias` → ya no escribe `profesor_clave` en las filas
    nuevas (Prompt C) y ya no la usa como identidad.
- `app/actions/asistencias.ts`: maestro/directivo exigen `sesion.profesorId`
  (sesión vieja → volver a iniciar sesión); `actionAnularAsistenciaProfesor`
  y la justificación del profesor ya no caen a `profesor_clave`.
- RPC SQL: no hay `WHERE/AND/JOIN` por `profesor_clave`; solo `SET
  profesor_clave = NULL` (migración) o conservación del origen en el historial.

---

## Validación

- `npx tsc --noEmit` → 0 errores.
- `npm run build` (Next 16) → exit 0.
- `eslint` sobre archivos tocados → 0 problemas.
- Suites puras en verde (8):
  `test-evaluaciones` 30/30 · `test-fechas` 22/22 ·
  `test-asistencia-parciales` 19/19 · `test-asistencia-contexto` 6/6 ·
  `test-reparar-tabla-legacy` 15/15 · `test-justificacion-por-clase` 13/13 ·
  **`test-atribucion-profesor` 26/26** (Prompt C) ·
  **`test-traspaso-materia` 26/26 (nuevo, Prompt D)**.
- `test-traspaso-materia.mjs` cubre: A conserva HISTORIA y pierde MATE ·
  columnas de datos idénticas (campo a campo) · HISTORIA intacta · ida y
  vuelta con los mismos conteos · idempotencia (2ª subida 0 traspasos) ·
  colisión (la de B queda activa, la de A se archiva, ninguna se pierde) ·
  estáticos (RPC existe; se llama antes del UPSERT; nada busca por
  `profesor_clave`).

### Prueba del SQL en Postgres local
No hay `psql`/`docker`/`DATABASE_URL` en este entorno (mismo bloqueo ya
documentado para la RPC `eliminar_ciclo` en `OPTIMIZACION_RENDIMIENTO_400_500.md`,
§641-643), así que **no se inventa ejecución**: el SQL se entrega idempotente y
se cubrió con (a) un modelo en memoria fiel al algoritmo y (b) aserciones
estáticas sobre el SQL/código. La ejecución real queda para el directivo.

---

## Límites respetados
- No se ejecutó SQL; no se hizo backfill de las 81 filas históricas (no tienen
  `grupo_materia_id`: ningún traspaso las alcanza hasta que se decida su
  materia/autoría).
- No se corrigieron las CLAVE duplicadas (la UNIQUE legacy puede bloquear la
  co-docencia; la RPC lo reporta con mensaje claro).
- No se tocaron calificaciones, documentos, tutores ni el módulo de ciclo.

---

## Pendiente humano (directivo — en orden)
1. Ejecutar `supabase/agregar-atribucion-profesor-asistencia.sql` (Prompt C,
   ya corregido) y después `supabase/crear-rpc-traspasar-materia.sql` (D).
2. Revisar los `RAISE NOTICE` de FK no creadas por huérfanos (no se esperan
   con el estado actual).
3. Decidir la autoría/materia de las 81 filas históricas de `2DO A RH`.
4. Corregir las `CLAVE` duplicadas de `PROFESORES`.


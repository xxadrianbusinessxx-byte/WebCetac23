# PROMPT D PARA CLINE — Traspaso TOTAL de una materia al profesor que la sube

> Formato `criterios.prompts` §24. **Corrige y completa el Prompt C**, que quedó
> a medias: su `asegurarAsignacionActiva` es ADITIVA (deja a los dos profesores
> activos) en vez de traspasar. Ejecutar sobre el árbol actual, sin revertir C.

---

## OBJETIVO

Que subir la plantilla de asistencias de una materia **traspase esa materia
completa** —asignación **y** registros— al profesor que la sube. El traspaso es
total, reversible y **nunca borra datos**: solo cambia columnas de identidad.

---

## REGLA DE NEGOCIO (decidida por el directivo, no reinterpretar)

> Todos los profesores tienen desbloqueadas todas las materias. El que sube la
> plantilla de una materia se convierte en su dueño: se le traspasa la
> asignación **y todos los registros de asistencia de esa materia**. El profesor
> anterior conserva intactas sus demás materias. Si el anterior vuelve a subirla,
> se le traspasa de vuelta. **Nunca se borra nada: solo cambian los
> identificadores** (`profesor_id` / `profesor_clave` legacy); ninguna otra
> columna de datos se toca.

Ejemplo: A tiene HISTORIA y MATE. B sube MATE →
A se queda con HISTORIA, B tiene MATE y **todo el historial de asistencia de
MATE** pasa a B. Si A vuelve a subir MATE, vuelve a A.

---

## ESTADO ACTUAL (verificado — NO re-investigar)

### Lo que el Prompt C dejó bien
- `supabase/agregar-atribucion-profesor-asistencia.sql` (columnas `profesor_id`
  y `grupo_materia_id`, FK con guarda de huérfanos, índices UNIQUE por materia).
  **Sigue siendo válido; ejecútalo tal cual.** No hay que rehacerlo.
- La resolución de `grupo_materia_id` en `confirmarAsistencias`.
- El rechazo cuando falta `sesion.profesorId`.

### Los dos defectos a corregir

**D-1 · No traspasa: acumula.** `asegurarAsignacionActiva`
(`lib/escolar/asistencias.ts:1288`) busca `(grupo_materia_id, profesor_id = B)`;
al no existir, hace INSERT. **Nunca desactiva la asignación de A.** Resultado
actual: A y B quedan los dos `activo = true` sobre la misma materia.

**D-2 · Rama legacy peligrosa.** Esa misma función tiene un paso que busca la
fila por `profesor_clave`. Como **16 profesores comparten la clave `4321`**, esa
rama puede encontrar la fila de A y reasignarla a B en silencio, mutándola y sin
dejar rastro — y solo por esa rama, no por la principal. **Eliminar ese paso**:
con `profesor_id` como identidad, matchear por contraseña compartida no puede
ser criterio de nada.

---

## RESULTADO ESPERADO

### R-1 · RPC transaccional de traspaso (autoridad única)

`supabase/crear-rpc-traspasar-materia.sql` — idempotente, re-ejecutable:

```
traspasar_materia_a_profesor(p_grupo_materia uuid, p_profesor_id smallint)
```

**Debe ser una RPC, no una secuencia de llamadas PostgREST**, por el mismo motivo
que `activar_ciclo_operativo` y `eliminar_ciclo` del Bloque 17: si el traspaso se
corta a la mitad, los registros de una materia quedan repartidos entre dos
profesores. Una sola transacción, o nada.

Dentro de la transacción, **en este orden**:

1. Validar que `p_grupo_materia` y `p_profesor_id` existen. Si no, `RAISE`.
2. **Asignación:** toda fila de `asignaciones_profesor` de ese `grupo_materia_id`
   con `profesor_id <> p_profesor_id` y `activo = true` →
   `activo = false, hasta = now()`. **Nunca DELETE.**
3. **Asignación destino:** la fila `(p_profesor_id, p_grupo_materia)` se crea o
   se reactiva (`activo = true, hasta = null`, `desde` = now() solo si es nueva).
4. **Registros:** `UPDATE` de `profesor_id` en `clases_impartidas` y
   `asistencia_alumnos` donde `grupo_materia_id = p_grupo_materia`
   y `profesor_id IS DISTINCT FROM p_profesor_id`.
   **SOLO se tocan `profesor_id` y `profesor_clave`** (esta última a NULL).
   Ninguna otra columna: ni `fecha`, ni `clases`, ni `clases_asistidas`, ni
   `curp`, ni `grado/grupo/carrera`, ni `periodo_id`.
5. Devolver los conteos: asignaciones desactivadas, filas de `clases_impartidas`
   migradas, filas de `asistencia_alumnos` migradas.

**Colisión de UNIQUE (caso residual, hay que resolverlo explícitamente).**
El índice único es `(profesor_id, grupo_materia_id, grado, grupo, fecha)` y su
equivalente con `curp`. Si A **y** B ya tienen fila para la misma materia,
grupo y fecha (porque la materia hizo ping-pong entre ambos), el `UPDATE` del
paso 4 viola la UNIQUE.

Regla obligatoria: **la fila que ya pertenece al profesor destino es la
autoritativa**; la fila del profesor anterior que colisiona **no se borra**, se
mueve a una tabla de historial `asistencia_traspasos_historico`
(misma forma que la fila original + `grupo_materia_id`, `profesor_id_origen`,
`profesor_id_destino`, `traspasado_en`), creada por este mismo SQL. Así se
cumple «nunca borra los datos» sin duplicar el registro activo.

### R-2 · El traspaso se dispara al confirmar la plantilla

En `confirmarAsistencias` (`lib/escolar/asistencias.ts`), el orden es
**crítico**:

```
1. resolver grupo_materia_id
2. LLAMAR traspasar_materia_a_profesor(GM, sesion.profesorId)   <-- ANTES
3. UPSERT de clases_impartidas y asistencia_alumnos de esta subida
```

Traspasar **antes** de escribir evita el caso común de colisión: las filas
previas de A ya son de B cuando llega el UPSERT, así que este las actualiza en
lugar de chocar contra ellas.

`asegurarAsignacionActiva` se **sustituye** por la llamada a la RPC (D-1 y D-2
desaparecen con ella). Si la RPC no está desplegada, error explícito y **no se
escribe nada** — mismo patrón que `activarCicloOperativoAtomico`.

### R-3 · Reversibilidad
No requiere código extra: que A vuelva a subir la materia ejecuta la misma RPC
en sentido contrario. Debe quedar cubierto por tests (ida y vuelta, con los
conteos estables).

### R-4 · El panel del directivo refleja el traspaso
`AsignacionesProfesorAdmin` (reactivado en el Prompt C) debe mostrar la
asignación **activa** actual y el histórico de desactivadas con su `hasta`, para
que se vea quién la tuvo antes.

---

## REGLAS ARQUITECTÓNICAS

1. **La RPC es la autoridad única del traspaso.** Ninguna Server Action replica
   sus pasos por separado (§4, y precedente del Bloque 17).
2. **Nada destructivo.** Sin DELETE en `asignaciones_profesor`, sin DELETE en
   las tablas de asistencia. Lo que estorba se desactiva o se archiva.
3. **Solo columnas de identidad.** El traspaso jamás modifica datos de
   asistencia. Un test debe demostrarlo comparando la fila antes/después.
4. **`profesor_clave` deja de ser criterio de búsqueda** en todo el módulo.
5. Aditivo (§10): el SQL del Prompt C no se rehace; este añade la RPC y la tabla
   de historial.

---

## PERMISOS / SEGURIDAD

- La RPC se invoca **solo** desde `confirmarAsistencias`, con
  `p_profesor_id = sesion.profesorId` resuelto en el servidor. Nunca del cliente.
- Solo `maestro` y `directivo` pueden confirmar asistencias (sin cambios).
- El directivo puede desactivar una asignación desde el panel; eso **no** migra
  registros (desactivar ≠ traspasar).

---

## RENDIMIENTO

- El traspaso son 4 sentencias dentro de una transacción, no un bucle por fila.
- Índice por `grupo_materia_id` en ambas tablas de asistencia (el SQL del
  Prompt C ya crea `ix_*_profesor_materia`; verificar que sirve para este filtro
  y, si no, añadir uno por `grupo_materia_id`).
- Cero N+1: una sola llamada a la RPC por subida.

---

## LÍMITES

- No ejecuta SQL: se preparan los `.sql` idempotentes y se documentan.
- No hace backfill de `profesor_id` en las 81 filas históricas (autoría
  irrecuperable: 16 profesores comparten clave).
- No corrige las CLAVE duplicadas ni las hashea.
- No toca calificaciones, documentos, tutores ni el módulo de ciclo.

---

## VALIDACIÓN

1. `npx tsc --noEmit` · `npm run build` · lint sin errores nuevos.
2. Suites existentes en verde (compilar según la cabecera de cada una).
3. **Test puro nuevo** `scripts/test-traspaso-materia.mjs`:
   - A tiene HISTORIA y MATE; B sube MATE → **A conserva HISTORIA activa**, MATE
     queda solo de B;
   - los registros de MATE cambian de `profesor_id`, y **todas las demás
     columnas quedan idénticas** (comparación campo a campo);
   - los registros de HISTORIA de A **no se tocan**;
   - reversible: A vuelve a subir MATE → vuelve a A, con los mismos conteos;
   - idempotente: B sube MATE dos veces → 0 traspasos la segunda;
   - colisión: A y B con fila para la misma materia/grupo/fecha → la de B queda
     activa, la de A va al historial, **ninguna se borra**;
   - nunca se busca ni se escribe por `profesor_clave`.
4. **Prueba del SQL en Postgres local** (mismo método que la RPC
   `eliminar_ciclo` del Bloque 17): esquema sintético fiel, verificar traspaso,
   reversión, idempotencia y el caso de colisión.

---

## INFORME FINAL (§26)

Debe incluir: conteos del traspaso en la prueba local, confirmación explícita de
que ninguna columna de datos cambia, y la lista de sitios donde se eliminó el
uso de `profesor_clave` como criterio.

---

## PENDIENTE HUMANO (directivo)

1. Ejecutar, en este orden:
   `supabase/agregar-atribucion-profesor-asistencia.sql` (Prompt C) y después
   `supabase/crear-rpc-traspasar-materia.sql` (este).
2. Las 81 filas históricas tienen `grupo_materia_id` NULL: **no las alcanza
   ningún traspaso** hasta que se decida su materia y su autoría.

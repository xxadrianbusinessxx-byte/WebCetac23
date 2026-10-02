# PROMPT CLINE — S · Asistencia por materia: guardado seguro y calendario por materia

> Medido el **2026-10-01** sobre `main` (`d7415a7`). Las cifras **no se
> re-investigan**; si alguna no coincide con lo que veas, **dilo antes de seguir**.
>
> Peso según `diag-peso-cambio.mjs` (las 7 rutas): **0/14 → Cline**.
>
> | Parte | Qué | Va a |
> |---|---|---|
> | A | la subida guarda cada materia sin poder equivocarse de materia | Cline |
> | B | el calendario muestra el día por materia y lo pinta verde / naranja / rojo | Cline |
>
> **Dos partes, con parada obligatoria entre ellas.** No las encadenes.

---

## OBJETIVO

Asistencias ya es un solo sistema: la subida del profesor y el calendario del
alumno y del tutor leen la misma tabla, `asistencia_alumnos`. Lo que falta:

1. **Guardado (A).** Que cada subida quede atribuida a la materia correcta
   **sin posibilidad de error**, aunque un profesor suba varias materias del
   mismo grupo y día.
2. **Lectura (B).** Que el calendario muestre **cuántas clases hubo ese día,
   de qué materia y a cuáles faltó**, y que pinte el día así:
   - 🟢 **verde**: asistió a todas las clases registradas del día;
   - 🟠 **naranja**: asistió a **más de la mitad**;
   - 🔴 **rojo**: asistió a **menos de la mitad**, o a ninguna (falta).

La identidad de la materia **ya viaja en la fila**: `grupo_materia_id`.
Este prompt no crea tablas ni columnas.

---

## ESTADO ACTUAL — verificado, no re-investigar

### Escritura (lo que ya está bien)

- `confirmarAsistencias` (`lib/escolar/asistencia/asistencia-plantillas.ts:854`)
  resuelve `grupo_materia_id` **una vez por subida** desde `ctx.materiaClave`,
  llama a la RPC `traspasar_materia_a_profesor` y hace UPSERT con
  `profesor_id + grupo_materia_id` (`atribucion-profesor.ts:177-196`).
- El valor de cada celda es un entero `0..N`. N son los bloques del horario
  oficial **de esa materia** ese día, y se rechaza si lo supera. Celda vacía =
  pendiente: no se escribe nada, y una celda vacía **nunca** cuenta como falta.
- La materia del alumno se valida contra `obtenerAlumnosDelGrupo` (padrón del grupo).

### Restricciones únicas REALES en la base

Comprobado hoy con UPSERT de cuerpo vacío (`[]`, no inserta filas):

| Tabla | Columnas | ¿Existe? |
|---|---|---|
| `asistencia_alumnos` | `curp, grado, grupo, fecha` (la original) | **NO** (ya se quitó) |
| `asistencia_alumnos` | `profesor_clave, curp, grado, grupo, fecha` (legacy) | sí |
| `asistencia_alumnos` | `profesor_id, grupo_materia_id, curp, grado, grupo, fecha` | sí |
| `asistencia_alumnos` | `curp, grupo_materia_id, fecha` | sí |
| `clases_impartidas` | `profesor_clave, grado, grupo, fecha` (legacy) | sí |
| `clases_impartidas` | `profesor_id, grupo_materia_id, grado, grupo, fecha` | sí |

Conclusión: **dos materias del mismo alumno y día NO chocan.** Las filas
nuevas dejan `profesor_clave` en NULL (NULL-distinct), y la UNIQUE por materia
es la que manda. **No toques ningún SQL.**

### Los huecos que este prompt cierra

| # | Hueco | Dónde | Efecto |
|---|---|---|---|
| H1 | **La plantilla no dice de qué materia es.** Encabezado `CURP, NOMBRE, fechas…`, fila `CLASES` con el nombre del profesor; el nombre del archivo tampoco lleva la materia. La materia sale **solo** de lo que se eligió en pantalla. | `generarPlantillaAsistencia` (`asistencia-plantillas.ts:214`) | Si el profesor elige «Física» y sube el Excel de Matemáticas, se guarda como Física. El tope de clases solo lo detecta si los bloques difieren. |
| H2 | Los «previos» que se comparan se buscan por `profesor_id + grado + grupo` con la clave `curp\|fecha`, **sin materia**. | `analizarPlantillaAsistencia`, pasos 6/7 | Con dos materias en el grupo, los conteos «actualizados / sin cambios» del resumen salen mal. |
| H3 | Escritura en lotes de 100 (`TAMANO_LOTE`), una petición por lote. | `confirmarAsistencias` | Si falla el lote 4 de 8, queda la mitad guardada sin que el profesor lo sepa. |
| H4 | Las filas nuevas **no escriben `periodo_id`**. La columna existe y tiene índice (`asistencia_alumnos_curp_periodo_idx`). | `atribuirMateriaAlPlan` | Las filas sin periodo van a crecer con cada subida. |
| H5 | Anular resta 1 a «la fila de mayor aporte» del día, **sin importar la materia**. | `actionAnularAsistenciaProfesor` (`app/actions/asistencias.ts:656`) | Con dos materias el mismo día, puede anular la que no era. |
| H6 | La lectura **suma todas las materias del día** y nunca lee `grupo_materia_id`. | `obtenerEstadosAsistenciaAlumno` (`asistencia-estados.ts:156-170`) | 0 en Matemáticas + 2 en Física = «asistió». El estado es sí/no: 1 de 2 cuenta igual que 2 de 2. |
| H7 | La leyenda usa 🟠 para **pendiente**. | `calendario-asistencia-alumno.tsx:445` | Chocaría con el naranja nuevo. |

### Datos de hoy

- `asistencia_alumnos`: **3 863** filas, **todas legacy**: 0 con
  `grupo_materia_id`, 0 con `profesor_id`. Valores: solo 0 (372) y 1 (3 491).
  Una fila por `(curp, fecha)`.
- `clases_impartidas`: **81** filas, todas sin `grupo_materia_id` ni `profesor_id`.
- 68 filas de asistencia caen fuera de todo parcial.
  Parciales: P1 `2026-08-31..09-25`, P2 `09-28..11-06`, P3 `11-09..12-11`.
- La justificación aprobada escribe **una** fila por día, con
  `profesor_clave='__JUSTIFICACION__'` y `grupo_materia_id` NULL
  (`justificaciones.ts:270`). **No se toca en este prompt.**

---

## DECISIONES YA TOMADAS (no las reabras)

1. **El parcial se deriva de la fecha** (Bloque 14). No se escribe
   `periodo_evaluacion_id`. `periodo_id` sí se escribe (H4): es la raíz.
2. **Pendiente nunca es falta.** Una materia con clases registradas, pero sin
   celda del alumno, queda pendiente y sale del numerador **y** del denominador.
3. **El día se mide en clases, no en materias.** Ejemplo: 2 de 2 en Matemáticas
   y 0 de 1 en Física = 2/3 → naranja.
4. **El porcentaje (calendario, resumen por parcial, vista tabular) pasa a
   medirse en clases:** Σ asistidas / Σ clases registradas. Hoy cuenta días.
   Mismo dato, unidad correcta. **Confirmado por el directivo (2026-10-01).**
5. **Colores, confirmados por el directivo (2026-10-01):**
   - verde = todas;
   - naranja = la **mitad exacta o más** (1 de 2 es naranja);
   - rojo = **menos de la mitad**, incluida la falta completa del día (0 de N).

   El umbral va en UNA constante del módulo puro, con ese comentario.
   Cambiarla no debe tocar nada más.
6. **Filas legacy** (sin `grupo_materia_id` y sin marcador de justificación):
   se muestran como una sola línea, «Registro anterior (sin materia)», con sus
   clases de `clases_impartidas` legacy del mismo grupo y día. **No se
   atribuyen** a ninguna materia y no se hace backfill.
7. **Justificación** (fila marcador): se muestra como línea
   «Justificado: N clases» y suma al numerador, con tope en el faltante del día.

---

# PARTE A · Guardado seguro por materia

## ANTES DE NADA

```bash
node scripts/gen-contexto.mjs --tarea=modificar \
  lib/escolar/asistencia/asistencia-plantillas.ts \
  lib/escolar/asistencia/atribucion-profesor.ts \
  lib/escolar/asistencia/asistencia-comun.ts \
  lib/escolar/asistencia/asistencias.ts \
  app/actions/asistencias.ts \
  scripts/test-atribucion-profesor.mjs
node scripts/diag-asistencia-periodo.mjs     # pega la medición inicial
```

## RESULTADO ESPERADO

**A1 · La plantilla lleva su materia (cierra H1).**
- `generarPlantillaAsistencia` resuelve el `grupo_materia_id` con la función
  que **ya existe**, `resolverGrupoMateriaIdSubida`, y agrega una fila
  reservada, después de `CLASES`: `MATERIA | <nombre visible> | <grupo_materia_id>`.
  El nombre del archivo incluye la clave de la materia.
- `analizarPlantillaAsistencia` (o sea: la previsualización **y** la
  confirmación) exige esa fila:
  - **falta** → error, sin escribir: «Esta plantilla es de una versión
    anterior y no indica su materia. Descarga una nueva.»;
  - **uuid distinto** del resuelto para la materia elegida → error, sin
    escribir, con ambos nombres visibles: «El archivo es de X y elegiste Y».
- La fila `MATERIA` se salta en el recorrido de alumnos, igual que `CLASES`
  (hoy acabaría como «CURP inválido»).
- Leer y comparar el marcador es una **función pura**, con su prueba.
- El nombre del profesor en la fila `CLASES` sigue siendo **informativo**.
  La identidad es siempre `sesion.profesorId`; nunca se lee del archivo.

**A2 · Previos por materia (H2).** Con el `grupo_materia_id` ya resuelto, la
consulta de previos filtra además por `grupo_materia_id`. Siguen siendo 2
consultas fijas.

**A3 · Escritura por tabla, sin medias tintas (H3).**
- Constante `LIMITE_FILAS_SUBIDA = 4000` en `asistencia-comun.ts`. Si el plan
  la supera, se **rechaza antes de escribir** con un mensaje que pide subir
  por parcial. Para medir: un parcial de 45 alumnos × 25 días son 1 125 filas.
- Por debajo del límite, **una sola petición UPSERT por tabla**. Cada petición
  de PostgREST es una transacción.
- Orden: primero `clases_impartidas`, después `asistencia_alumnos`. Si la
  segunda falla, los días quedan **pendientes**, nunca en falta, y volver a
  subir el mismo archivo es idempotente. El mensaje de error lo dice con esas
  palabras.
- `TAMANO_LOTE` queda solo para quien más lo use; si nadie más lo usa, se queda
  igual (no se borra).

**A4 · `periodo_id` en las filas nuevas (H4).** `atribuirMateriaAlPlan` recibe
`periodoId` y lo escribe en las dos tablas. Sin `ctx.periodoId`, **no se
escribe** (mismo patrón que «sin profesorId»). Se agrega el caso a
`test-atribucion-profesor.mjs`.

**A5 · Anular por materia (H5).**
- `actionAnularAsistenciaProfesor` acepta `grupoMateriaId` (validado con el
  esquema de entrada, como las demás actions).
- La elección de la fila objetivo pasa a una función pura:
  - con `grupoMateriaId` → solo esa fila;
  - sin él y con **una** sola fila → esa;
  - sin él y con **varias** → error, «Indica la materia».
- La action solo valida y delega (CONTRATO §2).

**Cierre de la Parte A:** `npm run test:ci` en verde, y
`diag-asistencia-periodo.mjs` antes/después (sin cambios esperados: nadie ha
subido). **Para.** La reviso antes de que sigas.

---

# PARTE B · Calendario por materia

## ANTES DE NADA

```bash
node scripts/gen-contexto.mjs --tarea=crear \
  lib/escolar/asistencia/asistencia-estados.ts \
  lib/escolar/asistencia/asistencia-parcial.ts \
  lib/escolar/asistencia/asistencia-tabular.ts \
  lib/escolar/materia/calificaciones.ts \
  app/actions/asistencias.ts \
  app/components/calendario-asistencia-alumno.tsx \
  app/components/oceano/asistencia-tabular-alumno.tsx \
  app/globals.css docs/sistema/TOKENS-OCEANO.css \
  scripts/test-asistencia-parciales.mjs
```

## RESULTADO ESPERADO

**B1 · Módulo puro nuevo: `lib/escolar/asistencia/asistencia-dia-materia.ts`.**
Sin I/O. Entrada: las filas ya cargadas, con `fecha`, `grupo_materia_id | null`,
`clases` / `clases_asistidas`, `profesor_clave` (para reconocer el marcador),
más el mapa `grupo_materia_id → nombre visible`. Salida por día:

```ts
type MateriaDelDia = {
  grupoMateriaId: string | null;   // null = legacy o justificación
  nombre: string;
  clases: number;                  // de clases_impartidas
  asistidas: number | null;        // null = pendiente
  estado: "completa" | "parcial" | "falta" | "pendiente";
};
type ColorDia = "verde" | "naranja" | "rojo" | "pendiente" | "sin_clase";
```

Reglas, todas en este módulo y en ningún otro:
- Se agrupa por `grupo_materia_id`. Las clases son la **suma** de las filas de
  `clases_impartidas` del grupo, día y materia; puede haber más de una (otro
  profesor antes del traspaso).
- `ratio = Σ asistidas / Σ clases` **solo** de materias con `clases > 0` y
  celda del alumno.
  - `ratio === 1` → verde; `ratio >= 0.5` → naranja; si no (incluido 0) → rojo.
  - Sin ninguna materia con celda → `pendiente`.
  - Día que no es `tipo='clase'` → `sin_clase`.
- Una materia sin celda del alumno no se cuenta: queda `pendiente`.

Además:
- Exporta también el resumen por parcial **en clases y por materia**. Se apoya
  en `etiquetarFechaConParcial` de `asistencia-parcial.ts`; **no** se
  reimplementa el etiquetado.
- `resumenAsistenciaPorParcial` conserva su firma y sus campos. Agrega, de
  forma aditiva, `clasesRegistradas`, `clasesAsistidas` y `porMateria[]`, y
  `porcentaje` pasa a calcularse en clases (decisión 4).

**B2 · I/O: `obtenerEstadosAsistenciaAlumno`.**
- Agrega `grupo_materia_id, profesor_clave` a los dos `select` que ya existen.
  **No** son consultas nuevas.
- **Los nombres salen del roster de materias del alumno, que ya existe.** No se
  buscan materia por materia.
  - La función es `materiasDelAlumno(supabase, curp, soloActivas)`
    (`lib/escolar/materia/calificaciones.ts:202`). Devuelve, por
    `grupoMateriaId`, el `nombre` y el `nombreVisible` (alias) en **una**
    consulta con relaciones incrustadas sobre `grupo_materias`, indexada por
    `grupo_id`.
  - Se llama con `soloActivas = false`: una materia dada de baja conserva su
    historial y su nombre.
  - Con eso se arma `Map<grupoMateriaId, nombreVisible ?? nombre>`. Es la
    **misma** fuente de nombres que la boleta (R6).
- **La vía más rápida:** la action ya resolvió la inscripción con
  `resolverIdentidadAlumnoInscripcion`, que lee `grupo_id` y no lo devuelve.
  - Agrégalo a `IdentidadAlumnoInscripcion` (aditivo).
  - Dale a `materiasDelAlumno` un parámetro **opcional** `grupoIds` que, si
    viene, se salta su consulta a `inscripciones_alumno`.
  - Resultado: la lectura de materias queda en **1** consulta, sin repetir la
    inscripción. Los demás llamadores no cambian.
- Las consultas a `asistencia_alumnos` y `clases_impartidas` corren **en
  paralelo** con la del roster (`Promise.all`): no dependen entre sí.
- Una fila cuyo `grupo_materia_id` no esté en el roster del grupo (no debería
  pasar: la subida valida el padrón) se muestra como «Materia fuera del grupo»,
  **nunca** se descarta en silencio, y su prueba va en la suite.
- Total por alumno: **≤ 4 consultas fijas**, sin depender de días ni de materias.
- `DiaEstadoAsistencia` crece de forma **aditiva**: `materias: MateriaDelDia[]`
  y `color: ColorDia`. `estado` sigue existiendo para quien ya lo usa.
- El alcance del maestro (`profesor_id`) no cambia.

**B3 · UI (`calendario-asistencia-alumno.tsx`, la usan alumno, tutor y
buscador del profesor).**
- La celda del día se pinta por `color`:
  - verde = `--oc-ok`;
  - rojo = `--oc-alert` como punto y `--oc-alert-text` en el texto (regla 1 de
    los tokens);
  - naranja = un **token nuevo** `--oc-warn` + `--oc-warn-text`, agregado
    **literal** en `docs/sistema/TOKENS-OCEANO.css` y en `app/globals.css`,
    con su procedencia `(d)`. Valor propuesto: `#F5A524`; verifica un
    contraste ≥ 4.5:1 sobre `--oc-surface` y anótalo.
  - **Nada de hex en el componente.**
- Pendiente deja de ser 🟠 (H7): pasa a superficie neutra, con su leyenda.
- El detalle del día lista cada materia: «Matemáticas · 2 de 2 ✓»,
  «Física · 0 de 1 — faltó», «Química · pendiente». El total del día se
  muestra arriba: «Hubo 3 clases · asistió a 2».
- El botón «anular» del maestro va **por línea de materia** y envía
  `grupoMateriaId`; en líneas legacy o de justificación no aparece.
- `asistencia-tabular-alumno.tsx` muestra el % en clases. Una fila por materia
  es opcional: **solo** si cabe en la `MateriaTablaVista` que ya existe, sin
  crear otra vista.

---

## REGLAS ARQUITECTÓNICAS

- La decisión vive en módulos puros de `lib/escolar/asistencia/`. Las actions
  validan sesión, alcance y entrada, y delegan.
- Fuente única (R6):
  - materia = `grupo_materia_id`;
  - ciclo = `periodos.id`;
  - parcial = derivado de la fecha;
  - nombre visible = el roster `materiasDelAlumno`.
- No se crea otra vía de lectura de asistencia. Calendario, tabular y resumen
  salen de la misma action.
- Extensible y reducible: agregar o quitar materias no toca código; los
  umbrales viven en una constante; un grupo con una sola materia recorre el
  mismo camino.

## PERMISOS / SEGURIDAD

- La identidad del profesor es siempre `sesion.profesorId`; nunca algo del
  archivo.
- El marcador `MATERIA` **verifica**, no **decide**: la materia sigue saliendo
  de la selección validada en el servidor, y el archivo solo puede **impedir**
  la escritura.
- No cambia ningún alcance de rol (alumno, tutor, maestro, directivo,
  administración).

## COMPATIBILIDAD / LEGACY

- Las 3 863 filas y las 81 legacy se leen igual que hoy, agrupadas en
  «Registro anterior». No se editan.
- Las plantillas descargadas antes de este cambio se **rechazan** con el
  mensaje de A1. Es intencional: hoy nadie ha subido con el flujo nuevo.
- `justificaciones.ts` no se toca.

## RENDIMIENTO

- Lectura: ≤ 4 consultas por alumno.
  - Calendario y parciales: ya los carga la action.
  - Roster, asistencia y clases: en paralelo.
  - Agrupación: una sola pasada con `Map`, por `grupo_materia_id`.
- Escritura: 2 peticiones de UPSERT por subida, más las consultas fijas que ya
  existen.
- Índices que ya existen: `asistencia_alumnos_curp_fecha_idx`,
  `asistencia_alumnos_curp_periodo_idx`, `clases_impartidas_grupo_fecha_idx`.
  No crees índices.

## LÍMITES — prohibido

- Ejecutar cualquier `.sql`, cualquier `migrar-*` o nada de `scripts/_peligrosos/`.
- Backfill de `grupo_materia_id` o `periodo_id` en filas viejas.
- Tocar `calificaciones`, `justificaciones.ts`, la RPC de traspaso o la matriz
  de permisos.
- Si te falta un dato del servidor que no está aquí: **para y dilo**.

## VALIDACIÓN

- Suite pura nueva `scripts/test-asistencia-dia-materia.mjs`, registrada como
  las demás. Casos mínimos:
  - 2/2 verde;
  - 1/2 naranja;
  - 2/3 naranja;
  - 1/3 rojo;
  - 0/N rojo;
  - una materia pendiente excluida;
  - todas pendientes → `pendiente`;
  - dos materias con una en falta → **no** verde;
  - legacy agrupado;
  - justificación con tope;
  - día no lectivo → `sin_clase`.
- Pruebas puras: marcador `MATERIA` (falta / distinto / válido), elección de
  fila al anular, `periodo_id` en `atribuirMateriaAlPlan`.
- `scripts/test-asistencia-parciales.mjs` se actualiza al % en clases, con el
  caso que demuestra la diferencia.
- `npm run test:ci` completo en verde.

## INFORME FINAL (`criterios.prompts` §26)

Implementado · Archivos principales · Arquitectura · Seguridad · Rendimiento ·
Validación · Legacy · Pendiente. Si un documento del presente queda falso
(`MAPA-DEL-SISTEMA.md` §2a sobre asistencia), se actualiza en el mismo cambio.

```
CONTRATO (obligatorio):
1. Antes de tocar nada: correr el diagnóstico de solo lectura que aplique
   (scripts/README.md, columna LEE) y pegar la medición inicial.
2. La decisión va en un módulo puro y probable sin base de datos. La action
   solo valida sesión y delega. La lógica no vive en app/actions/.
3. Cambio aditivo. Nada destructivo, nada de borrar legacy, ninguna migración
   de datos sin autorización explícita en este mismo prompt.
4. No crear un camino paralelo a una fuente única existente
   (periodos para ciclo, inscripciones_alumno para alumno→grupo).
5. Validar: npx tsc --noEmit + la suite pura del módulo + next build.
6. Volver a correr el diagnóstico del paso 1 y mostrar antes/después.
7. Entregar: qué archivos tocaste, por qué, y qué NO tocaste pudiendo hacerlo.
```

# Glosario — los términos donde el sistema ya se rompió

NORMATIVO. Cada entrada existe porque confundirla ya costó un incidente.
Si un prompt usa uno de estos términos de forma ambigua, el prompt está mal escrito.

---

## Ciclo escolar

| Término | Qué es realmente |
|---|---|
| **`periodos`** (tabla) | La **raíz del sistema**. Un ciclo escolar es una fila con un `uuid`. Todo lo académico cuelga de `periodos.id`. |
| **`periodos.id`** | El identificador estructural. **La única forma correcta de referirse a un ciclo.** |
| **`periodos.nombre`** | Texto de presentación (`"2026-2027"`). **Nunca es identificador** (regla R5). El incidente P0 vino de usarlo como tal. |
| **`periodos.activo`** | Exclusividad impuesta por PL/pgSQL (`activar_ciclo_operativo`), no por convención. Solo un ciclo operativo a la vez. |
| **«ciclo operativo»** | El `periodo` activo que además tiene contexto académico real: grupos > 0, materias activas > 0, inscritos > 0. Un ciclo activo sin eso es un ciclo roto (regla R1). |
| **`periodos_evaluacion`** | Los **parciales** dentro de un ciclo. No confundir «periodo» (ciclo) con «periodo de evaluación» (parcial). |

> **Trampa activa:** `calendario_escolar` tiene **dos identidades vivas** — la columna de
> texto `ciclo_escolar` (LEGACY: solo sus **lecturas** están `@deprecated`; las escrituras
> aún usan la UNIQUE de texto) y `periodo_id` (correcta). El texto no tiene por qué
> coincidir con `periodos.nombre`: leer **siempre** por `periodo_id`.

## Alumno → grupo

| Término | Qué es realmente |
|---|---|
| **`inscripciones_alumno`** | **Fuente única** de la relación alumno→grupo, por CURP y por ciclo. Regla R6: no crear otro camino. |
| **`inscripciones_alumno.activo`** | (PROMPT-4, 2026-09-06) Significa **«pertenece al ciclo operativo»**. NO significa «la eligió un humano». Quien marca pertenencia es `sincronizarInscripcionesOperativo` al activar un ciclo; quien la eligió a mano es la deduplicación/roster. |
| **`inscripciones_alumno.decision_manual`** | (PROMPT-4/T1, opción A) `true` = **un humano decidió explícitamente sobre esta fila** (p. ej. «este alumno no va en este grupo», puesto por el roster o la deduplicación). La sincronización de activación **no toca** estas filas: ni las activa ni las desactiva ni las elige por fecha. `activo` y `decision_manual` son **dos columnas con dos significados distintos**: pertenencia automática vs. decisión humana. |
| **`grupos`** | Grado + grupo + carrera dentro de un `periodo`. |
| **`grupo_materias`** | Une un grupo con una materia dentro del ciclo. Es donde vive `tabla_legacy`. |
| **`academico_semestres`** | Oferta activa por grado. No es el roster. |

## Materia

| Término | Qué es realmente |
|---|---|
| **`idInterno`** | **El nombre exacto de la tabla física en Supabase** (`"2DO A MECATRONICA CONCIENCIA HISTORICA"`). Es el identificador técnico real y **nunca cambia**. Todo acceso a las **tablas físicas legado** usa esto. |
| **`nombreVisible`** | Solo presentación (`"Conciencia Histórica II"`). Vive en `materias_nombres_visibles`. **Nunca se usa para acceder a datos.** |
| **`tabla_legacy`** | La columna de `grupo_materias` que hace de **puente** entre el catálogo (uuid) y la tabla física (texto). Si está vacía o mal, el alumno no ve su materia. |
| **`asignatura`** | La identidad lógica extraída del `idInterno` (`CONCIENCIA HISTORICA`), sin grado/grupo/carrera. Sirve para agrupar y buscar, no para acceder. |
| **`materias_mapeo_columnas`** | Qué columna física de la tabla de materia corresponde a qué actividad evaluable, y con qué peso. |
| **Calificaciones (modelo B)** | Tabla `calificaciones` por `grupo_materia_id` + CURP (`supabase/crear-calificaciones-normalizadas.sql`). Las tablas físicas por materia (columnas creadas por RPC) son legado (R8): las usa la vista del profesor. Trampa: `materia_id` en `materias_nombres_visibles` y `materias_mapeo_columnas` es TEXTO (= nombre de tabla); unir por `grupo_materia_id`. |

## Profesor

| Término | Qué es realmente |
|---|---|
| **`PROFESORES.ID`** | La identidad estructural real. Es lo que viaja en la sesión como `profesorId`. |
| **`PROFESORES.CLAVE`** | La contraseña. **No es identidad y no es única** (cuántas la comparten: pendiente `claves-compartidas-profesores`). Cualquier lógica que identifique por CLAVE está mal. |
| **`profesor_clave`** (columna) | Legacy nullable en `clases_impartidas` / `asistencia_alumnos`. Se lee por compatibilidad, no se escribe como identidad. |
| **`profesor_id`** | La columna correcta. Regla congelada en `atribucion-profesor.ts`: **sin `profesor_id` de sesión, no se escribe nada.** |
| **`asignaciones_profesor`** | Qué profesor da qué `grupo_materia` en qué ciclo. |

> **Rol técnico (PROMPT-3, 2026-09-06).** Es una fila **normal** de `PROFESORES`
> con `Permisos = 'Tecnico'`; hereda la identidad estructural (`PROFESORES.ID` →
> `profesorId` en la sesión), el login por nombre y el cambio forzado de clave.
> **Frontera de credenciales**: el técnico ve y repone la **clave de inicio de
> sesión** (web) de cuentas de rol maestro; **nunca** `PROFESORES.ID` como llave
> maestra expuesta en su consola, ni credenciales de Supabase, ni las claves de
> directivo/técnico. Es técnico de la web, no de la base.
>
> **Rol administración escolar (2026-09-24).** Igual que el técnico: fila normal de
> `PROFESORES` con `Permisos = 'Administracion'`. Abre el expediente de cualquier
> alumno y edita sus datos; gestiona tutores, reportes, constancias de estudios,
> documentos y mensajes. No califica ni configura.


> Las 81 filas históricas de `clases_impartidas` con clave `4321` tienen **autoría
> irrecuperable**. No se backfillean: inventar la atribución es peor que dejarla NULL.

## Asistencia

| Término | Qué es realmente |
|---|---|
| **`clases_impartidas`** | Cuántas clases dio un profesor a un grupo un día. |
| **`asistencia_alumnos`** | Cuántas de esas asistió cada alumno. |
| **`calendario_escolar`** | Qué días son de clase. Ver la trampa de las dos identidades, arriba. |
| **`horario_semanal`** | Qué clase toca cada día de la semana. Cruzarlo con el calendario es lo que da «clases esperadas». |
| **«previsualizar → confirmar»** | El patrón obligatorio del repo: el análisis no escribe nada; solo la confirmación escribe. Se repite en asistencia, horario, carga académica, alumnos y etiquetas. |

## Datos del alumno

| Término | Qué es realmente |
|---|---|
| **Datos académicos** vs **datos personales** | Separación estructural (filosofía §5). No mezclarlos en la misma tabla ni en la misma pantalla de edición. |
| **Campos definidos** vs **etiquetas dinámicas** | Separación estructural (filosofía §6). `alumno_etiquetas` es dinámico y tiene tope de 20 por alumno impuesto por trigger. |
| **`CURP`** | La clave natural del alumno en todo el sistema. |

## Conceptos de ejecución

| Término | Qué es realmente |
|---|---|
| **Server Action** | El único transporte navegador→servidor. **No existe `app/api/`** ni REST propia. |
| **`service_role`** | La llave que usa el servidor (y todo `scripts/`). **Salta RLS.** Las policies actuales son `USING (true)`: la autorización real vive en TypeScript, no en la base. |
| **Módulo puro** | Decide sin I/O, se prueba sin base de datos (`ciclo-estado-puro`, `atribucion-profesor`, `asistencia-parcial`, `etiquetas-dinamicas`, `mapeo-columnas-materia`, `fechas`, `roster-validacion`). Si una decisión no se puede probar sin base, está en el archivo equivocado. |
| **Cambio aditivo** | Añadir sin romper lo existente (filosofía §10). Es el modo por defecto; lo destructivo requiere autorización explícita. |

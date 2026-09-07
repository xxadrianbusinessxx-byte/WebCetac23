# P1 — Ciclo escolar como raíz del sistema académico: Auditoría + Diseño

**Estado:** ENTREGABLE DE AUDITORÍA Y DISEÑO (sin implementación).
**Alcance:** solo lectura de código y datos reales (2026-09-03).
**Contexto:** incidente P0 (`2026-2027` inactivo con 356 inscripciones /
`AGO2026-ENE2027` activo sin contexto). Objetivo: que ese error no pueda
repetirse, con el ciclo como raíz única.

Documentos leídos: `contexto.feliz`, `filosofia.estructural`,
`criterios.prompts`, `docs/REGLAS_NO_HACER.md`,
`docs/CICLO_EVALUACIONES_MODULO.md`, `docs/HORARIO_SEMANAL_MODULO.md`,
`docs/OPTIMIZACION_RENDIMIENTO_400_500.md`.

---

## 1. Diagnóstico — qué existe y cómo funciona hoy

### 1.1 Modelo de datos vigente

```text
periodos (ciclo; UNIQUE nombre; activo bool; fecha_inicio/fin opcional)
 ├─ periodos_evaluacion   (parciales: numero, nombre, fechas, activo)  [periodo_id]
 ├─ grupos                (grado, grupo, carrera_id, activo)           [periodo_id]
 │   ├─ grupo_materias    (materias activas del grupo)                 [grupo_id]
 │   │     └─ materias    (catálogo GLOBAL, compartido entre ciclos)
 │   └─ inscripciones_alumno (curp→grupo, activo, historial)           [grupo_id]
 ├─ academico_semestres   (oferta activa por semestre 1..12)           [periodo_id]
 ├─ asignaciones_profesor (profesor_clave→grupo_materia)              [grupo_materia_id]
 └─ horario_semanal       (bloques por grupo/día/hora)                 [periodo_id+grupo_id]
```

Independiente y en **texto libre**: `calendario_escolar.ciclo_escolar`.

Asistencia sin ciclo: `clases_impartidas`, `asistencia_alumnos` y
`justificaciones_asistencia` guardan `profesor/grado/grupo/curp/fecha` **sin**
`periodo_id` ni `periodo_evaluacion_id`; el ciclo se deduce por fecha.

### 1.2 Cómo se crea y activa un ciclo HOY (hallazgo central)

1. `crearCicloEscolar()` inserta el periodo con **`activo=true` por defecto**
   (`lib/escolar/evaluaciones.ts`) → un ciclo nuevo nace ACTIVO y vacío.
2. `setActivoCiclo()` cambia solo el booleano: **no es exclusivo** y **no
   valida integridad** (pueden quedar varios activos o uno vacío activo).
3. `guardarPeriodoEvaluacion()` (parciales) y `setEstadoSemestre()` exigen que
   el periodo esté `activo=true` → **no se puede configurar sin activar**
   (huevo–gallina que fuerza el anti-patrón del P0).
4. `calendario-escolar-panel` escribe el calendario con un **nombre libre**
   (`ciclo_escolar` texto), independiente de `periodos`.
5. `actionListarCatalogoReconocimiento()`/carga académica ofrecen periodos
   **activos** como destino de inscripciones → para poblar un ciclo nuevo hay
   que activarlo antes.
6. `clonarContextoAcademico` copia grupos+materias desde un origen, **nunca
   inscripciones** (correcto), pero no existe la operación explícita de
   “heredar/copiar inscripciones” (solo import masivo).

Consecuencia: la operación real actual es `crear → (queda activo) → configurar
parciales/calendario/roster → cargar inscripciones → desactivar ciclo
anterior`, es decir, la secuencia prohibida en R2 de `REGLAS_NO_HACER.md`.

### 1.3 Tabla de auditoría por componente (parte 1)

| Componente | Tabla(s) / archivo | Identificador de ciclo | Lee | Escribe | Fuente de verdad | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| Ciclos | `periodos` / `evaluaciones.ts` | `periodos.id` UUID | ✔ | crear/activar/rango | `periodos.id` | Identidad OK; activación NO validada |
| Parciales | `periodos_evaluacion` / `evaluaciones.ts` | `periodo_id` | ✔ | ✔ | `periodo_id` | OK; exige ciclo activo |
| Semestres | `academico_semestres` / `semestres.ts` | `periodo_id` | ✔ | ✔ | `periodo_id` | OK; exige ciclo activo |
| Calendario | `calendario_escolar` / `calendario.ts` | **texto** `ciclo_escolar` | ✔ | ✔ | texto libre | DEUDA (R5) |
| Grupos | `grupos` / catálogo | `periodo_id` | ✔ | ✔ | `periodo_id` | OK |
| Materias por grupo | `grupo_materias` / catálogo | vía grupo→periodo | ✔ | ✔ | `grupo_id` | OK |
| Materias globales | `materias` | global | ✔ | ✔ | `materias.id` | OK (compartidas) |
| Inscripciones | `inscripciones_alumno` / catálogo+carga | vía grupo→periodo | ✔ | ✔ upsert (nunca DELETE) | `inscripciones_alumno` | OK; opera solo en periodos activos |
| Horario | `horario_semanal` / `horario-semanal.ts` | `periodo_id` | ✔ | ✔ import validado | `periodo_id` | OK |
| Asignaciones profesor | `asignaciones_profesor` | vía grupo_materia→grupo→periodo | ✔ | ✔ | `grupo_materia_id` | Datos pobres (claves duplicadas) |
| Config clases legacy | `configuracion_clases_profesor` | sin ciclo | legado | no (flag off) | — | Desactivado, conservado (R8) |
| Clases impartidas | `clases_impartidas` / `asistencias.ts` | **ninguno** | ✔ | ✔ | fecha+grado+grupo | DEUDA: sin ciclo/parcial |
| Asistencia alumnos | `asistencia_alumnos` / `asistencias.ts` | **ninguno** | ✔ | ✔ | fecha+curp+grupo | DEUDA: sin ciclo/parcial |
| Justificaciones | `justificaciones_asistencia` / `justificaciones.ts` | **ninguno** | ✔ | ✔ | fecha+curp | DEUDA: sin ciclo |
| Resolución alumno | `catalogo-academico.ts` | exige `periodos.activo=true` | ✔ | — | inscripción→grupo→periodo | Frágil al flag global |

### 1.3 Tabla de auditoría por componente (parte 2)

| Componente | Tabla(s) / archivo | Identificador de ciclo | Lee | Escribe | Fuente de verdad | Estado |
| --- | --- | --- | --- | --- | --- | --- |
| Materias del alumno | `resolverMateriasAlumno` | vía grupo resuelto | ✔ | — | grupo_materias | OK |
| Perfil alumno | `app/actions/escolar.ts` | vía resolución+semestre | ✔ | — | catálogo | OK (sin fallback etiquetas) |
| Horario alumno/tutor | `app/actions/horario.ts` | inscripción→grupo→periodo | ✔ | — | horario_semanal | OK (no exige activo) |
| Contexto para tutor | `app/actions/asistencias.ts` | inscripción→grupo→periodo | ✔ | — | catálogo | OK |
| Ciclo actual profesor | `actionObtenerCicloActual` | `activo=true` → **nombre** | ✔ | — | nombre del activo | OK si hay 1 activo |
| Grupos asistencia | `listarGruposAsistencia` | grupos del **periodo activo** | ✔ | — | periodo activo | Frágil al flag |
| Plantilla asistencia | `generarPlantillaAsistencia` | ciclo **texto** (UI) | ✔ | — | calendario(texto)+horario(nombre) | DEUDA: mezcla ids |
| Vista asistencia alumno | `calendario-asistencia-alumno.tsx` | ciclo **texto** | ✔ | — | calendario | DEUDA texto |
| Creación ciclo | `crearCicloEscolar` | — | ✔ | insert `activo:true` | — | DEFECTO (activa vacío) |
| Clon contexto | `contexto-ciclo.ts` | origen→destino `periodo_id` | ✔ | ✔ grupos+gm | — | OK (nunca inscripciones) |
| Carga académica | `carga-academica.ts` (actions+lib) | periodos **activos** | ✔ | ✔ inscripciones | catálogo | Parcial: fuerza activar |
| Justificaciones v2 | `justificaciones.ts` + SQL | **ninguno** (fecha) | ✔ | ✔ | fecha+curp | DEUDA: sin ciclo |

---

## 2. Dependencias (módulos que dependen del ciclo)

1. **Identidad académica:** `resolverGrupoAlumno`, `resolverMateriasAlumno`,
   `semestreActivoDeGrupo`, RPC `obtener_perfil_alumno` (lectura). Dependen de
   `inscripciones_alumno.activa → grupos → periodos.activo=true`.
2. **Perfil alumno/tutor:** `app/actions/escolar.ts` (perfil, etiquetas,
   materias visibles, boleta/registro), `horario-alumno-resumen`,
   `calendario-asistencia-alumno`, justificaciones.
3. **Profesor/asistencia:** `actionObtenerCicloActual`, `actionListarGruposAsistencia`,
   `actionObtenerMateriasHorarioGrupo`, `actionDescargarPlantillaAsistencia`,
   `confirmarAsistencias` → dependen de `periodos.activo` para grupos, de
   **calendario por texto** para fechas, y de **horario por nombre** para clases.
4. **Directivo/administración:** `ciclo-evaluaciones-admin`, `calendario-escolar-panel`,
   `contexto-academico-panel`, `horario-escolar-panel`, `semestres-admin`,
   `asignaciones-admin`, `reconocimiento-academico`, carga académica.
5. **Evaluaciones por fecha:** `resolverCicloEvaluacionPorFecha` (lib; sin
   consumidor productivo detectado; solo tests `test-evaluaciones.mjs`).

---

## 3. Inconsistencias (identificadores/conceptos de ciclo distintos)

1. **UUID vs texto:** `periodos.id` (todos los módulos de catálogo) contra
   `calendario_escolar.ciclo_escolar` (texto libre). Evidencia real: calendario
   con nombres `2026-2027`, `SEMESTRE AGO26-ENE27`, `PRIMER PARCIAL (SEP-AGO)`…
2. **Horario por nombre:** `consultarHorarioGrupoPorIdentidad`/`obtenerConteosHorarioMateria`
   reciben el ciclo como **nombre** (`obtenerPeriodoPorNombre`) mientras
   `horario_semanal` está versionado por `periodo_id`. Funciona solo si el
   nombre coincide con el de `periodos` (AGO fallaba: calendario y periodo con
   nombres distintos).
3. **Asistencia sin ciclo:** `clases_impartidas`/`asistencia_alumnos`/
   `justificaciones` no guardan `periodo_id`/`periodo_evaluacion_id`; el ciclo
   se infiere por fecha. Imposible hoy garantizar “asistencia del parcial X”.
4. **Activación prematura:** `crearCicloEscolar` nace `activo=true` y
   `setActivoCiclo` no es exclusivo ni validado; la configuración (parciales,
   semestres, carga) exige `activo=true` → un ciclo puede ser “operativo” sin
   contexto (causa raíz del P0).
5. **Regla “un único activo”** solo es una convención implícita (los lectores
   toman el primero por `created_at desc`); no hay invariante.
6. **Fallback legacy** en asistencias (`FALLBACK_LEGACY_ETIQUETAS_ACTIVO`) sigue
   activo y puede ocultar configuraciones incorrectas del catálogo.
7. **1ROS:** no hay problema de carrera (`carrera_id NULL` soportado en grupos y
   en `grupo_materias`), pero ninguna validación distingue estructura “sin
   carrera” de “configuración incompleta”.

## 4. Modelo objetivo

### 4.1 Fuente única y estados del ciclo

- `periodos` es la **raíz única**: `periodo_id` UUID como relación estructural en
  todo módulo. El nombre existe solo como presentación + clave natural única.
- Se introduce un **estado de ciclo** explícito (aditivo):

```text
periodos.estado text CHECK ('borrador','operativo','historico')
  (activo queda derivado o se conserva sincronizado)
```

  Alternativa transitoria sin columna nueva: `activo=false` + `validado_ok`
  boolean + `validado_en`. Recomendada: la columna `estado`.
- **Un solo ciclo `operativo`** a la vez (activación exclusiva y transaccional).
- Un ciclo pasa a `operativo` **solo tras validar integridad** (§5.4).

### 4.2 Relaciones objetivo

```text
                 PERIODOS  (raíz única; borrador/operativo/historico)
                    │
        ┌───────────┼───────────────┬───────────────┐
        ▼           ▼               ▼               ▼
 EVALUACIONES   CALENDARIO     CONTEXTO        ROOSTER/HORARIO
 periodos_eval  (periodo_id)   ACADÉMICO       (periodo_id+grupo_id)
 (periodo_id)                  grupos.grupo_materias.inscripciones
                    │              │
                    └──────────────┘
                           ▼
                    ASISTENCIA  (clases_impartidas / asistencia_alumnos)
                           │       + periodo_id (+ periodo_evaluacion_id)
                           ▼
                  ALUMNO · TUTOR/PADRE
```

- **Calendario:** `calendario_escolar.periodo_id` FK (aditivo); `ciclo_escolar`
  texto queda deprecated. UNIQUE `(periodo_id, fecha)`.
- **Parciales:** siguen en `periodos_evaluacion` con `periodo_id`; se elimina la
  exigencia de “ciclo activo” para configurarlos (permite preparar en borrador).
- **Rooster/horario:** `horario_semanal(periodo_id, grupo_id, …)` ya es
  correcto; las consultas deben recibir/derivar `periodo_id`, no el nombre.
- **Asistencia:** se agregan `periodo_id` y `periodo_evaluacion_id` (FK
  nullable) a `clases_impartidas` y `asistencia_alumnos` (y a
  `justificaciones_asistencia` si se reporta por parcial). La fecha deja de ser
  el único puente.
- **Inscripciones:** permanecen como pertenencia alumno→grupo→ciclo; nunca se
  infieren de `ALUMNOS`.

### 4.3 Fuente de verdad por concepto

| Concepto | Fuente | Identificador estructural |
| --- | --- | --- |
| Ciclo | `periodos` | `periodo_id` |
| Parcial | `periodos_evaluacion` | `periodo_evaluacion_id` |
| Días lectivos/no lectivos | `calendario_escolar` | `(periodo_id, fecha)` |
| Oferta de grupo | `grupos` | `grupo_id` |
| Materias activas del grupo | `grupo_materias` | `grupo_materia_id` |
| Catálogo materias/carreras | `materias` / `carreras` | globales |
| Pertenencia académica | `inscripciones_alumno` | `(curp, grupo_id)` |
| Oferta por semestre | `academico_semestres` | `(periodo_id, semestre)` |
| Rooster/horario | `horario_semanal` | `(periodo_id, grupo_id, día, hora)` |
| Clases impartidas | `clases_impartidas` | `(periodo_id, profesor, grupo, fecha)` |
| Asistencia por alumno | `asistencia_alumnos` | `(periodo_id, curp, grupo, fecha)` |
| Justificación | `justificaciones_asistencia` | `(periodo_id, curp, fecha)` |

## 5. Creación de ciclo (diseño del flujo)

### 5.1 Estados del ciclo

`borrador` (configurable, sin efectos sobre alumnos) → **validación** →
`operativo` (único activo; el anterior pasa a `historico`).

### 5.2 Flujo del directivo (concepto; adaptar a la UI existente)

```text
Nuevo ciclo: nombre (2027-2028) · inicio · fin
Reutilizar de [ciclo origen ▼]:
  [x] grupos            (estructura grado+grupo+carrera)
  [x] materias activas  (por grupo, mismo materia_id)
  [ ] inscripciones     (NUNCA automático; import explícito con confirmación)
  [ ] calendario base   (generar días clase del rango nuevo)
  [ ] excepciones       (festivos/suspensiones, confirmadas)
  [ ] parciales         (solo plantilla de número/nombre; fechas nuevas)
  [ ] rooster/horario   (import explícito validado contra grupos del ciclo)
  [ ] asignaciones      (requiere reconciliar claves de profesor)
```

### 5.3 Orquestador `crearCicloConContexto` (Server Action, transaccional)

1. Rol `directivo`; nombre único; rango válido (inicio ≤ fin).
2. `INSERT periodos` con `estado='borrador'`.
3. Si se pidió: clonar **grupos** del origen (identidad normalizada
   grado|grupo|carrera; reutilizar `clonarContextoAcademico`).
4. Vincular **materias activas** por `materia_id` (mecanismo existente).
5. Crear **plantilla de parciales** si se pidió (número/nombre de origen;
   fechas a confirmar).
6. **Inscripciones NO automáticas:** el ciclo queda con
   `inscripcionesPendientes=true` y la UI guía a la carga explícita con preview.
7. Generar **calendario base** del rango si se pidió (solo días `clase`);
   excepciones solo con confirmación.
8. Guardar resumen `pendiente[]` (grupos sin materias, grupos sin rooster,
   sin inscripciones, parciales sin fechas, semestres sin configurar…).
9. `validarIntegridad()` → permanece `borrador` con reporte. No se activa hasta
   verde (o excepciones aprobadas por el directivo).

### 5.4 `validarIntegridad(periodo_id)` — reglas propuestas

Bloqueantes para `operativo`:
- `periodo` existe y está en `borrador`.
- rango válido si el ciclo define fechas (`inicio ≤ fin`).
- ≥ 1 **grupo activo** en el periodo (ciclo que va a operar).
- todo **grupo activo con inscripciones activas** tiene ≥ 1 `grupo_materias`
  activa (grupos sin inscripciones pueden permanecer en preparación).
- toda **inscripción activa** apunta a un grupo activo del MISMO periodo.
- ningún CURP con más de una inscripción activa en el periodo.
- parciales (si existen): dentro del rango, sin solaparse, ordenados por número.
- calendario con ≥ 1 día `clase` del periodo antes de activar si habrá
  asistencias.

Advertencias (no bloquean; aparecen en el reporte):
- grupos sin materias; materias sin grupo; grupos sin rooster; parciales sin
  fechas; calendario incompleto; semestres sin configurar.

Regla estructural: **nunca exigir `carrera`** (los 1ROS son sin carrera). La
validación compara contra el modelo real del propio ciclo (grado sin carrera
válido), nunca contra una regla global.

### 5.5 Activación exclusiva `activarCicloOperativo(periodo_id)`

Una Server Action transaccional y reintentable:
1. `validarIntegridad(periodo_id)` en verde (o excepciones aprobadas).
2. `UPDATE periodos SET activo=false, estado='historico' WHERE activo=true`.
3. `UPDATE periodos SET activo=true, estado='operativo' WHERE id=periodo_id`.
4. Auditoría (quién/cuándo/antes/después) para rollback.

## 6. Reutilización (no reconstruir lo que ya funciona)

| Necesidad | Reutilizar (existente) | Nota |
| --- | --- | --- |
| Clonar estructura de grupos+materias | `clonarContextoAcademico`, `planificarGruposAClonar`, `normalizarGrado/Grupo/Carrera` (`contexto-ciclo.ts`, `catalogo-academico.ts`) | Ampliar a “checkboxes” sin duplicar lógica |
| Crear/validar parciales | `guardarPeriodoEvaluacion`, `validarInputEvaluacion`, `resolverCicloEvaluacionLocal` (`evaluaciones.ts`) | Quitar exigencia de activo |
| Calendario base / días | `establecerCalendarioBase`, `guardarDiaCalendario`, `obtenerCalendarioEscolar` (`calendario.ts`) | Migrar a `periodo_id` |
| Inscripciones | `obtenerInscripcionActiva`, `inscribirAlumno({unaActiva})`, pipeline de carga con preview (`carga-academica.ts`) | Permitir destino en borrador |
| Resolución alumno | `resolverGrupoAlumno`, `resolverMateriasAlumno`, `semestreActivo*` | Mantener; robustecer contra “sin activo” |
| Horario/rooster | `horario-importar.ts` (validación contra grupos del periodo), `obtenerConteosHorarioMateria`, `consultarHorarioGrupoPorIdentidad` | Cambiar entrada nombre→`periodo_id` |
| Plantillas de asistencia | `generarPlantillaAsistencia`, `obtenerAlumnosDelGrupo`, `confirmarAsistencias` | Pasar contexto por ids + parcial |
| RPC perfil | `obtener_perfil_alumno` (SQL) | Revisar tras cambios |
| Identidad normalizada | catálogo (grado/grupo/carrera), `gradoASemestre` | — |
| Seguridad | patrón Server Action + `obtenerSesionPortal()` rol directivo | Mantener en orquestador |

## 7. Migraciones necesarias (LISTA; NO ejecutar en esta fase)

1. **`periodos.estado`** (`CHECK borrador/operativo/historico`) + backfill
   (`activo=true → operativo`, resto `historico` o `borrador` según contexto).
2. **`calendario_escolar.periodo_id`** FK aditiva; backfill uniendo por
   `ciclo_escolar = periodos.nombre` (los huérfanos tipo `SEMESTRE AGO26-ENE27`
   quedan sin periodo y se depuran/revisan); UNIQUE `(periodo_id, fecha)`.
3. **`periodos_evaluacion`**: revisar que todos los parciales pertenezcan a un
   periodo existente (hoy AGO los tiene; 2026-2027 no). Decidir destino.
4. **`clases_impartidas` y `asistencia_alumnos`**: añadir `periodo_id` y
   `periodo_evaluacion_id` (nullable) + backfill por fecha→calendario→periodo
   cuando sea determinista.
5. **`justificaciones_asistencia`**: `periodo_id` nullable (si se reporta por
   parcial).
6. **Datos de prueba/legacy**: limpieza diferida de nombres de calendario
   paralelos (`PRIMER PARCIAL (SEP-AGO)`, etc.) tras migrar a ids (no DELETE
   masivo en producción; primero mapear y archivar).
7. **`asignaciones_profesor`/`PROFESORES`**: sanear `CLAVE` (hoy duplicada
   `4321`) antes de depender de asignaciones para rooster.

Principio: cambios ADITIVOS, idempotentes, en lotes, con backfill reversible y
verificación posterior (patrón de `supabase/*.sql` actual).

## 8. Riesgos y mitigación

| Riesgo | Mitigación |
| --- | --- |
| Ciclo parcialmente creado | Orquestador transaccional; si falla a mitad → `borrador` (nunca operativo); reintento idempotente |
| Ciclo activo sin contexto | Prohibido: `estado` + `validarIntegridad` + reporte `pendiente[]` |
| Alumno sin inscripción | Inscripción explícita; validación avisa grupos activos sin inscripciones |
| Grupo sin materias / materia sin grupo | Reporte por grupo; bloquea solo si el grupo tiene inscripciones |
| Alumno en grupo sin materias (grupos vacíos) | Advertencia + excepción aprobada por el directivo |
| 1RO sin carrera | Regla explícita: `carrera_id NULL` válido; no validar contra “carrera requerida” |
| Parciales fuera del ciclo / sin ciclo | FK `periodo_id` ya existe; validar rango dentro del ciclo |
| Calendario sin ciclo o con nombre distinto | Migración a `periodo_id`; deprecar texto; UI selecciona el ciclo de `periodos` |
| Rooster apuntando a otro ciclo | `horario_semanal.periodo_id` ya existe; consultas por `periodo_id` |
| Asistencia apuntando a otro parcial/ciclo | Nuevas columnas `periodo_id/periodo_evaluacion_id` escritas por el servidor, no por el archivo |
| Dos ciclos operativos | Activación exclusiva transaccional (§5.5) |
| Fallback legacy que oculte errores | Mantener gated; apagarlo por fases tras validar contexto |
| Reintentos/duplicados | UPSERT por claves naturales existentes; nunca INSERT ciego |
| Producción durante auditoría | Sin cambios (esta fase es solo lectura) |

## 9. Plan de implementación (fases futuras, sin ejecutar ahora)

Cada fase: objetivo · archivos · tablas · migración · validación · rollback ·
pruebas.

### F1 — Estado y validación de integridad del ciclo
- **Objetivo:** impedir ciclos operativos sin contexto.
- **Archivos:** `supabase/agregar-estado-periodo.sql` (nuevo), `lib/escolar/ciclo-integridad.ts`
  (nuevo: `validarIntegridad`, reporte), `lib/escolar/evaluaciones.ts`,
  `app/actions/evaluaciones.ts`.
- **Tablas:** `periodos` (columna `estado`).
- **Migración:** aditiva + backfill (`activo=true→operativo`).
- **Validación:** reglas §5.4; tsc/eslint; script read-only de reporte por
  periodo (reutilizar `p0-diag-contexto.mjs` como base).
- **Rollback:** revertir columna (aditiva; no borrar datos).
- **Pruebas:** unitarias de `validarIntegridad` (casos 1RO sin carrera, grupo sin
  materias, sin inscripciones, sin calendario) + reporte sobre datos reales.

### F2 — Ciclo nace en borrador; crear nunca activa
- **Objetivo:** romper “crear = activar”.
- **Archivos:** `evaluaciones.ts` (`crearCicloEscolar` → `estado='borrador'`),
  `ciclo-evaluaciones-admin.tsx`.
- **Tablas:** `periodos`.
- **Validación:** al crear, `activo=false`; la UI muestra estado y pendientes.
- **Pruebas:** crear ciclo → no aparece en `actionObtenerCicloActual` ni en
  `listarGruposAsistencia`; no afecta a alumnos.

### F3 — Configuración sin exigir activo (parciales, semestres, carga)
- **Objetivo:** preparar el ciclo completo en borrador.
- **Archivos:** `evaluaciones.ts` (quitar `.eq('activo',true)` en
  guardar parcial/rango), `semestres.ts`, `carga-academica.ts` (permitir
  seleccionar borradores en preparación con confirmación), `lib/carga-academica.ts`.
- **Pruebas:** cargar parciales/calendario/roster/inscripciones a un borrador y
  re-ejecutar sin duplicar (idempotencia).

### F4 — Orquestador `crearCicloConContexto` (reutilización selectiva)
- **Objetivo:** flujo integral nuevo ciclo.
- **Archivos:** `lib/escolar/crear-ciclo.ts` (nuevo), `app/actions/contexto-ciclo.ts`,
  nuevo panel en `/configuracion` (reemplaza parcialmente a
  `ciclo-evaluaciones-admin`/`contexto-academico-panel`), `calendario.ts`.
- **Tablas:** `periodos`, `grupos`, `grupo_materias`, `calendario_escolar`,
  `periodos_evaluacion` (todas con `periodo_id` del nuevo ciclo).
- **Seguridad/rollback:** operación transaccional; snapshot en log; reintento
  idempotente; nunca borra.

### F5 — Calendario por `periodo_id` (unificación de identificadores)
- **Objetivo:** eliminar el texto como identificador estructural.
- **Archivos:** `supabase/migrar-calendario-periodo-id.sql` (nuevo), `calendario.ts`,
  `calendario-escolar-panel.tsx`, `asistencias.ts`, componentes de vista.
- **Migración:** aditiva + backfill por nombre + deprecar texto (no borrar).
- **Pruebas:** plantillas y vista alumno usando `periodo_id`.

### F6 — Rooster/plantillas de asistencia por parcial con ids
- **Objetivo:** generar fechas por `(periodo_id, periodo_evaluacion_id,
  grupo_id, materia_id)`.
- **Archivos:** `horario-semanal.ts`, `horario-importar.ts`, `asistencias.ts`,
  `asistencias-panel.tsx`.
- **Pruebas:** par parcial=1 genera solo fechas del parcial; validar contra
  calendario y rooster reales (escenario 3RO A MEC/INGLES III).

### F7 — Asistencia asociada a ciclo/parcial + visualizaciones
- **Objetivo:** las filas de asistencia llevan `periodo_id`/`periodo_evaluacion_id`
  y las vistas alumno/tutor las consumen.
- **Archivos:** `supabase/migrar-asistencia-ciclo.sql` (nuevo), `asistencias.ts`,
  `justificaciones.ts`, `calendario-asistencia-alumno.tsx`, acciones tutor.
- **Pruebas:** consulta por alumno→ciclo→grupo→materia→parcial→asistencias y
  flujo de justificación.

## 10. Criterio de éxito (pruebas del objetivo final)

Crear un ciclo nuevo (ej. `2027-2028`) y verificar la cadena completa:

```text
Ciclo creado (borrador)                    ✔ nunca operativo vacío
Materias activas configuradas (por grupo)  ✔ reutilizando materias_id
Grupos asociados                            ✔ clonación selectiva de origen
Inscripciones configuradas                  ✔ operación explícita + preview
Parciales configurados (número/nombre/fechas) ✔ dentro del rango, sin solape
Calendario configurado                      ✔ días clase/festivos por periodo_id
Rooster puede utilizar el ciclo             ✔ horario por periodo_id
Asistencia genera archivos por parcial      ✔ solo fechas del parcial (plantilla)
Asistencia queda asociada al ciclo/parcial  ✔ columnas periodo/parcial en BD
Alumno resuelve su contexto                 ✔ grado/grupo/carrera/materias
Tutor/padre consulta asistencia             ✔ grado→grupo→materia→alumno→justif.
```

Anti-criterio: no basta con que la UI “funcione”; **ningún ciclo operativo puede
existir sin el contexto académico mínimo** (bloqueado por `validarIntegridad`).

---

**Nota final:** esta fase fue de AUDITORÍA Y DISEÑO (solo lectura). No se
modificó código ni datos. Las fases F1–F7 son propuestas de implementación
posterior y deben respetar `docs/REGLAS_NO_HACER.md` y `filosofia.estructural`.







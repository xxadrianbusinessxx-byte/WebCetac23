# Flujo técnico de `mi-web-escolar`

Nota acompañante del canvas [[flujo-tecnico]]. El canvas es el mapa; esto es el índice
buscable. Todo lo de aquí está medido sobre el código real (174 archivos `.ts`/`.tsx`
en `app/` + `lib/`, 40 `.sql` en `supabase/`), no sobre documentación histórica.

---

## 1. Stack y de qué lenguaje viene cada cosa

| Capa | Lenguaje / runtime | Dónde vive |
|---|---|---|
| Entrada / render inicial | React Server Components (TSX, corre en Node) | `app/**/page.tsx`, `app/layout.tsx`, `proxy.ts` |
| UI | React 19.2 en el navegador (`"use client"`) | `app/components/**`, `*-client.tsx` |
| Transporte | Server Actions de Next 16.2 — un POST que Next enruta solo | `app/actions/*.ts` (`"use server"`) |
| Dominio | TypeScript 5 puro + orquestación | `lib/**` |
| Acceso a datos | `@supabase/supabase-js` → HTTP PostgREST | `lib/supabase/*`, cualquier `.from()` |
| Base de datos | PostgreSQL + PL/pgSQL | `supabase/*.sql` |
| Archivos | Supabase Storage (3 buckets) | justificaciones, documentos, calificaciones |
| Imágenes | **Cloudinary** (única API externa) | `lib/cloudinary/**` |
| Excel/CSV | SheetJS `xlsx` — se usa en cliente **y** servidor | `horario-importar.ts`, `asistencias.ts`, `csv.ts` |
| Cripto | `node:crypto` — HMAC-SHA256 (sesión), scrypt (tutores), `timingSafeEqual` | `lib/auth/*`, `lib/escolar/tutores/tutores.ts` |

**No hay REST API propia.** No existe `app/api/`. Todo lo que el navegador pide pasa por
una Server Action; el único `fetch()` a mano del repo es contra el spec OpenAPI de
PostgREST (`lib/escolar/openapi.ts`) para descubrir el esquema en runtime.

---

## 2. La raíz: `periodos.id`

Un ciclo escolar es una fila de `periodos` con un `uuid`. Ese uuid es la raíz de la que
cuelga todo lo demás:

```
periodos.id (uuid)
├─ periodos_evaluacion   (parciales)
├─ grupos                → grupo_materias → materias / carreras
│                        └─ inscripciones_alumno (curp → grupo)  ← fuente única alumno→grupo
│                        └─ asignaciones_profesor (profesor_id + grupo_materia_id)
├─ horario_semanal       (qué clase toca)
├─ calendario_escolar    (qué días son de clase)   ⚠ ver deuda 1
├─ clases_impartidas / asistencia_alumnos
├─ justificaciones_asistencia
└─ academico_semestres   (oferta activa por grado)
```

La exclusividad («solo un ciclo operativo») no es una convención de código: la impone
`activar_ciclo_operativo()` en PL/pgSQL, que además exige grupos > 0, materias activas > 0
e inscritos > 0 antes de activar.

---

## 3. El recorrido de una petición, paso a paso

Ejemplo real: un profesor sube asistencia.

1. `app/profesor/page.tsx` (RSC) → `obtenerSesionPortal()` lee la cookie firmada y
   renderiza `ProfesorClient` con el rol ya resuelto.
2. `AsistenciasPanel` (`"use client"`) llama `actionDescargarPlantillaAsistencia()`.
3. `app/actions/asistencias.ts` valida sesión y delega en
   `lib/escolar/asistencia/asistencias.ts::generarPlantillaAsistencia()` → XLSX con SheetJS.
4. El profesor sube el archivo → `actionPrevisualizarAsistencias()` →
   `analizarPlantillaAsistencia()` + `previsualizarAsistencias()`. **Nada se escribe aún.**
5. Confirmación → `actionConfirmarAsistencias()` → `confirmarAsistencias()` construye el
   plan con `atribucion-profesor.ts` (módulo puro) y hace UPSERT con `onConflict`
   variable según haya materia resuelta o no.
6. `supabase-js` traduce eso a `POST /rest/v1/asistencia_alumnos` con
   `Prefer: resolution=merge-duplicates`.
7. Postgres aplica el índice único y los triggers `set_updated_at`.

El patrón **previsualizar → confirmar** se repite en asistencia, horario, carga académica,
alumnos y etiquetas. Es la forma del repo.

---

## 4. Inventario por módulo (los que importan)

### Sesión
- `lib/auth/portal-login.ts::validarAccesoPortal()` — prueba PROFESORES → ALUMNOS → tutores.
- `lib/auth/session.ts` — `encodePortalSession` / `decodePortalSession` (HMAC-SHA256),
  `setPortalSessionCookie` (httpOnly, 7 días).
- `lib/auth/session-server.ts::obtenerSesionPortal()` — **lo llama casi toda action**.
- `lib/supabase/service.ts::createServiceClient()` — service_role, salta RLS. Solo servidor.

### Ciclo
- `ciclo-estado-puro.ts` — `resolverEstadoPeriodo`, `planActivacionExclusiva`, `unicoOperativo`. Sin I/O.
- `ciclo-estado.ts` — `crearCicloBorrador`, `estadoActualCiclo`, `validarIntegridadCiclo`,
  `activarCicloOperativoAtomico` (RPC) con fallback REST idempotente.
- `evaluaciones.ts` — `rangosSeSolapan`, `resolverEvaluacionPorFechaLocal`, CRUD de parciales.
- `orquestador-ciclo.ts` — `crearCicloConContexto`, `registrarTransicionCiclo`.

### Catálogo académico
- `catalogo-academico.ts` (1029 L) — `resolverGrupoAlumno`, `resolverMateriasAlumno`,
  `resolverGrupoMateriasBatch`, `validarAccesoAlumno`, `validarAccesoProfesor`.
- `contexto-ciclo.ts` — `clonarContextoAcademico`, `planRepararTablaLegacy`.
- `carga-academica.ts` / `inscripciones-borrador.ts` / `migracion-catalogo.ts`.

### Horario
- `horario-importar.ts` (1267 L) — `leerLibroExcel`, `localizarHojaDetalle`,
  `analizarFilasHorario`, `advertenciasResumenVsDetalle`, `aplicarImportacionHorario`.
- `horario-semanal.ts` (858 L) — `consultarHorarioAlumno`, `bloquesDeGrupoEnFecha`,
  `bloquesDelProfesorEnGrupo`, más helpers puros (`horaAMinutos`, `duracionMinutos`).

### Asistencia
- `asistencias.ts` (1685 L) — el módulo más grande del repo. Plantilla → análisis →
  preview → confirmación → consulta de estados → `calcularPorcentajeAsistencia`.
- `atribucion-profesor.ts` — puro. Define las claves de conflicto del UPSERT y la regla
  congelada: sin `profesor_id` de sesión **no se escribe nada**.
- `asistencia-parcial.ts`, `fechas.ts` (`serialExcelAFechaISO`).

### Justificaciones
- `justificaciones.ts` — `calcularClasesJustificadasPorDia` (cruza con horario),
  `aplicarAsistenciaJustificada`, mensajería directivo↔tutor, validación de archivo.

### Materias y calificaciones
- `mapeo-columnas-materia.ts` (612 L) — `calcularPromedioPonderado`, `validarPesosActividades`,
  `resolverColumnaFisica`, `detectarColisionesEncabezados`.
- `columnas-calificaciones.ts`, `materia-avance.ts`, `schema-tabla.ts`, `hoja-tabla.ts`.

### Alumno
- `acceso-alumno.ts::resolverAccesoAlumno()` — quién puede ver a quién.
- `etiquetas-dinamicas.ts` (puro) + `etiquetas-dinamicas-servicio.ts` (I/O).
- `alumnos.ts` — `analizarRoster`, `previsualizarSincronizacionAlumnos`.

### Tutores
- `tutores.ts` (1064 L, `server-only`) — scrypt, contraseña inicial derivada del CURP del
  hijo, `generarTutoresAutomaticos`, `desactivarTutoresHuerfanos`.

---

## 5. Lo que se ejecuta como SQL, no como JS

| Objeto | Tipo | Qué hace | Se llama desde |
|---|---|---|---|
| `activar_ciclo_operativo(uuid)` | PL/pgSQL | Activación atómica + exclusividad + validaciones | `ciclo-estado.ts` |
| `eliminar_ciclo(uuid)` | PL/pgSQL | Borrado en cascada controlada | `eliminar-ciclo.ts` |
| `obtener_perfil_alumno(text)` | PL/pgSQL → `jsonb` | Perfil completo en **una** llamada (alumno + etiquetas + inscripción + grupo + carrera + periodo + semestres + alias + comentarios) | `actions/escolar.ts` |
| `traspasar_materia_a_profesor(...)` | PL/pgSQL | Traspaso con histórico | `traspaso-materia.ts` |
| `escolar_agregar_columnas(...)` | PL/pgSQL + `EXECUTE format()` | DDL en caliente sobre tablas de materia | `materia-avance.ts` |
| `escolar_sync_columns(...)` | PL/pgSQL | Sincroniza columnas físicas | `schema-tabla.ts` |
| `set_updated_at()` | trigger | `updated_at` en 9 tablas | automático |
| `alumno_etiquetas_verificar_limite()` | trigger | Máx. 20 etiquetas por alumno | automático |

RLS: las policies actuales son `*_all` con `USING (true)`. La autorización real vive en
TypeScript (`resolverAccesoAlumno`, `validarAccesoProfesor`, `nivelAccesoProfesor`), no en
la base. Es una decisión, pero conviene saberla.

---

## 6. Deudas estructurales visibles en el código

1. **Calendario con dos identidades.** `lib/escolar/ciclo/calendario.ts` mantiene vivo el camino
   legacy por texto (`ciclo_escolar`, marcado `@deprecated`) junto al camino por
   `periodo_id`. Mientras un día pueda existir bajo ambas claves, calendario y asistencia
   pueden discrepar. `planBackfillCalendario()` es la migración prevista.
2. **Identidad del profesor.** La identidad estructural es `PROFESORES.ID`; `CLAVE` se
   repite entre profesores. La sesión ya lleva `profesorId`, `atribucion-profesor.ts` ya lo
   exige, y `profesor_clave` queda como columna legacy nullable — pero el detector
   `roster-validacion.ts::profesoresClaveAmbiguos()` sigue siendo necesario.
3. **Una tabla física por materia.** Nombres en texto (`"1RO A MATEMATICAS"`) con columnas
   creadas en caliente. De ahí salen las RPC de DDL, `materias_mapeo_columnas`,
   `materias_nombres_visibles` y todo el descubrimiento de esquema en runtime.

---

## 7. Núcleos puros y sus pruebas

Regla del repo: la decisión se prueba sin base de datos, el I/O queda fuera.

| Módulo puro | Prueba |
|---|---|
| `ciclo-estado-puro.ts` | `scripts/test-ciclo-estado.mjs` |
| `atribucion-profesor.ts` | `scripts/test-atribucion-profesor.mjs` |
| `asistencia-parcial.ts` | `scripts/test-asistencia-parciales.mjs` |
| `etiquetas-dinamicas.ts` | `scripts/test-etiquetas-dinamicas.mjs` |
| `mapeo-columnas-materia.ts` | `scripts/test-mapeo-columnas-materia.mjs` |
| `fechas.ts` | `scripts/test-fechas.mjs` |
| `roster-validacion.ts` | `scripts/test-roster-validacion.mjs` |

Además `scripts/` tiene ~40 `probe-*.mjs` y `diag-*.mjs` de solo lectura contra Supabase:
son el instrumental para medir antes de tocar, tal como pide `AGENTS.md`.

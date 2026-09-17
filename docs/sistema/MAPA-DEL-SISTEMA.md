# Mapa del sistema — síntoma → dónde atacar

Índice **inverso**: se entra por lo que el usuario ve mal y se sale con los 2–4 archivos
que hay que abrir. Está pensado para prompts poco específicos («falla la asistencia»,
«el alumno no ve su materia»).

`FLUJO-TECNICO.md` cuenta el recorrido hacia adelante. Este documento es el atajo.

---

## 0. La regla que evita el 80% de las búsquedas

El repo tiene una convención estricta. Para un dominio `X`:

```
app/components/X-panel.tsx → app/actions/X.ts → lib/escolar/<familia>/X.ts → supabase/*.sql
  (UI, "use client")           (transporte,        (dominio,                    (esquema y RPC)
                                "use server")       la lógica real)
```

**La lógica siempre vive en `lib/`.** `app/actions/` solo valida sesión y delega; si hay
lógica de negocio ahí, es un error de capa. Antes de buscar por todo el repo: probar
`app/actions/<dominio>.ts` y `lib/escolar/<familia>/<dominio>.ts`.

Las siete familias de `lib/escolar/` (`ciclo`, `asistencia`, `horario`, `materia`,
`alumno`, `catalogo`, `tutores`) son las mismas secciones de la tabla de abajo. Lo
transversal —`nombres`, `fechas`, `csv`, `tables`, `types`— vive en la raíz de
`lib/escolar/`. Detalle en `docs/normativo/ORDEN.md` §1b.

Excepciones (dominios cuya lógica está repartida):

| Dominio | Además de `lib/escolar/<dominio>.ts` |
|---|---|
| ciclo | `ciclo-estado.ts` (I/O) + `ciclo-estado-puro.ts` (decisión) + `orquestador-ciclo.ts` + `contexto-ciclo.ts` |
| asistencia | `asistencias.ts` + `atribucion-profesor.ts` (puro) + `asistencia-parcial.ts` + `asistencia-contexto.ts` |
| horario | `horario-semanal.ts` (consulta) + `horario-importar.ts` (Excel) |
| materia | `materia-identidad.ts` + `mapeo-columnas-materia.ts` + `schema-tabla.ts` + `materia-avance.ts` |
| alumno→grupo | `catalogo-academico.ts` (el gran resolvedor) + `inscripciones-borrador.ts` |
| sesión | `lib/auth/*`, no `lib/escolar/` |

---

## 1. Tabla de síntomas

### Ciclo escolar

| Síntoma | Abrir | Medir con |
|---|---|---|
| «El ciclo activo no es el que debería» | `lib/escolar/ciclo/ciclo-estado.ts` → `ciclo-estado-puro.ts::unicoOperativo` · `supabase/crear-rpc-activar-ciclo-f4.sql` | `p0-diag-contexto.mjs`, `diag-duplicados-ciclos.mjs` |
| «Activé un ciclo y se rompió todo» | `normativo/REGLAS_NO_HACER.md` R1–R3 antes que nada · `lib/escolar/ciclo/orquestador-ciclo.ts` | `p0-diag-contexto.mjs`; si confirma, `p0-restaurar-ciclo-operativo.mjs` en dry-run |
| «No me deja activar el ciclo» | La RPC exige grupos>0, materias activas>0, inscritos>0: `ciclo-estado.ts::validarIntegridadCiclo` | `p0-diag-contexto.mjs` |
| «Los parciales se solapan / una fecha no cae en ninguno» | `lib/escolar/ciclo/evaluaciones.ts::rangosSeSolapan`, `resolverEvaluacionPorFechaLocal` | `test-evaluaciones.mjs` (puro, sin base) |
| «El configurador de ciclo falla en un paso» | `app/components/ciclo-configurador/paso-*.tsx` (uno por paso) → `app/actions/ciclo-orquestador.ts` | — |

### Asistencia

| Síntoma | Abrir | Medir con |
|---|---|---|
| «La asistencia no cuadra con el calendario» | **deuda 1**: `lib/escolar/ciclo/calendario.ts` — ver si el flujo entra por `ciclo_escolar` (texto, legacy) o por `periodo_id` | `diag-calendario-periodo.mjs` |
| «El % de asistencia está mal» | `lib/escolar/asistencia/asistencias.ts::calcularPorcentajeAsistencia` + cruce con `horario-semanal.ts::bloquesDeGrupoEnFecha` | `test-asistencia-parciales.mjs` |
| «Se guardó a nombre del profesor equivocado» | **deuda 2**: `lib/escolar/asistencia/atribucion-profesor.ts` (puro; define las claves de conflicto del UPSERT) | `diag-profesor-alcance.mjs`, `test-atribucion-profesor.mjs` |
| «Subí la plantilla y no pasó nada» | Patrón previsualizar→confirmar en `app/actions/asistencias.ts`: `actionPrevisualizar*` NO escribe; solo `actionConfirmar*` escribe | — |
| «Las fechas del Excel salen corridas» | `lib/escolar/fechas.ts::serialExcelAFechaISO` | `test-fechas.mjs` |
| «La asistencia cae en el parcial equivocado» | `lib/escolar/asistencia/asistencia-parcial.ts` + `evaluaciones.ts` | `test-asistencia-parciales.mjs` |

### Alumno, materias y calificaciones

| Síntoma | Abrir | Medir con |
|---|---|---|
| «El alumno no ve una materia que sí cursa» | `grupo_materias.tabla_legacy` vacío o mal → `lib/escolar/ciclo/contexto-ciclo.ts::planRepararTablaLegacy` · `catalogo-academico.ts::resolverMateriasAlumno` | `diag-materias-alumno.mjs`, `diag-preview-reparar-tabla-legacy.mjs` |
| «El alumno aparece en el grupo equivocado» | `inscripciones_alumno` es la fuente única → `catalogo-academico.ts::resolverGrupoAlumno` | `p0-diag-contexto.mjs` |
| «El promedio está mal» | `lib/escolar/materia/mapeo-columnas-materia.ts::calcularPromedioPonderado` + `validarPesosActividades` | `test-mapeo-columnas-materia.mjs` |
| «Falta una columna en la tabla de materia» | DDL en caliente: `materia-avance.ts` → RPC `escolar_agregar_columnas`; `schema-tabla.ts` → `escolar_sync_columns` | `probe-schema-tabla.mjs`, `probe-columnas-materia.mjs` |
| «El nombre de la materia sale raro» | `nombreVisible` (presentación) vs `idInterno` (tabla real): `materia-identidad.ts`, `nombres-visibles.ts` | `test-materia-identidad.mjs` |
| «Se traspasó mal una materia entre profesores» | `lib/escolar/materia/traspaso-materia.ts` → RPC `traspasar_materia_a_profesor` | `test-traspaso-materia.mjs` |
| «El perfil del alumno carga incompleto o lento» | Todo el perfil sale de **una** RPC: `supabase/crear-rpc-obtener-perfil-alumno.sql` ← `app/actions/escolar.ts` | `fase10-perfil-datos.mjs` |

### Horario

| Síntoma | Abrir | Medir con |
|---|---|---|
| «La importación del horario descarta filas» | `lib/escolar/horario/horario-importar.ts::analizarFilasHorario` + `advertenciasResumenVsDetalle` | — |
| «El alumno ve un horario incorrecto» | `lib/escolar/horario/horario-semanal.ts::consultarHorarioAlumno` | `test-roster-validacion.mjs` |
| «Se duplican bloques de clase» | `horario-semanal.ts::bloquesDeGrupoEnFecha` | — |

### Acceso y roles

| Síntoma | Abrir | Medir con |
|---|---|---|
| «No puedo entrar» | `lib/auth/portal-login.ts::validarAccesoPortal` (prueba PROFESORES → ALUMNOS → tutores, en ese orden) | `diagnostico-login-tutor.mjs`, `verificar-login-credenciales-iniciales.mjs` |
| «La sesión se cae» | `lib/auth/session.ts` (HMAC-SHA256, cookie httpOnly 7 días) · `session-server.ts::obtenerSesionPortal` | — |
| «Un profesor ve alumnos que no le tocan» | `catalogo-academico.ts::validarAccesoProfesor`, `nivelAccesoProfesor`. **La autorización vive en TS, no en RLS** (policies son `USING (true)`) | `diag-profesor-alcance.mjs`, `probe-permisos.mjs` |
| «Un tutor no ve a su hijo» | `lib/escolar/tutores/tutores.ts` (scrypt; contraseña inicial derivada del CURP del hijo) · `acceso-alumno.ts::resolverAccesoAlumno` | `verificar-tablas-tutores.mjs`, `6i-diagnostico-login-tutor.mjs` |

### Justificaciones y archivos

| Síntoma | Abrir | Medir con |
|---|---|---|
| «La justificación no descuenta las faltas correctas» | `lib/escolar/asistencia/justificaciones.ts::calcularClasesJustificadasPorDia` (cruza con horario) y `aplicarAsistenciaJustificada` (FIJA el total, es idempotente) | `test-justificacion-por-clase.mjs` |
| «No sube el archivo» | Supabase Storage, 3 buckets · `lib/escolar/documentos.ts` · validación de archivo en `justificaciones.ts` | `probe-documentos.mjs` |
| «Las imágenes no cargan» | Cloudinary es la única API externa: `lib/cloudinary/**` | — |

---

## 2. Deudas: las vivas y las cerradas

Antes de declarar un bug «nuevo», descartar que sea una de las vivas. Casi siempre lo es.

### 2a. Vivas — las tres estructurales

Son deudas de **datos y esquema**. Ninguna se cierra «de paso» dentro de otro cambio:
cada una necesita su propia migración verificada (R8).

| # | Deuda | Cómo se manifiesta | Dónde |
|---|---|---|---|
| 1 | **Calendario con dos identidades** | (2026-09-06, PROMPT-1/T2) El calendario del operativo ya cuelga de `periodo_id` (bucket canónico `SEMESTRE AGO26-ENE27`, 77 filas ligadas). La columna texto `ciclo_escolar` sigue existiendo como legacy (R8): ya no se escribe por ella, pero cualquier lector legacy aún puede discrepar si la usa. **Falta la FK**: `supabase/agregar-fk-calendario-periodo.sql` está escrito y **sin aplicar** | `lib/escolar/ciclo/calendario.ts`: ruta por texto `ciclo_escolar` marcada `@deprecated`; backfill aplicado con `scripts/migrar-calendario-canonico.mjs`. Estado y verificación: `pendientes.json` → `fk-calendario-periodo` |
| 2 | **Identidad del profesor** | Autoría equivocada en asistencia: varios profesores comparten la CLAVE `4321`. **La cifra exacta no se repite aquí a propósito** — vivía en tres documentos y ya divergió. Fuente única: `pendientes.json` → `claves-compartidas-profesores`, que trae su comando: `node scripts/diag-credenciales-duplicadas.mjs` | `atribucion-profesor.ts` ya exige `profesor_id`; `roster-validacion.ts::profesoresClaveAmbiguos()` sigue siendo necesario |
| 3 | **Una tabla física por materia** | Columnas que no existen, nombres en texto, esquema descubierto en runtime | RPC de DDL + `materias_mapeo_columnas` + `materias_nombres_visibles` |

### 2b. Cerradas — y qué impide que vuelvan

Se registran porque el `CONTRATO-DE-CAMBIO` lo exige, y porque una deuda cerrada
sin guardián se reabre sola: los archivos de más de 1 000 líneas ya pasaron de 4
a 7 mientras nadie miraba.

| Deuda | Estaba | Cerrada por | Qué la sostiene ahora |
|---|---|---|---|
| **I/O en `app/actions/`** | 64 llamadas `.from()` en 13 archivos | PROMPT E (2026-09-16) | `test-orden.mjs` **C8**, regla DURA en 0 |
| **Archivos intocables** | 7 archivos de más de 1 000 líneas | PROMPT E | `test-orden.mjs` **C9**, regla DURA en 0 |
| **Lint sin puerta** | 17 errores, y el paso no estaba en el CI | PROMPT F (2026-09-16) | `npm run lint` en el workflow |
| **Cuarentena `_borrador/`** | 21 archivos sin decidir | PROMPT F | ya no existe; lo archivado está en `scripts/_archivo/borrador/` |
| **`ESTADO-ACTUAL.md` desbordado** | 531 líneas con una regla de ~150 | PROMPT F | `verificar-estado-actual.mjs`, ahora **fallo** y no aviso |
| **Server-only en el bundle** | se creía abierta (B4) | **nunca lo estuvo** | medido: 0 símbolos de servidor en los 16 chunks. Ver `PROMPT_CLINE_B4_PURO_VS_IO.md` |

> La última fila no es una deuda cerrada: es una deuda que **no existía** y que
> estuvo dos meses escrita como si existiera. Un detector ingenuo la «confirma»
> con 36 módulos culpables porque cuenta los `import type`, que TypeScript borra.
> Antes de trabajar sobre una deuda documentada, medirla.

Regla R8: **legacy no se elimina prematuramente.**

---

## 3. El bucle de trabajo

```
1. MEDIR      scripts/  (solo los marcados LEE — consultar scripts/README.md antes)
2. LOCALIZAR  esta tabla → 2–4 archivos
3. DECIDIR    ¿la decisión cabe en un módulo puro? entonces va ahí, no en la action
4. CAMBIAR    aditivo por defecto (filosofia.estructural §10)
5. PROBAR     la suite pura del módulo + npx tsc --noEmit + build
6. VERIFICAR  el mismo script del paso 1, y comparar contra la medición inicial
```

Si el paso 1 no tiene script, escribirlo antes de tocar nada: sale más barato que
auditar un cambio a ciegas.

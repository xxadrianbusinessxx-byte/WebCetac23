# F1–F10 — Cierre técnico de la orquestación de ciclos escolares

> Documento permanente de arquitectura y cierre del trabajo F1–F10 sobre
> configuración/orquestación de ciclos escolares (`CicloConfigurador`).
> Su objetivo es que cualquier desarrollador/agente posterior pueda continuar
> el proyecto **sin re-auditar el repositorio desde cero**.
>
> - Rama: `feature/ciclo-f1-f7-sin-push`
> - Último commit de producto previo a esta documentación: `396eeb7`
> - Base (`main`): `7d7ede6` (intacta, sin tocar)
> - Fecha de redacción: tras la validación F1–F10 (incluida validación real
>   contra PostgreSQL/Supabase).

---

## 1. Resumen ejecutivo

El proyecto pasó de una arquitectura donde "el ciclo" podía resolverse de forma
**global** por `periodos.activo` o por **nombre/cadena** (`ciclo_escolar`), a una
arquitectura donde el flujo nuevo usa **identidad explícita**:

```text
periodos.id   (periodo_id en las tablas hijas)
```

como clave canónica. El ciclo vive un ciclo de vida explícito:

```text
BORRADOR
   ↓
configuración (estructura, alumnos/roster, evaluaciones, calendario, horario)
   ↓
validación (validarIntegridadCiclo)
   ↓
activación transaccional (RPC activar_ciclo_operativo)
   ↓
OPERATIVO
   ↓
(desactivación/activación de otro) → HISTORICO
```

La activación nueva es **atómica y única** vía una función PostgreSQL
(`activar_ciclo_operativo(uuid)`); ya no se permite la secuencia de múltiples
UPDATE desde TypeScript para el flujo nuevo.

## 2. Problema original (antes de F1)

Problemas reales encontrados y documentados en las auditorías F0–F2:

- **Resolución global del ciclo**: varios consumidores resolvían "el ciclo
  actual" con `periodos.activo = true` (o `estado = operativo`) de forma
  independiente, con riesgo de divergencia.
- **`activo` como identidad**: el booleano `activo` no distingue BORRADOR de
  HISTORICO (ambos `activo=false`) y no es identidad.
- **Nombres/cadenas de ciclo como identidad**: `ciclo_escolar` (texto) y el
  nombre del ciclo se usaban para resolver períodos; dos ciclos homónimos o
  simultáneos podían mezclarse.
- **Relaciones académicas físicas por grupo**: grupos con el mismo nombre
  pueden existir en períodos distintos (mismo `grado|grupo|nombre`, distinto
  `periodo_id`).
- **`materia ↔ tabla legacy` realmente 1:N**: una materia del catálogo
  (`materias`) puede corresponder a varias tablas legacy; `tabla_legacy`
  pertenece a `grupo_materias`, no a `materias`.
- **El Excel académico NO es un importer de estructura**: el pipeline
  `actionPrevisualizarCargaAcademica`/`actionAplicarCargaAcademica` /
  `lib/escolar/carga-academica.ts` es un **importer de roster/alumnos por
  CURP** que resuelve grupos existentes; no crea grupos/materias/
  `grupo_materias`.
- **Sistemas paralelos**: evaluaciones, calendario y horario existían con
  lógica separada y algunos legacy por texto de ciclo.
- **Activación sin atomicidad**: existía una secuencia TS multi-paso con
  riesgo de dejar estados parciales.
- **Datos históricos con `periodo_id IS NULL`**: calendario/asistencia/
  justificaciones/clases legacy sin período asociado.

## 3. Decisiones arquitectónicas definitivas

### DECISIONES QUE NO DEBEN REVERTIRSE

#### Regla 1 — Identidad del ciclo

En el flujo nuevo la identidad canónica es:

```text
periodos.id / periodo_id
```

NO utilizar `ciclo_escolar`, nombre del ciclo, `activo` ni
`obtenerCicloOperativoGlobal()` para decidir el destino cuando ya existe
`periodoId`. La ruta legacy (sin `periodoId`) se conserva como fallback con su
semántica previa, pero nunca se usa en la ruta nueva.

#### Regla 2 — No construir otro academic importer

Decisión F2 (producto): el Excel existente
(`actionPrevisualizarCargaAcademica` / `actionAplicarCargaAcademica` /
`lib/escolar/carga-academica.ts`) es un **roster/inscripciones por CURP**. NO
crea `grupos`, `materias` ni `grupo_materias`.

```text
ESTRUCTURA ACADÉMICA      → clonar / CRUD existente (contexto-ciclo)
ALUMNOS / INSCRIPCIONES   → Excel + pipeline existente (CURP)
```

NO construir un segundo importer de estructura académica salvo nueva decisión
explícita del proyecto.

#### Regla 3 — Activación

La activación del flujo nuevo debe terminar en:

```text
actionSetActivoCiclo
        ↓
setActivoCiclo
        ↓
activarCicloOperativoAtomico
        ↓
RPC activar_ciclo_operativo(uuid)
```

El RPC es la **autoridad transaccional**. NO volver a implementar una secuencia
equivalente de múltiples UPDATE desde TypeScript.

#### Regla 4 — Validación

Antes de activar: `validarIntegridadCiclo(periodoId)`.

```text
ERROR      = bloquea
WARNING    = informa (no bloquea)
```

El RPC mantiene invariantes críticas como segunda barrera.

#### Regla 5 — Histórico

Los datos históricos con `periodo_id IS NULL` **NO** deben asignarse
automáticamente si la correspondencia no es demostrable (4098 registros hoy
clasificados como no atribuibles automáticamente).

#### Regla 6 — UI

`CicloConfigurador` debe pasar explícitamente `periodoId` a cada paso. NO debe
resolver silenciosamente "el ciclo actual".

## 4. Fases F1–F10 (una por una)

### F1 — Estado e identidad del ciclo (PASS)

- **Objetivo:** introducir estados explícitos `BORRADOR`/`OPERATIVO`/`HISTORICO`
  con columna `periodos.estado` (aditiva) manteniendo `activo` como espejo.
- **Archivos:** `lib/escolar/ciclo-estado-puro.ts` (dominio puro),
  `lib/escolar/ciclo-estado.ts` (capa Supabase), `supabase/agregar-estado-ciclo.sql`,
  lectores globales migrados.
- **Contrato:** coherencia `(estado='operativo') = (activo IS TRUE)` (CHECK real);
  `obtenerCicloOperativoGlobal()` centraliza la resolución global con fallback
  legacy explícito y error ante >1 OPERATIVO.
- **Pruebas:** `test-ciclo-estado` 33/33 · auditoría F1 16/16.
- **Nota:** algunos componentes conservan `activo` local porque representan
  estado de entidad hija (p. ej. grupos/materias activos), NO identidad global.

### F2 — Arquitectura académica / Excel (PASS por decisión arquitectónica)

- **Decisión:** el Excel académico es **roster de alumnos por CURP**, no un
  importer de estructura académica.
- **Modelo:** estructura académica se **clona** (clonar contexto académico) o se
  administra con el CRUD existente; alumnos/inscripciones se cargan con el
  pipeline de roster existente. No se construyó un segundo importer.

### F3 — Inscripciones por período (PASS) — commit `396eeb7`

- **Archivos:** `lib/escolar/carga-academica.ts`, `app/actions/carga-academica.ts`,
  `lib/escolar/inscripciones-borrador.ts`, `app/actions/inscripciones-admin.ts`,
  `app/components/ciclo-configurador/paso-alumnos.tsx`.
- **Cambios:** `ContextoAcademico.periodoId?`; grupos resueltos por
  `grupos.periodo_id = periodoId AND activo`; `obtenerInscripcionActivaEnPeriodo`
  (clasificación solo dentro del período); `validarPeriodoDestinoCarga`
  (BORRADOR/OPERATIVO OK; HISTORICO/inexistente rechazo); preview sin escritura;
  confirmación explícita; apply server-side con `inscribirAlumnoEnCiclo`
  (nunca `unaActiva` en la ruta con `periodoId`).
- **Propiedades:** aislamiento A/B (una carga dirigida a B nunca toca A);
  BORRADOR → `activo=false`; idempotencia; sin uso del ciclo global en la ruta nueva.
- **Pruebas:** auditoría F3 25/25 · `inscripciones-f3` 13/13 ·
  `ciclo-f3-pipeline` 52/52 (mock funcional A–N).

### F4 — Evaluaciones (PASS)

- **Modelo:** `periodos_evaluacion` con `periodo_id → periodos.id` (FK real,
  ON DELETE RESTRICT), `numero`, `nombre`, fechas, `activo`; UNIQUE
  `(periodo_id, numero)` y `(periodo_id, nombre)`; CHECK `numero>=1`,
  `fecha_fin>=fecha_inicio`; índice GiST no-overlap.
- **Reglas:** nunca DELETE; desactivación con `activo=false`; listas filtradas
  por `periodoId`; las evaluaciones **no bloquean** la activación
  (advertencia `sin_evaluaciones`).
- **Pruebas:** 20/20.

### F5 — Calendario (PASS)

- **Modelo:** `calendario_escolar.periodo_id` (nullable) + legacy `ciclo_escolar`.
  Índices reales: `UNIQUE(periodo_id, fecha) WHERE periodo_id IS NOT NULL` y
  `UNIQUE(ciclo_escolar, fecha)` (este último es riesgo de coexistencia futura
  entre períodos con el mismo texto; no se modificó).
- **Código:** acciones `*DePeriodo` y panel que recibe `periodoIdInicial`;
  lectura del período por `periodo_id`; el texto `ciclo_escolar` se conserva por
  compatibilidad legacy, no como identidad del flujo nuevo.
- **Histórico:** 153 filas con `periodo_id IS NULL` permanecen NULL (intencional).
- **Pruebas:** 20/20 · `calendario-periodo-f5` 7/7 · `ciclo-calendario` 4/4.

### F6 — Horario (PASS)

- **Modelo:** `horario_semanal` identificado por `(periodo_id, grupo_id)` con
  FKs reales a `periodos`/`grupos`/`materias` (ON DELETE RESTRICT), UNIQUE
  natural `(periodo_id, grupo_id, dia_semana, hora_inicio, materia_clave)` y
  CHECK `hora_fin > hora_inicio` y días `lunes..viernes`.
- **Reglas de validación:** grupo fuera del ciclo → ERROR; solape del mismo
  grupo → ERROR; solape del mismo profesor (`profesor_clave` NOT NULL) → ERROR;
  horario inexistente → WARNING (`sin_horario`).
- **Pruebas:** 17/17 · `roster-validacion` 6/6.

### F7 — Validación de integridad (PASS)

- **Contrato único:** `validarIntegridadCiclo(periodoId)` → `{ ok, errores,
  advertencias }`.
- **Matriz validada:** período (existencia/estado), grupos, materias activas,
  inscripciones, evaluaciones/parciales, calendario (días de clase), horario
  (coherencia por período), fechas/rangos.
- **Regla:** ERROR = bloquea; WARNING = informa.
- **Pruebas:** 15/15.

### F8 — Activación atómica (PASS)

- **Función real desplegada:** `public.activar_ciclo_operativo(p_periodo uuid)`
  (`supabase/crear-rpc-activar-ciclo-f4.sql`), `LANGUAGE plpgsql`,
  transaccional (una sola sentencia; cualquier `RAISE` revierte todo).
- **Comportamiento verificado:** rechaza período inexistente; rechaza HISTORICO;
  rechaza sin grupos; rechaza sin materias activas; rechaza sin inscritos;
  desactiva otro OPERATIVO (→ `estado='historico', activo=false`); convierte el
  destino a `estado='operativo', activo=true`; sincroniza inscripciones por
  relación (`grupos.periodo_id`); activa la fila más reciente por CURP
  (`DISTINCT ON curp ORDER BY created_at DESC`); registra `ciclo_transiciones`
  (no bloqueante); `RAISE` provoca rollback.
- **Código:** `activarCicloOperativoAtomico` (RPC único; sin fallback
  multi-paso); `setActivoCiclo` valida con `validarIntegridadCiclo` antes.
- **Pruebas:** 15/15 · contrato activación F8 5/5.

## 5. F9 — Auditoría real (PASS con bloqueadores → resueltos)

F9 fue la transición de tests/código a **PostgreSQL/Supabase real** (solo
lectura): estructura, constraints, RPC y datos.

Estado inicial encontrado:

```text
2026-2027       → OPERATIVO / activo=true  (93b24c43-3e6c-460f-8a09-595af2f192dc)
AGO2026-DIC2026 → BORRADOR / activo=false
AGO2026-ENE2027 → BORRADOR / activo=false  (7cf5cca7-f448-4f03-a624-8d34fba00aaf)
```

Hallazgos principales:

- Columnas reales confirmadas (`periodos.estado`, `periodo_id` en todas las
  tablas objetivo) y constraints verificados (FK RESTRICT/NO ACTION, UNIQUE,
  CHECK).
- `activar_ciclo_operativo` existía en la BD con la firma correcta.
- **4098 registros legacy con `periodo_id IS NULL`** (calendario 153,
  clases_impartidas 81, asistencia_alumnos 3863, justificaciones 1):
  0 determinables de forma inequívoca por fecha (varios períodos comparten
  rango) → **no atribuibles automáticamente**.
- Decisión de producto: **NO hacer backfill automático**; permanecen NULL.

## 6. F9.5 — Decisiones de migración

Migración explícita aprobada:

```text
2026-2027 (93b24c43-3e6c-460f-8a09-595af2f192dc)
      ↓
AGO2026-ENE2027 (7cf5cca7-f448-4f03-a624-8d34fba00aaf)
```

Movimientos realizados en producción (F10.2):

```text
grupo_materias      : +12 vínculos en destino (241 → 253; origen intacto 253)
inscripciones       : +453 filas preparatorias en destino con activo=false
                       (posteriormente 356 activas, una por CURP)
calendario          : 81 filas movidas origen → destino (ciclo_escolar/fecha intactos)
horarios            : 168 ya existían en destino (idénticos al origen)
evaluaciones        : 3 ya existían en destino
calendario NULL     : 153 permanecen NULL (intencional)
```

## 7. F10 — Producción real

```text
F10.0  PASS  verificación RPC/constraints + snapshot (origen OPERATIVO, destino BORRADOR)
F10.1  PASS  mappings y conteos pre-migración (24↔24 grupos, 253 vs 241 gm,
             168 vs 168 horarios, evaluaciones 0/3, inscripciones 453/0, calendario 81/0)
F10.2  PASS  migración preparatoria real (Paso A +12 gm; Paso B +453 inscripciones
             activo=false; Paso C 81 calendarios) — sin activar
F10.3  PASS  verificación post-migración (destino preparado; origen intacto; 0 huérfanos)
F10.4  PASS  validarIntegridadCiclo(destino) ok=true, errores=0
F10.5  PASS  ACTIVACIÓN REAL vía RPC: AGO2026-ENE2027 → OPERATIVO; 2026-2027 → HISTORICO;
             inscripciones sincronizadas (356 activas en el operativo, 0 en histórico)
F10.6  PASS  prueba controlada de atomicidad: activación fallida de un BORRADOR sin
             grupos → RAISE 'sin grupos', estado idéntico antes/después, sin auditoría falsa.
             (Alcance documentado: fallo previo a escrituras; no se provocó fallo
             post-escritura.)
F10.7  PASS  auditoría real en ciclo_transiciones (1 transición: borrador → operativo)
F10.8  PASS  aislamiento A/B real (solo lectura): B vacío, A completo, 0 cruces
F10.9  PASS  validación UI manual de /configuracion y CicloConfigurador realizada por
             el propietario del proyecto con sesión autenticada (períodos por periodoId;
             BORRADOR vacío no muestra datos de A; sin mezcla de ciclos)
F10.10 PASS  cierre: regresiones, TypeScript, ESLint, diff-check, auditoría de seguridad
```

Nota: F10.6 se declara PASS con alcance documentado (RAISE real previo a
escrituras → rollback total). No se declara un fallo post-escritura provocado
(requeriría corrupción de datos para forzarlo).

## 8. Estado real final de producción

```text
AGO2026-ENE2027 = OPERATIVO / activo=true
2026-2027       = HISTORICO / activo=false
AGO2026-DIC2026 = BORRADOR / activo=false
BORRADOR        = BORRADOR / activo=false   ← creado manualmente por el propietario durante pruebas
```

Aclaración sobre `BORRADOR`: fue creado manualmente por el propietario durante
las pruebas de UI. **No** es un incidente de F10. No eliminarlo ni modificarlo;
documentarlo como dato de prueba/manual actualmente existente.

```text
1 único OPERATIVO
356 inscripciones activas (una por CURP)
453 filas de inscripciones en el operativo
0 inscripciones activas en histórico/borradores
153 registros de calendario con periodo_id NULL
1 transición de activación (ciclo_transiciones)
```

## 9. Modelo de datos (mapa conceptual)

```text
periodos (periodos.id / periodo_id = identidad)
  │
  ├── grupos (grupos.periodo_id → periodos.id)
  │     │
  │     ├── grupo_materias (grupo_id → grupos.id, materia_id → materias.id)
  │     │       └── materias (catálogo; activo)
  │     │
  │     ├── inscripciones_alumno (grupo_id → grupos.id; UNIQUE curp+grupo_id)
  │     │
  │     └── horario_semanal (periodo_id → periodos.id, grupo_id → grupos.id,
  │             materia_id → materias.id; UNIQUE natural; CHECK horas/días)
  │
  ├── periodos_evaluacion (periodo_id → periodos.id; UNIQUE (periodo_id, numero))
  │
  ├── calendario_escolar (periodo_id nullable + legacy ciclo_escolar)
  │
  └── ciclo_transiciones (periodo_id → periodos.id; auditoría)
```

Regla heredada y confirmada:

```text
materia ↔ tabla legacy  = 1:N
tabla_legacy pertenece a grupo_materias (no a materias)
```

## 10. Archivos clave

| Archivo | Responsabilidad | No tocar sin revisar | Dependencias |
| ------- | --------------- | -------------------- | ------------ |
| `lib/escolar/ciclo-estado-puro.ts` | Dominio puro de estados/integridad (sin Supabase) | Reglas de validación | — |
| `lib/escolar/ciclo-estado.ts` | Estado/activación sobre Supabase; `validarIntegridadCiclo`, RPC atómico | Activación y exclusividad | ciclo-estado-puro, calendario |
| `lib/escolar/orquestador-ciclo.ts` | Orquestación/auditoría de transiciones | Auditoría de ciclo | ciclo-estado |
| `lib/escolar/carga-academica.ts` | Roster/inscripciones por CURP; ruta `periodoId` F3 | Aislamiento A/B; nunca `unaActiva` con `periodoId` | catalogo-academico, alumnos, ciclo-estado, inscripciones-borrador |
| `lib/escolar/inscripciones-borrador.ts` | Inscripción por período (BORRADOR → activo=false), listados | Semántica `activo=false`; referencia cruzada grupo→período | ciclo-estado |
| `lib/escolar/evaluaciones.ts` | Parciales por `periodo_id` | FK/UNIQUE `(periodo_id, numero)` | ciclo-estado |
| `lib/escolar/calendario.ts` | Calendario por `periodo_id` + legacy | UNIQUE reales de calendario | tables |
| `lib/escolar/horario-semanal.ts` | Horario por `periodo_id/grupo_id` | UNIQUE natural y CHECKs | tables |
| `lib/escolar/roster-validacion.ts` | Validación de coherencia horario/profesor | Reglas de solape | tables |
| `app/actions/ciclo-orquestador.ts` | Server Actions de ciclo/auditoría | Orquestación | orquestador-ciclo |
| `app/actions/carga-academica.ts` | Server Actions roster (preview/apply) + `extraerContexto` | Flujo `periodoId`/legacy | carga-academica |
| `app/actions/inscripciones-admin.ts` | Server Actions inscripción/listado por período | Aislamiento A/B | inscripciones-borrador |
| `app/actions/evaluaciones.ts` | Server Actions parciales + `setActivoCiclo` → RPC | Activación | evaluaciones, ciclo-estado |
| `app/actions/calendario.ts` | Server Actions calendario | Consultas por `periodo_id` | calendario |
| `app/components/ciclo-configurador/*` | Wizard (datos/académico/alumnos/evaluación/calendario/horario/validación) | Recibir y usar `periodoId`; no resolver ciclo global | actions |
| `app/components/calendario-escolar-panel.tsx` | Panel calendario (recibe `periodoIdInicial`) | Consulta por período | calendario |
| `app/components/horario-escolar-panel.tsx` | Panel horario (recibe `periodoIdInicial`) | Consulta por período | horario-semanal |
| `supabase/crear-rpc-activar-ciclo-f4.sql` | DDL del RPC de activación | Autoridad transaccional | — |
| `supabase/verificar-integridad-ciclo.sql` | SQL read-only de verificación | — | — |

## 11. NO HACER

- No crear otro resolvedor global de ciclo.
- No convertir `periodoId` a nombre y volver a resolverlo por ciclo operativo.
- No usar `activo` global como identidad del ciclo.
- No crear otro importer académico paralelo (grupos/materias/grupo_materias).
- No duplicar CRUD de evaluaciones, calendario u horario.
- No activar mediante múltiples UPDATE desde TypeScript (usar el RPC).
- No backfillear automáticamente los 4098 registros con `periodo_id IS NULL`.
- No tocar datos históricos sin clasificación segura/demostrable.
- No eliminar el fallback legacy sin auditar sus consumidores.
- No mover `tabla_legacy` a `materias` (pertenece a `grupo_materias`).
- No eliminar los `activo` locales simplemente porque exista `periodos.estado`.
- No introducir un segundo sistema de validación que duplique
  `validarIntegridadCiclo`.
- No modificar el RPC de activación sin pruebas de atomicidad/regresión.
- No hacer cambios de arquitectura mientras se trabaja solamente en UI.

## 12. Tests y validaciones

| Fase | Test | Resultado |
| ---- | ---- | --------- |
| F1 | test-ciclo-estado | 33/33 |
| F1 | auditoría F1 | 16/16 |
| F3 | auditoría F3 | 25/25 |
| F3 | inscripciones-f3 | 13/13 |
| F3 | ciclo-f3-pipeline | 52/52 |
| F4 | auditoría F4 | 20/20 |
| F5 | auditoría F5 | 20/20 |
| F5 | calendario-periodo-f5 | 7/7 |
| F5 | ciclo-calendario | 4/4 |
| F6 | auditoría F6 | 17/17 |
| F6 | roster-validacion | 6/6 |
| F7 | auditoría F7 | 15/15 |
| F8 | auditoría F8 | 15/15 |
| F8 | activación contrato | 5/5 |
| F0/F2 | auditorías F0 y F2 | 29/29 · 13/13 |
| Global | TypeScript (`tsc --noEmit`) | PASS |
| Global | ESLint (flujo ciclo) | PASS |
| Global | `git diff --check` | PASS |

F10 se validó contra **PostgreSQL/Supabase real** (constraints, RPC, migración,
activación, atomicidad controlada, aislamiento A/B y auditoría).

## 13. Seguridad / credenciales

Durante la auditoría se detectó material potencialmente sensible en:
`Name_of_archives_excels_CSVs` (referencias a service_role/anon/secret/password).

También existió exposición de credenciales durante la sesión técnica (fuera del
repositorio).

Acciones requeridas (NO incluir valores aquí):

- Rotar el password de PostgreSQL.
- Rotar `SUPABASE_SERVICE_ROLE_KEY`.
- Revisar `Name_of_archives_excels_CSVs`; eliminar secretos reales si existen.
- Revisar el historial Git antes de cualquier push.

## 14. Migración histórica (4098 registros NULL)

Los 4098 registros continúan con `periodo_id IS NULL` **intencionalmente**:

```text
calendario_escolar     153
clases_impartidas       81
asistencia_alumnos    3863
justificaciones_asistencia  1
```

Son **datos históricos no clasificables automáticamente** (los períodos
comparten rangos/estructura y no hay evidencia inequívoca por fecha). No se
describen como "pendiente obligatorio"; si el proyecto lo necesita, una fase
futura podrá hacer clasificación **manual/segura** (con evidencia externa).

## 15. Estado del repositorio

```text
Branch: feature/ciclo-f1-f7-sin-push
Base:   main = 7d7ede6 (intacta)
Último commit de producto previo a docs: 396eeb7
Commit de documentación/cierre: creado en esta fase (solo documentación)
Main intacta: YES · push: NO
```

Untracked preexistentes que NO deben incluirse en commits:
`scripts/diag-duplicados-ciclos.mjs`,
`scripts/diagnostico-ciclo-activo-bug.mjs`,
`supabase/agregar-periodo-vigente.sql`.







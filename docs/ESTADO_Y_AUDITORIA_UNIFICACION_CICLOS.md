# Estado y Auditoría — Unificación de Ciclos Escolares (WebCetac23 / AulaNube)

> Documento para otra IA que auditará el repo en git. Describe QUÉ se hizo,
> QUÉ falta, BUGS conocidos y cómo verificar. No sustituye el código.

## 1. Objetivo del proyecto en curso

Unificar en UN SOLO sistema configurable las representaciones paralelas del
ciclo escolar que hoy conviven:

1. `periodos` (raíz UUID, estado/vigencia);
2. `calendario_escolar` (históricamente por texto `ciclo_escolar`);
3. asistencias/horario/evaluaciones (que resolvían “el ciclo” por heurísticas).

El resultado debe ser un **workspace único** (CicloConfigurador) donde el
directivo prepara un periodo completo (datos → académico → alumnos →
evaluación → calendario → horario → validación → “marcar vigente/operativo”),
y **todos** los módulos posteriores consumen ese contexto por `periodo_id`.

## 2. Historial real verificado (git)

- `origin/main` = `989ccc6` (confirmado por el usuario como HEAD real del remoto).
- Rama de trabajo local/remota: **`feature/ciclo-f1-f7-sin-push`** (creada desde
  `7d7ede6`, con 7 commits NO fusionados a main: F4, F5, F6, F7, cierre
  F1–F7, props de contexto UI, CicloConfigurador). **No hay merge a main.**
- `origin/main` NO se tocó.

### Archivos clave creados en la rama
- Dominio F1–F7: `lib/escolar/ciclo-estado-puro.ts`, `lib/escolar/ciclo-estado.ts`,
  `lib/escolar/orquestador-ciclo.ts`, `lib/escolar/calendario.ts` (helpers F5),
  `lib/escolar/roster-validacion.ts`, `lib/escolar/asistencia-contexto.ts`,
  `lib/escolar/inscripciones-borrador.ts`.
- Server Actions: `app/actions/evaluaciones.ts` (ampliada), `ciclo-orquestador.ts`,
  `inscripciones-admin.ts`.
- UI: `app/components/ciclo-configurador/` (index + pasos datos/académico/alumnos/
  evaluación/calendario/horario/validación), y props de contexto en
  `calendario-escolar-panel.tsx` (`cicloInicial`) y `horario-escolar-panel.tsx`
  (`periodoIdInicial`).
- SQL preparados en la rama: `supabase/agregar-estado-ciclo.sql`,
  `agregar-periodo-id-calendario.sql`, `agregar-periodo-asistencia.sql`,
  `crear-rpc-activar-ciclo-f4.sql`, `crear-auditoria-ciclo.sql`.
- Tests: `test-ciclo-estado.mjs`, `test-inscripciones-f3.mjs`,
  `test-evaluaciones.mjs`, `test-ciclo-calendario.mjs`, `test-roster-validacion.mjs`,
  `test-asistencia-contexto.mjs` (suite ~87 aserciones en verde en su momento).

### Trabajo SIN commitear (untracked, Pieza 0 en curso)
- `scripts/diag-duplicados-ciclos.mjs`, `scripts/diagnostico-ciclo-activo-bug.mjs`
  (diagnósticos SOLO lectura).
- `supabase/agregar-periodo-vigente.sql` (concepto `periodos.vigente` exclusivo).


## 3. Estado real de Supabase (verificado por lectura 2026-09-03, tarde)

- Periodos (3): `2026-2027` `activo=true` `estado=operativo` (356 inscripciones
  activas); `AGO2026-ENE2027` inactivo `estado=borrador` (con contexto:
  grupos/materias/horario/parciales); `AGO2026-DIC2026` inactivo `estado=borrador`
  (VACÍO, candidato a borrar previa confirmación).
- Columnas aplicadas en BD (ejecutadas externamente, no por esta sesión):
  `periodos.estado`; `calendario_escolar.periodo_id` (**81/234** ligadas, 153
  huérfanas por nombre legacy); `periodo_id` en las 3 tablas de asistencia
  (columnas sí, backfill NO: 0 filas con valor); RPC `activar_ciclo_operativo`
  existe; tabla `ciclo_transiciones` existe (0 filas);
  `ampliar-materias-15-aliases` aplicado (materias=15, 5 talleres,
  grupo_materias MAT011-015=13, aliases=13).
- **`periodos.vigente` NO existe todavía** en Supabase (Pieza 0 pendiente).
- `listarCiclosEscolares` **NO** fue actualizado (sigue leyendo solo
  `calendario_escolar.ciclo_escolar`).

## 4. Bugs / pendientes conocidos (no ocultar)

1. **Rollover de ciclo**: al pasar a un periodo nuevo, los alumnos conservan
   credencial pero pueden quedarse sin inscripción vigente (~105 detectados sin
   inscripción activa). Falta el flujo de reasignación explícita (wizard
   Excel→periodoId, Pieza 3) — NO ejecutar masivamente sin confirmación.
2. **Tres semánticas de ciclo** a unificar: `activo` (varios posibles en
   admin), `estado` (borrador/operativo/historico) y el nuevo `vigente`
   (exclusivo, aún no aplicado). El código de la rama usa `activo/estado`;
   la Pieza 0 introduce `vigente` — requiere adaptar
   `actionObtenerCicloActual`, `resolverGrupoAlumno`
   (`lib/escolar/catalogo-academico.ts:308`), `cargarContextoCatalogoAsistencia`
   (`lib/escolar/asistencias.ts:321`), carga académica, semestres admin,
   `configuracion/page.tsx`, migración de catálogo y RPC perfil (JOIN periodos),
   con fallback mientras la columna no exista.
3. **Calendario huérfano**: 153 filas legacy sin `periodo_id` (nombres
   `SEMESTRE AGO26-ENE27`, `PRIMER/SEGUNDO/TERCER PARCIAL…`) pendientes de
   mapeo manual/limpieza.
4. **Asistencia sin backfill**: columnas `periodo_id` agregadas pero todas las
   filas existentes NULL (resolver por fecha→periodo de forma segura).
5. **Selector de plantillas del profesor** (`listarCiclosEscolares`) no lista
   periodos sin calendario (Pieza 1 no hecha).
6. **Duplicados**: `AGO2026-ENE2027` se conserva como plantilla (FK RESTRICT,
   tiene contexto); `AGO2026-DIC2026` vacío (delete requiere confirmación).
7. Errores de lint preexistentes (`react-hooks/set-state-in-effect`) en varios
   componentes; no corregir fuera del alcance.

## 5. Qué verificó ya la sesión (hechos, no promesas)

- Diagnóstico read-only: 356/356 inscripciones activas → periodo `2026-2027`
  activo=true; **0** con periodo inactivo (el “bug de ciclo activo” NO se
  reproduce hoy en este estado).
- Migraciones listadas verificadas contra Supabase real (no memoria).
- `p0-restaurar-ciclo-operativo.mjs`: ejecutado una vez (P0) con `--apply`
  (2 PATCH sobre periodos); hoy abortaría por precondiciones; NO resuelve los
  ~105 sin inscripción.
- Activación idempotente de `2026-2027` con el código actual: ok sin cambios
  (ya es el único operativo; validación de integridad pasaría).

## 6. Prompt para la IA auditora (copiar/adaptar)

> Eres auditor del repo `mi-web-escolar` (rama `feature/ciclo-f1-f7-sin-push`).
> Objetivo: verificar y reportar el estado de la unificación de ciclos
> escolares hacia un único sistema configurable por `periodo_id`.
>
> 1. Git: lista ramas, `git log origin/main..HEAD --oneline`, `git diff
>    origin/main...HEAD --stat`. NO hagas merge/rebase ni push a main.
> 2. Lee `docs/ESTADO_Y_AUDITORIA_UNIFICACION_CICLOS.md`, `AGENTS.md`,
>    `contexto.feliz`, `filosofia.estructural`, `criterios.prompts`,
>    `docs/REGLAS_NO_HACER.md`, `docs/P1_CICLO_RAIZ_AUDITORIA_DISENO.md`.
> 3. Verifica código (no memoria): cuáles `.eq("activo", true)` operan sobre
>    `periodos` (resolver “ciclo actual”) vs otras tablas. Reporta cada uno.
>    Verifica si `listarCiclosEscolares` fue actualizado (no lo fue) y si
>    `clonarContextoAcademico` filtra `grupo_materias.activo=true` (sí lo hace;
>    confírmalo).
> 4. Verifica Supabase en SOLO LECTURA (SQL Editor o REST): columnas
>    `periodos.estado`, `calendario_escolar.periodo_id`, `periodo_id` en las 3
>    tablas de asistencia, RPC `activar_ciclo_operativo`, tabla
>    `ciclo_transiciones`, estado de `periodos.vigente` (no existe). Reporta
>    qué SQL está ejecutado vs pendiente.
> 5. Ejecuta pruebas: `test-ciclo-estado.mjs`, `test-inscripciones-f3.mjs`,
>    `test-evaluaciones.mjs`, `test-ciclo-calendario.mjs`,
>    `test-roster-validacion.mjs`, `test-asistencia-contexto.mjs`,
>    `npx tsc --noEmit`, `npm run build`. No borres ni desactives tests.
> 6. NO ejecutes SQL de escritura, NO reasignes alumnos, NO borres periodos,
>    NO cambies el ciclo operativo real. NO toques `main`.
> 7. Entrega: tabla SQL ejecutado/pendiente, lista de puntos
>    `activo→vigente` pendientes, bugs reproducidos, archivos clave y
>    recomendación de orden de implementación (Piezas 0→4).


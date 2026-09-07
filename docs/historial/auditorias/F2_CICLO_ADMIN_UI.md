# F2 — Panel administrativo del ciclo escolar (BORRADOR/OPERATIVO/HISTORICO)

**Fase:** F2 (UI del ciclo + preparación segura para F3). Solo adaptación de la
pantalla existente; sin migraciones de calendario/asistencia/roster.

## 1. Pantalla modificada

- `app/components/ciclo-evaluaciones-admin.tsx` — panel existente de
  `/configuracion` («Ciclo escolar y periodos de evaluación»). Se **reutilizó y
  adaptó**; no se creó una segunda pantalla.
- `app/actions/evaluaciones.ts` — dos Server Actions nuevas de lectura
  (directivo): `actionListarCiclosAdmin()` (listado ligero con estado) y
  `actionDetalleCicloAdmin(periodoId)` (conteos + integridad bajo demanda).

## 2. Funciones de F1 reutilizadas (sin duplicar reglas)

- `listarPeriodos()` → estado/esquema por fila (compatibilidad `estado`/`activo`).
- `resolverEstadoPeriodo()` → interpretación única OPERATIVO ⇔ activo=true.
- `validarIntegridadCiclo()` → reglas de integridad (bloqueantes/advertencias).
- `resumenCicloParaAdmin()` (aditiva en F1) → conteos + validación en una sola
  carga (sin N+1, sin recalcular en cada render; se ejecuta bajo demanda).
- `crearCicloBorrador()` vía `actionCrearCicloEscolar()` (crear **nunca** activa).
- `setActivoCiclo()` → Server Action con validación server-side: al activar
  ejecuta `activarCicloOperativo()` (validación + exclusividad + histórico).

## 3. Flujo representado en la UI

```text
BORRADOR → configuración (rango/parciales/semestres) → Validar nuevamente
        → si hay bloqueantes: NO puede activarse (botón deshabilitado)
        → sin bloqueantes: Activar ciclo (OPERATIVO)
OPERATIVO → Desactivar (histórico)
HISTORICO → solo consulta (sin activar/borrar)
```

- Chip por ciclo: `OPERATIVO` (verde), `BORRADOR` (ámbar), `HISTORICO` (gris).
- Sin columna `estado` (migración pendiente) se muestra `OPERATIVO` para el
  activo y `INACTIVO · esquema F1 pendiente (aplicar SQL)` para el inactivo,
  con nota visible; el código conserva la compatibilidad F1.

## 4. Cómo se muestran bloqueantes/advertencias

En «Continuar configuración / Estado / Administrar» (detalle bajo demanda):

- **Conteos reales:** grupos, materias activas, inscritos activos, parciales,
  días clase (desde Supabase vía `actionDetalleCicloAdmin`).
- **Bloqueantes** (lista roja): impiden activación. El botón `Activar ciclo
  (OPERATIVO)` aparece **deshabilitado** (`Activar bloqueado`).
- **Advertencias** (lista ámbar): no bloquean.
- Botón `Validar nuevamente` → re-ejecuta `validarIntegridadCiclo()` en servidor.


## 5. Operaciones que puede hacer un BORRADOR

Desde el mismo panel (sin afectar al ciclo OPERATIVO):

- Crear ciclo (queda BORRADOR, `activo=false`).
- Guardar rango de fechas.
- Configurar parciales (`periodos_evaluacion`).
- Configurar semestres (`academico_semestres` — vía F1).
- Clonar contexto académico desde un origen (paneles existentes).
- Validar integridad y ver bloqueantes/advertencias.

Un BORRADOR puede coexistir con el OPERATIVO: crear/configurar B no llama a
`setActivoCiclo` ni toca el estado del OPERATIVO (protegido también por la
prueba anti-P0 en `scripts/test-ciclo-estado.mjs`).

## 6. Seguridad

- Todas las operaciones sensibles siguen en Server Actions con rol `directivo`
  (`obtenerSesionPortal`).
- `actionDetalleCicloAdmin`/`actionListarCiclosAdmin` solo lectura + rol.
- Activar siempre pasa por `setActivoCiclo → activarCicloOperativo` (F1), que
  vuelve a validar en servidor aunque el botón de la UI esté deshabilitado.
- No se confía en botones/estado visual.

## 7. Compatibilidad

- `activo` se conserva; la UI muestra el estado conceptual.
- Sin la migración `supabase/agregar-estado-ciclo.sql` no hay columna `estado`
  y no se distingue BORRADOR de HISTORICO (el código lo reporta y funciona en
  modo compatibilidad). Aplicar el SQL en el SQL Editor de Supabase activa el
  esquema completo (ver `docs/REGLAS_NO_HACER.md` R1–R3).

## 8. Qué quedó deliberadamente fuera de F2 (F3–F7)

- No se migró `calendario_escolar` a `periodo_id`.
- No se tocaron `clases_impartidas`, `asistencia_alumnos`,
  `justificaciones_asistencia`.
- No se implementó roster, generación por parcial, vistas tutor,
  visualizaciones nuevas, ni se copiaron/movieron inscripciones.
- No se cambió la lógica de resolución de alumnos para usar BORRADOR.
- No se crearon tablas/sistemas paralelos ni se eliminó `activo`.

## 9. Riesgos/deudas detectadas para F3

1. La migración `agregar-estado-ciclo.sql` sigue sin ejecutarse (no hay acceso
   DDL desde este entorno): hasta que se aplique, un ciclo inactivo no puede
   distinguirse como BORRADOR vs HISTORICO en la UI.
2. El listado de configuración (roster/inscripciones/carga) y algunos módulos
   siguen filtrando `activo=true`; F3 deberá permitir preparar BORRADOR sin
   activarlo (la carga de inscripciones es la pieza que hoy exige activo).
3. `validarIntegridadCiclo` usa el calendario por **nombre** del ciclo
   (solo advertencia); al migrar a `periodo_id` (F5) mejorará.
4. Datos pendientes de decisión (ajenos a F2): claves duplicadas de profesor y
   4 inscripciones residuales en `2DO A RH`.

## 10. Dependencia de la migración

`supabase/agregar-estado-ciclo.sql` habilita: chip BORRADOR/HISTORICO real,
default `activo=false`, CHECK de coherencia `estado='operativo' ⇔ activo=true`,
y el flujo completo BORRADOR → OPERATIVO → HISTORICO. Sin ella, F2 funciona en
modo compatibilidad y lo indica en la UI.


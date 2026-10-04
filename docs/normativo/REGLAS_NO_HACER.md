# REGLAS NO HACER — Arquitectura (permanentes)

Propósito: registrar errores arquitectónicos que **NO deben repetirse** y el
contexto que los originó. Este archivo es autoridad permanente (ver `AGENTS.md`:
orden de autoridad nº 3). No es un historial: cada regla expresa una prohibición
y la alternativa correcta.

Incidente raíz: **P0 2026-09-03** (ciclo activo sin contexto académico). Relato,
reparación y cifras: `docs/historial/BITACORA-2026-09.md` («Incidente P0 — movido de
REGLAS») y `docs/historial/informes/INFORME-PROMPT-1-ESQUEMA-Y-DATOS.md` §T4.

## R1. Un ciclo activo no puede existir sin contexto académico operativo

Nunca crear o activar un periodo/ciclo que no tenga el contexto mínimo para ser
operado por el sistema. Crear un ciclo **NO** es únicamente:

```text
INSERT INTO periodos ... activo = true
```

Un ciclo que vaya a ser operativo debe tener contexto coherente en:

```text
periodos · grupos · grupo_materias · materias · inscripciones
horario_semanal · calendario_escolar · periodos_evaluacion · asistencia
```

Regla práctica: **un ciclo con `inscripciones_alumno` activas es el que define
la operación real**. Un ciclo sin inscripciones es un borrador/preparación y
debe permanecer con `activo=false` hasta que el directivo complete su contexto.

Alternativa correcta: mantener el ciclo nuevo como *preparación/borrador* y
activarlo únicamente cuando la verificación de contexto confirme que tiene
inscripciones y horario/calendario.

---

## R2. Crear un ciclo no puede romper el ciclo actual

Nunca ejecutar esta secuencia implícita:

```text
crear ciclo nuevo
→ activar nuevo ciclo
→ dejar ciclo anterior inactivo
→ sin migrar contexto
```

Eso puede dejar a toda la escuela sin identidad académica (incidente P0).

Alternativa correcta: la activación de un ciclo nuevo debe ser **exclusiva** y
**validada**: primero comprobar que el ciclo saliente conserva su contexto o que
el entrante ya tiene el contexto completo (incluidas inscripciones o su
migración explícita).

---

## R3. `activo=true` no debe ser una acción aislada

No permitir que activar un ciclo dependa únicamente de cambiar un booleano sin
verificar su integridad. La activación debe:

- comprobar el contexto del ciclo (grupos, materias, horario, calendario,
  inscripciones cuando aplique);
- desactivar el resto de ciclos activos de forma transaccional y verificada
  (invariante: **exactamente un ciclo activo**);
- registrar el antes/después para poder revertir.

Verificación: la RPC `activar_ciclo_operativo` y `validarIntegridadCiclo`
(`lib/escolar/ciclo/ciclo-estado.ts`). Diagnóstico:
`node scripts/diag-calendario-periodo.mjs`. `8-diagnostico-ciclos.mjs` y
`p0-diag-contexto.mjs` son de la época del P0 y agrupan por texto.

---

## R4. No dividir el concepto de ciclo escolar

El ciclo escolar debe ser progresivamente la raíz común de:

```text
evaluaciones · contexto académico · horario · calendario ·
asistencia · inscripciones
```

No crear sistemas paralelos que vuelvan a representar el concepto de ciclo. En
el incidente P0, `AGO2026-ENE2027` representaba (con otro nombre) el mismo
ciclo/semestre que ya modelaba `2026-2027`, duplicando grupos, materias y
horario y dejando huérfanas a las inscripciones. El modelo fuente de verdad es
la tabla `periodos`.

---

## R5. No usar nombres de ciclo como identificadores estructurales

`calendario_escolar.periodo_id` es la relación estructural. La columna de texto
`ciclo_escolar` es legado (R8) y no tiene por qué coincidir con `periodos.nombre`.
Prohibido en código nuevo: resolver el calendario por texto o construir
`ciclo_escolar` a partir de `periodos.nombre` para leer. Se lee con
`obtenerCalendarioDePeriodo` (`lib/escolar/ciclo/calendario.ts`). Falta la FK:
pendiente `fk-calendario-periodo`.

---

## R6. No solucionar inconsistencias creando otro módulo paralelo

Si existe `periodos` y aparece una necesidad relacionada con ciclos, primero
determinar si debe integrarse en `periodos`. No crear:

```text
nuevo_ciclo · nuevo_periodo · configuracion_ciclo ·
ciclo_asistencias · ciclo_horario
```

sin justificar por qué el modelo existente no puede cumplir la responsabilidad.

---

## R7. No mover alumnos automáticamente al crear/clonar un ciclo

Clonar `grupos` y `grupo_materias` NO implica automáticamente clonar/mover
`inscripciones_alumno`. La migración de alumnos es una operación explícita,
validada y separada, con su propio registro antes/después. La ausencia de esta
separación fue la causa directa del P0.

---

## R8. Legacy no se elimina prematuramente

`configuracion_clases_profesor` y otros componentes legacy no deben eliminarse
hasta demostrar que todos sus consumidores fueron migrados al modelo nuevo.
Los fallbacks legacy (p. ej. `FALLBACK_LEGACY_ETIQUETAS_ACTIVO` en asistencias)
permanecen gated y documentados; nunca se amplían.

---

## Checklist operativo antes de activar un ciclo

1. ¿Existe el periodo en `periodos`? ¿Nombre único (`periodos_nombre_key`)?
2. ¿Tiene grupos activos y `grupo_materias`/`materias` activas?
3. ¿Tiene `horario_semanal` para los grupos que operarán?
4. ¿Tiene días `clase` por `calendario_escolar.periodo_id = periodos.id`? (lo cuenta
   `validarIntegridadCiclo`)
5. ¿Tiene **inscripciones activas** (o una migración explícita aprobada)?
6. ¿Su configuración de semestres (`academico_semestres`) coincide con la
   operación real (sin fila = activo)?
7. ¿Hay **exactamente un** periodo activo al terminar?
8. ¿Quedó registrado el antes/después para rollback?

Si algo falla → el ciclo permanece como preparación (`activo=false`) y NO se
convierte en operativo.


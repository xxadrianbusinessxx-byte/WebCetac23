# REGLAS NO HACER — Arquitectura (permanentes)

Propósito: registrar errores arquitectónicos que **NO deben repetirse** y el
contexto que los originó. Este archivo es autoridad permanente (ver `AGENTS.md`:
orden de autoridad nº 3). No es un historial: cada regla expresa una prohibición
y la alternativa correcta.

Fuente del incidente raíz documentado: **P0 2026-09-03** (restauración de
identidad académica).

---

## Incidente P0 que originó este archivo (resumen)

Estado real encontrado en Supabase:

- Periodo `2026-2027` → `activo=false`, pero con **356 inscripciones ACTIVAS**
  (alumnos reales), grupos, `grupo_materias`, `horario_semanal` (168 bloques),
  calendario propio y configuración de semestres (1/3/5 activos).
- Periodo `AGO2026-ENE2027` → `activo=true`, creado el 2026-09-03 como clon con
  grupos/materias/horario/parciales, pero con **0 inscripciones** y sin
  calendario bajo su propio nombre.
- Consecuencia en cascada: `resolverGrupoAlumno()` exige periodo ACTIVO → al no
  estarlo el de las inscripciones, alumnos y tutores perdieron
  grado/grupo/carrera/materias/asistencias. La credencial seguía funcionando
  porque usa `ALUMNOS` directamente.

Reparación aplicada (mínima, reversible, **sin migración de alumnos**):

1. `periodos.activo = true` para `2026-2027`.
2. `periodos.activo = false` para `AGO2026-ENE2027`.

No se reactivaron semestres: `2/4/6 INACTIVO` es la configuración intencional
del periodo (la operación real del término es con semestres 1, 3 y 5). Quedan
**4 inscripciones activas residuales en `2DO A RH`** (semestre 2 inactivo, sin
horario cargado) pendientes de decisión del directivo; no se modificaron.

---

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

Herramientas existentes de verificación (solo lectura): `scripts/8-diagnostico-ciclos.mjs`
y `scripts/p0-diag-contexto.mjs`.

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

`calendario_escolar.ciclo_escolar` es **texto** (ej. `2026-2027`,
`SEMESTRE AGO26-ENE27`, `PRIMER PARCIAL (SEP-AGO)`) mientras el resto de los
módulos relaciona por `periodo_id` (UUID). Esto es **deuda arquitectónica
conocida** y NO debe replicarse.

Dirección futura (fuera de P0):

```text
calendario_escolar.periodo_id UUID  →  relación estructural única
```

No realizar esta migración durante P0 salvo que sea estrictamente necesaria.
Hasta entonces, todo módulo que resuelva el "ciclo" por texto debe usar el
mismo origen (el periodo activo del catálogo) y validar contra el catálogo.

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
4. ¿Tiene calendario (`calendario_escolar`) **bajo el mismo nombre del periodo**
   (limitación R5 actual)?
5. ¿Tiene **inscripciones activas** (o una migración explícita aprobada)?
6. ¿Su configuración de semestres (`academico_semestres`) coincide con la
   operación real (sin fila = activo)?
7. ¿Hay **exactamente un** periodo activo al terminar?
8. ¿Quedó registrado el antes/después para rollback?

Si algo falla → el ciclo permanece como preparación (`activo=false`) y NO se
convierte en operativo.

---

## Deuda arquitectónica conocida (NO resuelta en P0)

1. `calendario_escolar.ciclo_escolar` texto vs `periodos.id` UUID (R5).
2. Existe `AGO2026-ENE2027` inactivo con parciales y rango, y su calendario fue
   cargado bajo el texto `SEMESTRE AGO26-ENE27` (nombre distinto). Conservado
   como histórico/preparación; no se eliminó.
3. `inscripciones_alumno` en semestres inactivos (`2DO A RH`: 4 alumnos) sin
   horario cargado; requiere decisión del directivo (mover de grupo o desactivar
   la inscripción).
4. Duplicidad de contexto `2026-2027` vs `AGO2026-ENE2027` (grupos/materias/
   horario clonados): la consolidación debe elegir una sola representación del
   ciclo (fase posterior, fuera de P0).
5. Clave de profesor en `PROFESORES` con datos de baja calidad (varias filas
   comparten `CLAVE=4321`) y horario sin `profesor_clave`: la atribución
   profesor→bloque todavía no puede apoyarse en asignaciones; no bloquea el
   flujo actual de plantillas (cualquier profesor genera la plantilla de una
   materia del horario).

---

## Consolidación arquitectónica (fase independiente, PENDIENTE)

El P0 NO implementó la unificación completa ciclo+grupos+materias+horario+
calendario+evaluaciones+asistencia. Ese trabajo es una fase propia y debe
partir de estas reglas. El sistema quedó funcional con su arquitectura actual;
la consolidación sigue pendiente por diseño.


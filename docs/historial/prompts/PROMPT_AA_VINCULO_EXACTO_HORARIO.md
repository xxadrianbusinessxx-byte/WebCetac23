# PROMPT AA — El importador de horario prefiere el nombre exacto de la materia

Redactado por Claude el 2026-10-26 para que lo implemente Cline. Una sola parte, un dominio
(horario). Peso según `node scripts/diag-peso-cambio.mjs`: **1/14 → Cline**.

---

## OBJETIVO

Al importar el horario semanal, cada fila debe vincularse (`horario_semanal.materia_id`) a la
materia del catálogo cuyo **nombre o clave coincide exactamente** con el texto del archivo, aunque
exista también una materia genérica que coincida quitando el número romano. Al terminar debe ser
cierto que re-importar `horario_semanal_corregido_bloques_v2.xlsx` deja **0 filas sin vínculo**,
y que las materias sin nombre exacto (2°, 4°, 6°) se siguen vinculando igual que hoy.

## CONTEXTO (presupuesto acotado — no leer nada más)

Generado con `node scripts/gen-contexto.mjs --agente=cline --tarea=horario lib/escolar/horario/horario-importar-validacion.ts lib/escolar/horario/horario-importar-validacion-puro.ts scripts/test-horario-importar-validacion-puro.mjs`:

- **Cualquier cambio** → `AGENTS.md` · `ESTADO-ACTUAL.md` · `RUMBO.md` · `docs/normativo/REGLAS_NO_HACER.md` · `docs/normativo/INVARIANTES.md` · `docs/normativo/GLOSARIO.md`
- **Tocar horario semanal o su importación** → + `docs/sistema/modulos/HORARIO_SEMANAL_MODULO.md`
- **Ejecutar cualquier script** → + `scripts/README.md` (**obligatorio**, hay scripts que borran tablas)
- **Crear archivo/función/script** → + `docs/normativo/ORDEN.md`

Red de seguridad: `node scripts/test-horario-importar-validacion-puro.mjs` (hoy **20/20**).
`horario-importar-validacion.ts` no tiene suite.

## ESTADO ACTUAL (verificado por Claude el 2026-10-26 — no re-investigar)

**Qué cambió en los datos hoy (ya aplicado, no lo repitas).** Para que la subida de asistencia
dejara de fallar con «No se pudo atribuir la materia…», en los 10 grupos del horario
(1°A-D, 3° MC-A, 3° RH-A/B, 5° MC-A, 5° RH-A/B) se crearon **31 `materias`** con el nombre
exacto del Excel (`clave` = nombre normalizado, p. ej. `INGLES I`), se re-apuntaron sus
**105 `grupo_materias`** (mismo `id`) y se re-vincularon los **169 bloques** de
`horario_semanal`. Las materias genéricas (`INGLES`, `CIENCIAS NATURALES`…) siguen activas:
las usan 2°, 4°, 6° y los grupos B de 3°/5° MC.

**El defecto.** `resolverMateriaCatalogo` (`lib/escolar/horario/horario-importar-validacion.ts:105-117`)
junta en un `Set` TODAS las materias que casan con cualquier candidata de
`clavesEquivalenciaMateria(nombre)` (`horario-semanal-puro.ts:74` — el nombre completo y, fuera de
módulos, el nombre sin romano final) y solo vincula si el `Set` tiene 1. «Inglés I» da
`["INGLES I", "INGLES"]` → casa con `INGLES I` (nueva) **y** con `INGLES` (genérica) → 2 → `null`.

**Medido con la base real (REST, solo lectura):** de los 36 nombres del horario, **12 quedan
ambiguos** con la regla actual — Inglés I/III/V, Ciencias Naturales I/III, Ciencias Sociales I,
Cultura Digital I, Lengua y Comunicación I/III, Pensamiento matemático I/III, Conciencia
Histórica III — y **0** si se prefiere el nombre exacto. Esos 12 cubren **69 de los 169 bloques**.

**Por qué importa ya.** `horario-importar-aplicar.ts:158-162` hace `upsert` de TODAS las
`filasParaEscribir`, y `bloquesDifieren` (`horario-importar-validacion.ts:164-180`) no mira
`materia_id`. Re-importar hoy el mismo Excel **borraría el vínculo de esos 69 bloques**
(`materia_id` → `null`). La asistencia sigue resolviendo por clave
(`asistencia-materia-resolucion.ts:116-131`), pero la vista previa los cuenta como «sin vínculo».

`IndiceMaterias` y `cargarIndiceMaterias` (`horario-importar-validacion.ts:74-102`) son privados;
nadie fuera del archivo los usa (verificado con grep).

## DECISIONES TOMADAS (no las reabras)

1. **Regla.** Primero se buscan las materias que casan con el **nombre completo normalizado**
   (`candidatas[0]`) por clave o por nombre. Si hay **exactamente 1** → esa. Si hay **más de 1** →
   `null` (ambigüedad real; no se cae al genérico). Si hay **0** → se aplica la regla de hoy con
   las candidatas restantes (sin romano): exactamente 1 → esa; si no → `null`.
2. **Una materia cuenta una vez** aunque case por clave y por nombre (como hoy, por `Set`).
3. **La decisión va al módulo puro.** En `horario-importar-validacion-puro.ts`:
   `indiceMateriasDesdeFilas(filas)` y `resolverMateriaEnIndice(materia, indice)`, genéricos
   sobre `{ id: string; clave: string; nombre: string | null }` (sin importar tipos de
   `catalogo/`). `horario-importar-validacion.ts` conserva la consulta (`cargarIndiceMaterias`
   solo hace el `select` y llama a `indiceMateriasDesdeFilas`) y `resolverMateriaCatalogo`
   desaparece en favor de la función pura.
4. **No se toca** la asistencia, `bloquePerteneceAProfesor`, `clavesEquivalenciaMateria` ni
   `bloquesDifieren`. Que el `upsert` reescriba `materia_id` está bien una vez que la regla es
   correcta.
5. **Sin escrituras en la base.** Ni datos ni SQL. La re-importación real la hace el responsable.

## ARCHIVOS

| Archivo | Qué |
|---|---|
| `lib/escolar/horario/horario-importar-validacion-puro.ts` | + `indiceMateriasDesdeFilas` y `resolverMateriaEnIndice` (decisiones 1-3). Importa `clavesEquivalenciaMateria`/`materiaClaveHorario` de `./horario-semanal-puro.ts`. |
| `lib/escolar/horario/horario-importar-validacion.ts` | Usa las dos funciones puras; borra `IndiceMaterias` y `resolverMateriaCatalogo`. Imports relativos. |
| `scripts/test-horario-importar-validacion-puro.mjs` | Casos nuevos (ver RESULTADO ESPERADO). |
| `scripts/diag-vinculo-materias-horario.mjs` (nuevo) | `LEE` (solo GET): lee `materias` activas y `horario_semanal`; imprime cuántos nombres distintos del horario y cuántas filas resuelven a 1 / 0 / >1 materias con la regla pura (importa el `.ts` real), y cuántas filas tienen hoy `materia_id` nulo. Sin nombres de personas. Fila en `scripts/README.md` con columna `LEE(red)`. |
| `docs/sistema/modulos/HORARIO_SEMANAL_MODULO.md` | En la línea de `materia_id` (§ ~47): «se prefiere el nombre exacto; el nombre sin romano solo si no hay exacto». |

## MEDICIÓN

Crea primero el `diag-` y córrelo **con la regla vieja** (antes de tocar `-puro.ts` el diag puede
llevar su copia de la regla actual para medir; luego cámbialo a la función pura). Esperado:
**36** nombres · **12** ambiguos · **69** filas ambiguas · **0** filas con `materia_id` nulo. Después
del cambio: **0** ambiguos y las mismas 0 filas nulas (el cambio no escribe datos).

## RESULTADO ESPERADO

La suite cubre, como mínimo, con un índice de prueba que tenga `INGLES`, `INGLES I` y
`MODULO IV. SUBMODULO I. HIGIENE Y SEGURIDAD`:

- «Inglés I» → `INGLES I` (exacto gana al genérico).
- «Inglés II» → `INGLES` (sin exacto, cae al genérico como hoy).
- «INGLES i» con acentos/minúsculas distintos → `INGLES I`.
- Dos materias distintas con el mismo nombre exacto → `null`.
- «Módulo IV. Submódulo I» → `null` (no se quita el romano en módulos ni se busca por prefijo).
- Una materia que casa por clave y por nombre a la vez cuenta una vez → la resuelve.
- Nombre vacío → `null`.

Y la suite vieja sigue en **20/20** más los casos nuevos.

## REGLAS / ALCANCE

- **Sí:** los archivos de la tabla. **No:** `asistencia/`, `horario-semanal*.ts`,
  `horario-importar-aplicar.ts`, `catalogo/`, ningún SQL ni dato.
- `-puro.ts` sin I/O ni `@/`. Una función ≤ ~30 líneas.
- Mensajes y comentarios en castellano, con la densidad del archivo que tocas.

## VALIDACIÓN

```bash
node scripts/diag-vinculo-materias-horario.mjs
node scripts/test-horario-importar-validacion-puro.mjs
node scripts/test-orden.mjs
npm run test:ci
node scripts/diag-vinculo-materias-horario.mjs
```

## INFORME

En `docs/historial/informes/INFORME-PROMPT-AA-VINCULO-EXACTO-HORARIO.md`, con las 7 secciones de
ORDEN §6: qué se hizo · quién lo ejecutó y qué pudo y no pudo hacer · cómo se ejecutó y se midió
(antes → después) · qué normas respetó (CONTRATO §2) · veredicto frente a la filosofía y la
arquitectura · desviaciones y decisiones propias · lo no verificado (como mínimo: la
re-importación real del Excel v2 con sesión y que la vista previa diga 0 «sin vínculo»).

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
5. Validar: npm run test:ci (el CI completo) + la suite del módulo.
6. Volver a correr el diagnóstico del paso 1 y mostrar antes/después.
7. Entregar: qué archivos tocaste, por qué, y qué NO tocaste pudiendo hacerlo.
```

---

## EJECUCIÓN Y RETROALIMENTACIÓN (2026-10-26)

No lo ejecutó Cline: el usuario pidió «Haz la implementación tú». Lo implementó Claude. Informe:
`docs/historial/informes/INFORME-PROMPT-AA-VINCULO-EXACTO-HORARIO.md`.

Correcciones que la ejecución le hizo a este prompt:

1. **El diag no necesita copia de la regla vieja.** Basta medir la ambigüedad plana (propiedad de
   los datos: 12 · 69 antes y después) y llamar a la función pura real si existe. Una copia de la
   regla dentro del diag habría sido una segunda implementación (R6).
2. **`test:ci` ya venía en rojo** por `test-auditoria-ciclo-f1.mjs` (cita `app/oceano/page.tsx`,
   retirado en `0171d9e`). El prompt dio por hecho un CI verde: conviene correr `test:ci` sobre la
   base ANTES de redactar, y si falla, decirlo en ESTADO ACTUAL. Como `test:ci` encadena con `&&`,
   un rojo temprano oculta los pasos siguientes: se corrieron a mano.
3. **El Excel original abrevia una materia** («Módulo II. Submódulo I», 3° RH A). Ninguna regla
   del importador la vincula; la re-importación debe usar el Excel v2.

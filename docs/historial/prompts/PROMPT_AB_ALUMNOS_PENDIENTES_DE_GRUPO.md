# PROMPT AB — Administración ve a los alumnos pendientes de grupo

Redactado por Claude el 2026-10-29. Implementa: Cline. Revisa: Claude.

## 1. OBJETIVO

En Notificaciones de Administración escolar (panel «Datos incompletos»,
`app/components/datos-incompletos-panel.tsx`) aparecen también los alumnos que
están marcados como **pendientes de administración**, aunque no tengan
inscripción en el ciclo operativo. Junto a cada uno se ve qué le falta y la nota
de la marca. Hoy esos alumnos no salen en ninguna lista.

## 2. CONTEXTO

Paquete generado con
`node scripts/gen-contexto.mjs --tarea=crear lib/escolar/alumno/datos-incompletos.ts lib/escolar/alumno/datos-incompletos-puro.ts app/components/datos-incompletos-panel.tsx scripts/test-datos-incompletos.mjs`.
Vuelve a generarlo tú y respeta su presupuesto de lectura: no leas nada más.

## 3. ESTADO ACTUAL (verificado el 2026-10-29: no lo vuelvas a investigar)

- `leerDatosIncompletosDelCiclo` (`lib/escolar/alumno/datos-incompletos.ts`)
  solo revisa CURP que tienen una `inscripciones_alumno` activa en un grupo del
  ciclo operativo (`periodos.id`). Un alumno sin inscripción no entra nunca.
- El 2026-10-29 se dieron de alta en `ALUMNOS` 9 alumnos **sin inscripción**
  (depuración del roster de 1er semestre). Además se marcaron 2 que ya existían:
  uno nunca tuvo grupo y otra tiene grupo, pero hay que confirmarlo.
- La marca es una **etiqueta dinámica** en `alumno_etiquetas` con
  `titulo = 'Pendiente de administración'`. En `valor` está la nota, por ejemplo
  «Por confirmar: grupo, grado y carrera · Número de control · Excel: 1er semestre».
  Hay 11 filas con ese título.
- Quién cierra cada pendiente: el **Técnico** inscribe al alumno en
  Inscripciones (`inscripcion.editar`). **Administración** captura el número de
  control (`alumno.editar_numero_control`) y quita la etiqueta en el expediente
  (`alumno.editar_etiquetas`). Este prompt no cambia ningún permiso.

## 4. DECISIONES TOMADAS

1. La marca es la etiqueta ya existente. **No se crea tabla ni columna** y no hay
   SQL en este prompt.
2. El título de la marca vive como constante exportada del módulo puro:
   `TITULO_ETIQUETA_PENDIENTE = "Pendiente de administración"`. Compáralo
   recortando espacios y sin distinguir mayúsculas. Nadie más escribe el
   literal.
3. Se agrega un cuarto campo primordial, `"grupo"`, con el rótulo
   «Grupo, grado y carrera». Le falta a un alumno que **no tiene inscripción
   activa en el ciclo operativo** (por `periodos.id`, nunca por nombre: R5).
   Para los inscritos no cambia nada. El conteo de hoy debe dar lo mismo en los
   tres campos que ya existen.
4. El conjunto que se revisa es la unión de dos grupos. Primero, el roster
   activo del ciclo operativo, igual que hoy. Segundo, las CURP que tienen la
   etiqueta. Un alumno con la etiqueta se **lista mientras la etiqueta exista**,
   aunque `faltantes` esté vacío. Por ejemplo, la alumna cuyo grupo hay que
   confirmar ya tiene grupo y número de control. En ese caso se pinta el chip
   «Por confirmar».
5. `AlumnoIncompleto` gana `nota: string | null`, que es el `valor` de la
   etiqueta. La UI la pinta debajo del nombre.
6. Una lectura más, sin N+1: traer `curp, valor` de `alumno_etiquetas` filtrado
   por título. Las CURP de esa lectura que no estén en el roster se agregan a los
   lotes de `ALUMNOS` que ya existen.
7. `revisados` cuenta el roster más los marcados que no tienen inscripción.
   Cuida que nadie se cuente dos veces.

## 5. MEDICIÓN

Antes y después, solo lectura, contra la base:
- `node scripts/test-datos-incompletos.mjs` (la suite del módulo).
- Un conteo de 3 cifras: alumnos con la etiqueta (11), de ellos sin inscripción
  activa en el ciclo operativo (10), y el `resumen.porCampo` actual. Si no hay
  un diag que lo dé, créalo como `scripts/diag-pendientes-administracion.mjs`.
  Debe ser de solo lectura y llevar su fila en `scripts/README.md`.

Después del cambio, `porCampo.grupo` debe dar 10. `curp`, `nombre` y
`numero_control` deben dar lo mismo que antes, más lo que aporten los 10 nuevos.

## 6. RESULTADO ESPERADO

- El panel dice, por ejemplo, «… 10 sin grupo, grado y carrera». Se puede
  filtrar por ese campo desde el mapa: `campoDelModo` reconoce un modo que
  empiece por «grupo».
- Cada alumno marcado sale con su nota y con el chip «falta Grupo, grado y
  carrera» o «Por confirmar».
- El texto de ayuda del panel dice dónde se cierra cada cosa: el grupo lo
  inscribe el Técnico, el número de control se captura en Trámites y la
  etiqueta se quita en el expediente cuando todo esté resuelto.

## 7. REGLAS / SEGURIDAD / RENDIMIENTO

- La decisión (faltantes, unión, conteo) va en `datos-incompletos-puro.ts`, con
  casos en `scripts/test-datos-incompletos.mjs`. Por lo menos: un marcado sin
  inscripción, una marcada con inscripción y nada faltante, un inscrito sin
  marca (no cambia), un mismo CURP en las dos fuentes (cuenta una vez), y un
  título con mayúsculas y espacios distintos.
- La action `actionDatosIncompletosDelCiclo` no cambia. Sigue exigiendo
  `alumno.ver_expediente`.
- Solo se agrega una lectura. No hay escrituras.

## 8. ALCANCE

SÍ: los cuatro archivos del paquete y, si hace falta, el diag nuevo con su fila
en `scripts/README.md`.
NO: permisos, `MATRIZ-PERMISOS.md`, `lib/auth/`, Inscripciones, el alta manual,
`ETIQUETAS PERSONALES`, ni escribir etiquetas desde código. Tampoco borres ni
cambies las 11 etiquetas.

## 9. VALIDACIÓN

```bash
node scripts/test-datos-incompletos.mjs
node scripts/test-orden.mjs
npm run test:ci
```

## 10. INFORME

Qué se hizo · quién lo ejecutó y qué pudo y no pudo hacer · cómo se ejecutó y se
midió (antes → después) · qué normas respetó (CONTRATO §2) · veredicto frente a
la filosofía y la arquitectura · desviaciones y decisiones propias · lo no
verificado (la vista con sesión real de Administración).

## 11. CONTRATO

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

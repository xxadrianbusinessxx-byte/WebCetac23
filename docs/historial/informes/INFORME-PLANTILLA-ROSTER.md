# INFORME — Número de control en la carga del roster y plantilla descargable

**Fecha:** 2026-10-25 · **Base:** `73a7b78` · **Pedido por el usuario en chat.**

---

## 1. Qué se hizo

Dos cosas, las dos sobre Personas › Alumnos › Roster (técnico):

1. **La carga ahora acepta el número de control**, explícitamente y junto a los campos
   que ya traía.
2. **Se puede descargar el roster actual** como `.xlsx` con el grado, el grupo y la
   carrera de cada alumno, para rellenar lo que falte y volver a subirlo por la misma
   carga.

Juntas cierran el circuito del pendiente `roster-sin-numero-control`: hasta hoy la única
forma de capturar 356 números de control era uno por uno, en Trámites escolares.

| Archivo | Qué cambió |
|---|---|
| `lib/escolar/materia/mapeo-columnas.ts` | campo `numeroControl` con sus 13 alias; opcional, como los académicos |
| `lib/escolar/alumno/alumnos.ts` | la sincronización lee, valida y completa `numero_control` |
| `lib/escolar/alumno/plantilla-roster-puro.ts` | **nuevo** — encabezados y forma de la fila |
| `lib/escolar/alumno/plantilla-roster.ts` | **nuevo** — arma la hoja con el roster del ciclo |
| `app/actions/roster.ts` | **nuevo** — la action de descarga |
| `app/components/roster-alumnos-panel.tsx` | el campo nuevo en el mapeo, el botón y el texto de ayuda |
| `app/actions/carga-academica.ts` | el mapeo vacío de su preview gana el campo nuevo |
| `scripts/test-plantilla-roster.mjs` | **nueva** suite (29 checks) |
| `docs/sistema/pendientes.json` | `roster-sin-numero-control` pasa a tener vía de solución |

## 2. Quién lo ejecutó y qué pudo / no pudo hacer

**Un solo agente: Claude.** No intervino Cline.

| Pudo | No pudo / no hizo |
|---|---|
| Medir el roster real antes de diseñar (357 inscritos, 356 sin número) | Probar la descarga con una sesión de técnico: no tengo credenciales |
| Comprobar contra la base que grado/grupo/carrera existen y cómo se reparten | Subir una hoja rellenada de verdad: eso escribe en producción |
| Dejar CI, `test-orden` y `verificar-docs` en verde | Mover a `app/actions/roster.ts` las actions de carga que ya existían (R8: no se reordena lo que funciona de paso) |

## 3. Cómo se ejecutó y se midió (antes → después)

**El dato que gobierna el diseño:** del roster activo del ciclo operativo —357 alumnos—
**356 no tienen número de control**. Y hay grupos que solo se distinguen por la carrera:
«3RO A» existe en MECATRÓNICA (57 alumnos) y en RH (30), igual que «5TO A» (41 y 25).
Por eso la plantilla lleva la carrera y no solo grado y grupo: sin ella, media lista es
ambigua para quien la rellena.

**Lo que se añadió a la carga.** `numero_control` es ÚNICO cuando existe, así que la
sincronización no puede limitarse a escribirlo:

- se valida con la **misma** regla que la captura manual y que el CHECK de la base
  (`numero-control-puro.ts`), para que lo que la carga acepte no lo rechace Postgres;
- si choca con el de otro alumno —ya en la base o repetido en el propio archivo— esa
  celda **se descarta con su motivo** en el detalle de omitidos, en vez de reventar la
  escritura entera;
- se **completa, nunca se sobrescribe**: un número ya capturado a mano manda sobre el
  del archivo, igual que el nombre.

**Lo que garantiza el viaje de ida y vuelta.** Los encabezados de la hoja descargada son
exactamente alias que `mapeo-columnas.ts` reconoce, así que bajar → rellenar → subir no
obliga a mapear ninguna columna. Eso no lo ve `tsc` ni el build: si un encabezado dejara
de ser alias, todo seguiría «funcionando» pero volvería la fricción. Lo comprueba
`test-plantilla-roster.mjs`, encabezado por encabezado.

**Verificación:** `npx tsc --noEmit` limpio · `npm run lint` 0 errores · `npm run test:ci`
en verde · `test-plantilla-roster` 29/29 · `test-mapeo-columnas-materia` 36/36 (el campo
nuevo no rompió el mapeo que ya existía) · `test-orden` con sus 20 reglas en verde.

## 4. Qué normas respetó (CONTRATO §2)

| Norma | Cómo |
|---|---|
| Alcance | Lo pedido. El único archivo que no venía en el encargo es `app/actions/roster.ts`, y existe por C9 (ver §6) |
| C9 — ningún archivo pasa de 1 000 líneas | La action nueva dejó `escolar.ts` en 1 008; se movió a su propio dominio en vez de aflojar la regla |
| Capas | Decisión en `-puro`, I/O en `lib/`, `exigir()` + delegación en la action |
| R8 — no reordenar de paso | Las actions de carga siguen en `escolar.ts` |
| Compatibilidad | Un mapeo guardado sin `numeroControl` sigue siendo válido; hay un check que lo fija |
| Datos | Aditivo: se completa lo vacío, no se sobrescribe ni se borra nada |
| Verificación | `test:ci` verde; medición antes y después contra la base |

No aplican: esquema y SQL (`numero_control` ya existía), `gen:matriz` (sí hay una action
nueva — **se corrió**).

## 5. ¿Sigue la filosofía y la arquitectura?

| Principio | Veredicto |
|---|---|
| Una fuente única por concepto | **Sí.** La regla del número de control vive en `numero-control-puro.ts` y la usan la captura manual, el alta y ahora la carga masiva |
| Medir antes de modificar | **Sí.** La carrera entró en la plantilla porque la medición mostró grupos homónimos |
| La decisión probable sin BD, aparte | **Sí.** 29 checks nuevos sin tocar la red |
| Reversibilidad | **Sí.** La carga solo completa campos vacíos |

## 6. Desviaciones y decisiones propias

- **`app/actions/roster.ts` es nuevo.** Añadir la action a `escolar.ts` lo dejó en 1 008
  líneas y C9 es DURA. Aflojar el umbral era la otra salida, y es justo lo que AGENTS.md
  prohíbe delegar sin revisión.
- **La plantilla baja el roster del ciclo operativo, no `ALUMNOS` entero.** Quien ya no
  cursa no es trabajo administrativo de hoy, y su inscripción no tiene grado ni grupo que
  poner.
- **Las celdas vacías van vacías**, no con «—» ni «N/D»: así la hoja se rellena y se sube
  sin limpiar nada antes.
- **Se ordena por apellido**, que es como se revisa una lista escolar en papel.
- **Se añadió `MATRICULA` como alias** del número de control: es como lo llaman varias
  áreas, y el archivo de control escolar puede traerlo así.

## 7. Lo no verificado / pendiente

- **Nadie ha descargado la plantilla ni subido una hoja rellenada con sesión real.** La
  consulta que arma la hoja sí se comprobó contra la base (357 filas, grado/grupo/carrera
  presentes y 356 números vacíos), pero el circuito completo no se ha ejecutado.
- **`roster-sin-numero-control` sigue abierto**, y ahora es trabajo de persona: control
  escolar tiene que poner los números en la hoja.
- **Queda sin probar el caso de choque**: subir dos filas con el mismo número de control,
  o uno que ya tenga otro alumno. La decisión está cubierta por código y descrita en §3,
  pero no se ha ejercido contra la base.

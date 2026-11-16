# INFORME — Servicio Escolar pasa a capturar asistencia

**Fecha:** 2026-11-16 · **Base:** `c51b03b` · **Pedido por el usuario en chat**, con tres
decisiones suyas tomadas por pregunta directa (§6).

---

## 1. Qué se hizo

El rol **Servicio Escolar** cambia de oficio: deja de consultar el padrón y pasa a
**capturar asistencia**, en cualquier materia, como lo haría un profesor.

| Antes (2026-10-25) | Ahora |
|---|---|
| Pestañas: **Alumnos**, **Descargas** | Pestaña: **Asistencias** |
| 5 capacidades, todas de lectura | 7 capacidades, **dos de escritura** |
| No escribía en ninguna tabla | Escribe asistencia y clases impartidas |

| Archivo | Qué cambió |
|---|---|
| `lib/auth/permisos.ts` | el rol cambia de juego de capacidades |
| `lib/escolar/asistencia/guarda-alcance-puro.ts` | **nuevo** — la regla que lo frena |
| `lib/escolar/catalogo/asignaciones-profesor.ts` | `profesorActivoDeMateria` (lectura) |
| `app/actions/asistencias.ts` | la guarda, en las tres subidas |
| `lib/navegacion/mapa-navegacion.ts` | pestaña Asistencias; las dos viejas, a `PESTANAS_APAGADAS` |
| `lib/navegacion/contenido-servicio-escolar.ts` | hueco nuevo, los dos viejos intactos |
| `app/components/servicio-escolar-panel.tsx` | monta el panel del profesor |
| `app/components/asistencias-panel.tsx` | `mostrarPlantillaMateria` (presentación) |
| `scripts/test-guarda-alcance.mjs` | **nueva** suite (11 checks) |
| `scripts/test-permisos.mjs` · `test-rediseno-oceano.mjs` | el contrato del rol |
| `docs/sistema/MATRIZ-PERMISOS.md` · `pendientes.json` | §4 y los dos pendientes |

## 2. Quién lo ejecutó y qué pudo / no pudo hacer

**Un solo agente: Claude.** No intervino Cline. Toca `lib/auth/`, que el reparto no
delega sin revisión.

| Pudo | No pudo / no hizo |
|---|---|
| Encontrar, antes de escribir código, que subir asistencia **transfiere la materia** | Probar con sesión real: la cuenta sigue sin clave (pendiente `cuenta-servicio-escolar`) |
| Reutilizar el panel del profesor tal cual, sin una segunda pantalla | Probar la guarda contra la base: necesita dos cuentas y una materia con dueño |
| Dejar la regla con suite propia | — |

## 3. Cómo se ejecutó y se midió

**El hallazgo que cambió el encargo.** «Subir asistencia como si fuera profesor, en
todas las materias» parecía ser solo dar capacidades y montar el panel. No lo era: antes
de guardar, `traspasar_materia_a_profesor` **le da la materia a quien sube**. Leído en el
SQL, no en el comentario: `UPDATE asignaciones_profesor SET activo = false` para el dueño
anterior, y después `DELETE` + `UPDATE` sobre `clases_impartidas` y `asistencia_alumnos`
para mover esas filas al nuevo (archivando las originales en
`asistencia_traspasos_historico`). Es correcto cuando quien sube **es** el profesor; con
la cuenta de servicio social significaba quitárselas a todos, materia a materia.

**Estado de la base al decidir** (por eso el riesgo de hoy es bajo, pero la regla
permanente no):

| | |
|---|---|
| `asignaciones_profesor` | 1 fila activa |
| `clases_impartidas` | 100 filas, un solo `profesor_id` |
| `asistencia_alumnos` | 4 642 filas, un solo `profesor_id` (3 863 sin atribuir, legado) |
| Ese profesor | **ID 19 «PROFESOR»**, la cuenta genérica de pruebas, con **1 materia** |

**La solución, que la eligió el usuario entre tres:** una **guarda de alcance en la
action**. Si el rol es `servicio_escolar` y la materia ya tiene asignación activa de otro
profesor, se rechaza con un mensaje que dice qué hacer. Donde nadie la ha reclamado, sube
con normalidad. No toca la capacidad, ni la RPC, ni el dominio, ni el esquema: es una
regla de ALCANCE, y `ORDEN.md` §2 las pone en la action, como `resolverAccesoAlumno`.
**La excepción se activa sola**: en cuanto un profesor adquiere la materia, el servicio
deja de poder tocarla.

La decisión se extrajo a un módulo puro (`guarda-alcance-puro.ts`) para poder probarla
sin red — la action solo reúne las dos lecturas que la alimentan.

**Por qué no hizo falta un «modo todas las materias»:** el panel de asistencias ya ofrece
las materias del **horario del grupo** (`actionObtenerMateriasHorarioGrupo`), no las
asignadas, y las tres actions de subida solo exigían `asistencia.subir` sin comprobar
asignación. El profesor tampoco estaba limitado por materia en este flujo.

**Verificación:** `npx tsc --noEmit` limpio · `npm run lint` 0 errores (2 warnings
preexistentes) · `test-guarda-alcance` **11/11** · `test-permisos` **870** pasadas, 0
fallidas · `test-rediseno-oceano` **546/546** · `test-orden` sin mover trinquetes ·
`npm run test:ci` en verde.

## 4. Qué normas respetó (CONTRATO §2)

| Norma | Cómo |
|---|---|
| Alcance | Lo pedido. La guarda es la condición que el propio usuario eligió |
| R8 — no borrar | Las dos pestañas viejas salen del mapa con su pieza intacta; panel y actions en pie |
| Capas | Decisión en `-puro`, lectura en `lib/`, `exigir()` + alcance en la action |
| Autorización | `asistencia.subir` no se modifica para nadie; el rol la recibe como el profesor |
| Datos | Ninguna fila tocada en este cambio |
| Verificación | La regla nueva tiene suite propia, no solo tipos |
| Documentación | §4 de la matriz, dos pendientes y este informe |

No aplican: esquema y SQL, `gen:matriz` (no hay actions nuevas).

## 5. ¿Sigue la filosofía y la arquitectura?

| Principio | Veredicto |
|---|---|
| Capacidad ≠ alcance | **Sí**, y el cambio lo usa tal cual: misma capacidad, alcance distinto |
| La decisión probable sin BD, aparte | **Sí.** 11 checks sin tocar la red |
| Una regla sin verificación se degrada sola | **Sí.** La guarda tiene su suite |
| No duplicar pantallas | **Sí.** Es el MISMO panel del profesor, con un botón menos |

## 6. Desviaciones y decisiones propias

Tres decisiones las tomó el usuario, preguntadas antes de escribir código:

- **«Solo Asistencias»**: el rol pierde Alumnos y Descargas, no las conserva.
- **También puede anular**, para deshacer su propio error sin depender de nadie.
- **Guarda de alcance en la action**, entre tres opciones (frente a «subir a nombre del
  profesor dueño» y «bloquear el traspaso», que tocaban el dominio y podían duplicar
  filas: la clave de conflicto lleva `profesor_id` dentro).

Decisiones mías:

- **Retirar también las dos capacidades de lectura** (`alumno.ver_roster`,
  `alumno.descargar_etiquetas`). «Solo asistencias» leído de verdad: dejarlas habría
  mantenido una API que sirve datos médicos a una cuenta que ya no tiene esa pantalla.
- **`mostrarPlantillaMateria={false}`**: el panel de asistencias lleva, por historia, un
  botón de plantilla de CALIFICACIONES. Este rol no califica y no tiene
  `materia.descargar_plantilla`: dejarlo visible era un botón que el servidor rechaza.
- **Ante la duda, no se quita**: una sesión sin `profesorId` con materia de otro se
  bloquea igual.

## 7. Lo no verificado / pendiente

- **Nadie ha entrado con el rol.** La cuenta sigue con la clave aleatoria del
  2026-10-25; el directivo tiene que ponerle una (pendiente `cuenta-servicio-escolar`).
- **La guarda no se ha ejercido contra la base.** Su decisión está cubierta por suite,
  pero el camino completo —resolver la materia, leer su dueño, rechazar— no se ha
  ejecutado con datos reales. Hoy solo hay 1 asignación activa, así que casi todo el
  catálogo está «sin dueño» y la guarda no saltaría.
- **Consecuencia que queda en pie, y es la que importa:** en las materias SIN profesor
  asignado, la cuenta de servicio social **sí** queda como profesora de lo que suba. Es
  lo aceptado al elegir esta solución; lo que se evitó es que se la quite a alguien.
- **El panel dirá «Servicio Escolar»** donde el profesor ve su nombre. Las filas se
  atribuyen a `PROFESORES.ID` 23, que es trazable pero no es quien dio la clase.

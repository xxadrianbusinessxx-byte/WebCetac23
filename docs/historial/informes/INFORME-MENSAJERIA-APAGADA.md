# INFORME — Mensajería apagada en todos los roles

**Fecha:** 2026-11-12 · **Base:** `100f675` · **Pedido por el usuario en chat**
(«hay que desactivar CHAT de todos los roles por ahora»), con dos decisiones suyas
tomadas por pregunta directa antes de escribir código (§6).

---

## 1. Qué se hizo

Toda la mensajería del portal sale del mapa de navegación. Dos superficies, no una:

| Superficie | Quién la veía | Estado antes |
|---|---|---|
| **Chat** | alumno, tutor | ya se dibujaba **apagado** («Disponible cuando se defina su estructura de datos») |
| **Mensajes** (bandeja interna) | maestro, directivo, técnico, administración escolar | **operaba** |

| Archivo | Qué cambió |
|---|---|
| `lib/navegacion/mapa-navegacion.ts` | las dos pestañas salen de `MAPA` y pasan a `PESTANAS_APAGADAS` |
| `scripts/test-rediseno-oceano.mjs` | expectativas por rol + invariante nuevo |
| `docs/sistema/MATRIZ-PERMISOS.md` | nota en `mensaje_interno.usar` |
| `docs/sistema/pendientes.json` | pendiente `mensajeria-apagada` |

**Nada más se tocó.** `mensajes-internos-panel.tsx`, `app/actions/mensajes-internos.ts`,
`lib/escolar/mensajes-internos.ts`, la capacidad `mensaje_interno.usar`, los
emparejamientos `"mensajes/bandeja"` de los cuatro `contenido-*.ts` y las tablas con lo
ya escrito **siguen intactos** (R8). Ningún mensaje se borró.

## 2. Quién lo ejecutó y qué pudo / no pudo hacer

**Un solo agente: Claude.** No intervino Cline.

| Pudo | No pudo / no hizo |
|---|---|
| Preguntar antes de tocar nada: «chat» nombraba dos cosas distintas (§6) | Probarlo con sesión real: no tengo credenciales de ningún rol |
| Dejar el apagado reversible en una línea por rol | Retirar panel, actions, capacidad o tablas: eso es otro cambio, y la decisión de si vuelve no es mía |

## 3. Cómo se ejecutó y se midió

**Lo que se comprobó antes de tocar el mapa:** que «chat» nombraba dos superficies con
estados distintos —una apagada sin backend, otra operando— y que no hay ninguna otra
puerta a la mensajería. El panel solo se monta desde los `contenido-*.ts`, y a esos se
llega por `piezaDe(activa.id, …)`, donde `activa` sale de `pestanasDe(rol)`. Con la
pestaña fuera del mapa, `pestana(rol, "mensajes")` devuelve `undefined` y el shell cae
en `pestanas[0]`: **ni escribiendo la URL a mano se llega**.

**El mapa, después del cambio** (medido ejecutando `pestanasDe` rol por rol):

| Rol | Pestañas |
|---|---|
| alumno | perfil, materias, calendario |
| tutor | perfil, materias, calendario |
| maestro | materias, calendario-asistencias |
| directivo | materias, grupos-boleta, calendario-asistencias, administracion, configuracion |
| tecnico | ciclo-escolar, catalogo, personas, contenido, configuracion |
| administracion | expediente, tutores, tramites, notificaciones, documentos |
| servicio_escolar | alumnos, descargas |

**Lo que se añadió a la suite**, que es lo que impide que esto se deshaga sin querer:

- un **invariante** que recorre `PESTANAS_APAGADAS` × los siete roles y exige que
  ninguno las vea;
- la comprobación de huecos (`compruebaHuecos`) ahora distingue: para una pestaña
  apagada exige que el emparejamiento **siga existiendo** y que el rol **no lo alcance**.
  Así, borrar el hueco «para limpiar» rompería la suite — es justo lo que haría el
  apagado irreversible;
- dos asserciones que se habrían vuelto vacuas se reescribieron en vez de dejarlas pasar
  en verde: `pestana("administracion","mensajes") === pestana("tecnico","mensajes")` era
  `undefined === undefined`, y el apartado apagado de Chat ya no se alcanza por rol, así
  que ahora se comprueba sobre el objeto de `PESTANAS_APAGADAS`.

**Verificación:** `npx tsc --noEmit` limpio · `npm run lint` 0 errores (2 warnings
preexistentes) · `test-rediseno-oceano` **533/533** · `test-orden` sin mover ningún
trinquete · `npm run test:ci` en verde.

## 4. Qué normas respetó (CONTRATO §2)

| Norma | Cómo |
|---|---|
| Alcance | Un archivo de navegación. El resto son la suite y documentación del mismo cambio |
| R8 — no borrar legacy | Panel, actions, dominio, capacidad, huecos y tablas intactos |
| Datos | No se tocó ni una fila: los mensajes escritos siguen donde estaban |
| Reversibilidad | Reactivar = devolver el nombre a la fila del rol en `MAPA` |
| Verificación | La suite comprueba el apagado como invariante, no de pasada |
| Documentación | Matriz de permisos anotada, pendiente abierto, RUMBO regenerado |

No aplican: esquema y SQL, `lib/auth/` (la capacidad no se tocó), `gen:matriz` (no hay
actions nuevas).

## 5. ¿Sigue la filosofía y la arquitectura?

| Principio | Veredicto |
|---|---|
| El mapa decide qué se DIBUJA; la capacidad, qué se PUEDE | **Sí**, y este cambio lo usa tal cual: se apaga en el mapa, sin tocar permisos |
| Reversibilidad | **Sí.** Una línea por rol |
| Una regla sin verificación se degrada sola | **Sí.** El apagado tiene invariante en la suite |

## 6. Desviaciones y decisiones propias

Las dos decisiones las tomó el usuario, preguntadas antes de escribir código:

- **Alcance: Chat *y* Mensajes del personal.** «Chat» solo existía para dos roles, así
  que «todos los roles» era ambiguo: podía ser quitar una pestaña muerta o apagar una
  función que opera. Eligió las dos.
- **Forma: oculto con el código intacto**, en vez de dejar la pestaña visible con un
  aviso de «Disponible próximamente».

Decisión mía:

- **`PESTANAS_APAGADAS` es exportada y no un comentario.** Mantiene las dos pestañas
  referenciadas (sin warning de variable sin uso), documenta la decisión donde se toma y
  le da a la suite algo contra lo que comprobar. Un comentario no habría impedido que
  alguien borrara las constantes «porque ya no se usan».

## 7. Lo no verificado / pendiente

- **No se abrió el portal con sesión de ningún rol.** Lo comprobado es el mapa
  (ejecutando `pestanasDe` rol por rol) y la suite; nadie ha visto el tab superior sin
  Mensajes en pantalla.
- **Las Server Actions de mensajería siguen vivas y siguen exigiendo
  `mensaje_interno.usar`.** No es una exposición nueva —los mismos cuatro roles ya la
  tenían ayer—, pero conviene saberlo: la pantalla está apagada, la API no.
- **Si los mensajes guardados tenían que avisarse a alguien antes de ocultar la bandeja,
  eso no se hizo**: nadie recibirá aviso de que su bandeja dejó de ser alcanzable.
- **Queda la decisión de persona** (pendiente `mensajeria-apagada`): si vuelve y para qué
  roles, o si se retira de verdad — y entonces habrá que retirar panel, actions,
  capacidad y tablas en su propio cambio.

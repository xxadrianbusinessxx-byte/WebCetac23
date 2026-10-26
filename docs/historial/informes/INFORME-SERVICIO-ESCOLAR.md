# INFORME — Rol Servicio Escolar y el portal en `/perfil`

**Fecha:** 2026-10-25 · **Base:** `7801875` · **Pedido por el usuario en chat**, con
tres decisiones suyas tomadas por pregunta directa (§6).

---

## 1. Qué se hizo

1. **Rol `servicio_escolar`** — el alumno que hace su servicio social en la
   institución. Cinco capacidades, todas de lectura, y dos pestañas: **Alumnos** (el
   padrón del ciclo) y **Descargas** (roster, etiquetas y situación médica en `.xlsx`).
2. **El portal pasó de `/oceano` a `/perfil`.**

| Archivo | Qué cambió |
|---|---|
| `lib/auth/types.ts` · `capacidades.ts` · `permisos.ts` | el rol, sus 2 capacidades nuevas y su matriz |
| `lib/escolar/catalogo/profesores.ts` | `rolDesdePermisos`: `Permisos` con «Servicio» |
| `lib/escolar/alumno/roster-ciclo.ts` · `-puro.ts` | **nuevos** — LA lectura del padrón y su agrupación |
| `lib/escolar/alumno/plantilla-roster.ts` | deja de leer por su cuenta: usa la lectura común |
| `lib/escolar/alumno/etiquetas-exportar.ts` · `-puro.ts` | **nuevos** — las dos hojas |
| `lib/navegacion/contenido-servicio-escolar.ts` | **nuevo** — sus dos huecos |
| `lib/navegacion/mapa-navegacion.ts` | sus dos pestañas |
| `app/actions/roster.ts` | 2 actions nuevas; la descarga del roster cambia de guardia |
| `app/components/servicio-escolar-panel.tsx` | **nuevo** — sus dos pantallas |
| `app/components/oceano/shell-oceano.tsx` · `nav-superior-oceano.tsx` | montaje y rótulo |
| `app/perfil/page.tsx` | **ahora es el portal** (antes redirigía) |
| `app/oceano/page.tsx` | ahora redirige a `/perfil` |
| `app/actions/login.ts` + 5 rutas retiradas | apuntan a `/perfil` |
| `scripts/test-servicio-escolar.mjs` | **nueva** suite (31 checks) |
| `scripts/test-permisos.mjs` · `test-rediseno-oceano.mjs` | columna SE y el rol nuevo |
| `docs/sistema/MATRIZ-PERMISOS.md` | §3 y §4 con la columna **SE** |

## 2. Quién lo ejecutó y qué pudo / no pudo hacer

**Un solo agente: Claude.** No intervino Cline. Toca `lib/auth/` —el reparto no lo
delega sin revisión— y además el usuario lo pidió en la misma sesión.

| Pudo | No pudo / no hizo |
|---|---|
| Preguntar antes de construir: las tres decisiones de §6 son del usuario, no mías | Probar con sesión real: la cuenta no existe todavía (pendiente `cuenta-servicio-escolar`) |
| Reutilizar la lectura del padrón en vez de escribir una segunda | Renombrar `app/components/oceano/` ni los tokens `--oc-*`: el cambio era la URL |
| Dejar CI, `test-orden`, `verificar-docs` y `verificar-estado-actual` en verde | — |

## 3. Cómo se ejecutó y se midió

**La reutilización que pidió el encargo.** `plantilla-roster.ts` (del cambio anterior)
ya leía el padrón con su grado, grupo y carrera. La pantalla del rol nuevo necesita
exactamente eso. En vez de una segunda consulta, se extrajo la lectura a
`roster-ciclo.ts` y ahora **los dos consumidores leen por ahí**: si mañana cambia qué
cuenta como inscrito, cambia en un sitio. Dos consultas al mismo padrón acaban diciendo
cosas distintas del mismo ciclo (R6).

**La regla que no era obvia.** «Ver los alumnos por grado, grupo y carrera» esconde que
**el grupo no identifica solo**: «3RO A» existe en MECATRÓNICA (57 alumnos) y en RH
(30), y «5TO A» en las dos (41 y 25). La clave de agrupación son los tres campos
juntos, y por eso vive en un módulo puro con su suite, no dentro de una consulta.

**Las dos hojas, y por qué son dos.** `ETIQUETAS PERSONALES` mezcla contacto (correo,
celular, edad) con situación médica (tipo de sangre, alergias, salud mental…). Se
separaron para poder pedir la primera sin arrastrar la segunda. Las dos recorren el
**padrón**, no la tabla: quien no tenga ficha sale igual, con sus celdas vacías — ver
quién falta es justo para lo que sirve el rol. Las seis columnas `EMPTY1..EMPTY6` de la
tabla no salen en ninguna hoja.

**Una guardia que cambió.** `actionDescargarPlantillaRoster` exigía
`alumno.cargar_roster`, que **escribe**. Bajar el padrón es lectura, así que ahora exige
`alumno.ver_roster`. El técnico tiene las dos, así que para él no cambia nada; la suite
lo fija con dos checks.

**Verificación:** `npx tsc --noEmit` limpio · `npm run lint` 0 errores · `npm run test:ci`
en verde · `test-servicio-escolar` 31/31 · `test-permisos` **865** pasadas, 0 fallidas
(eran 764: la columna SE de §4 ahora se verifica en las 85 filas) · `test-rediseno-oceano`
533/533 · `test-plantilla-roster` 29/29 tras el refactor · `test-orden` sin mover ningún
trinquete.

## 4. Qué normas respetó (CONTRATO §2)

| Norma | Cómo |
|---|---|
| R6 — no duplicar fuentes | La lectura del padrón es una, y la comparten plantilla y pantalla |
| R8 — no borrar de paso | `/oceano` queda como redirección; `app/components/oceano/` no se renombra |
| Autorización | 2 capacidades nuevas, de lectura. §4 gana la columna SE y la suite la verifica fila por fila |
| Capas | Decisión en `-puro`, I/O en `lib/`, `exigir()` + delegación en la action |
| Documentación | `MATRIZ-PERMISOS` §3 y §4, `ESTADO-ACTUAL`, `pendientes.json`, `scripts/README.md` y `RUMBO` |
| Verificación | `test:ci` verde; `gen:matriz` y `gen-rumbo` al día |

No aplican: esquema y SQL (no hay tabla ni columna nueva; la cuenta es una fila de
`PROFESORES` que crea una persona).

## 5. ¿Sigue la filosofía y la arquitectura?

| Principio | Veredicto |
|---|---|
| Una fuente única por concepto | **Sí**, y mejoró: el padrón dejó de leerse en dos sitios |
| No hay segundo camino de autenticación | **Sí.** Una fila de `PROFESORES`, como el técnico y Administración |
| La UI no decide el acceso | **Sí.** El mapa dibuja dos pestañas; las capacidades son de lectura, así que aunque la pantalla ofreciera un guardar, no hay action que lo acepte |
| Medir antes de modificar | **Sí.** La carrera entra en la clave del grupo porque la base mostró grupos homónimos |

## 6. Desviaciones y decisiones propias

Tres decisiones las tomó el usuario, preguntadas antes de escribir código:

- **El segundo apartado es «Descargas»** (de entre tres opciones): un apartado por
  TAREA, no por tipo de dato.
- **La ficha médica va completa**, no recortada. Lo planteé porque es información médica
  de menores en manos de otro alumno; la decisión es suya y queda escrita aquí.
- **Alcance: todo el plantel**, no un grupo asignado (que habría pedido una tabla nueva).

Decisiones mías:

- **`alumno.ver_roster` separada de `alumno.cargar_roster`** (§3).
- **El rol no tiene `alumno.ver_expediente`**: abriría el expediente completo de
  cualquiera —boleta, asistencia, comentarios— y el encargo pedía padrón y archivos.
- **Sin Mensajes**: es una cuenta temporal de servicio social, no personal con buzón.
- **`/oceano` se queda como redirección** y `app/components/oceano/` **no** se renombró:
  el encargo era la URL, y arrastrar el nombre por todo el árbol era un diff enorme sin
  nada a cambio.
- **Se arregló un `6` escrito a mano** en `test-permisos` (`portada.ver` la tienen «los 6
  roles»): ahora se compara contra `ROLES_PORTAL.length`, para que el próximo rol no lo
  rompa.

## 7. Lo no verificado / pendiente

- **La cuenta no existe**: hace falta una fila en `PROFESORES` con `Permisos` que
  contenga «Servicio» → pendiente `cuenta-servicio-escolar`. Hasta entonces nadie ha
  entrado con el rol.
- **Las tres descargas no se han ejecutado con sesión real.** La forma de las hojas está
  cubierta por suite; que PostgREST devuelva las columnas con espacios
  (`"TIPO DE SANGRE"`) solo se comprobó por tipos, no contra la base.
- **El circuito login → portal no se ha recorrido con sesión.** Lo que SÍ se comprobó en
  navegador, sobre una build nueva: las seis rutas retiradas y `/oceano` responden 200 en
  `/perfil`, y la portada pública sigue en pie.
- **Aviso de herramienta, no del cambio:** `npm run test:ci` terminó en verde con un
  `.next` de ocho horas antes, porque el servidor de vista previa lo tenía tomado
  (Windows). Hubo que parar el servidor y correr `npm run build` para que el portal
  nuevo existiera. Si alguien prueba en local con un servidor levantado, puede estar
  mirando una build vieja.
- **La cuenta es temporal**: cuando termine el servicio social hay que desactivarla, y
  hoy eso no lo recuerda nada automáticamente.

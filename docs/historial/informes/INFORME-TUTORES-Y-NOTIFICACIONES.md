# INFORME — Roster de tutores y Notificaciones de Administración escolar

**Fecha:** 2026-10-25 · **Base:** `fda7a88` · **Pedido por el usuario en chat** (sin
prompt archivado: encargo directo de dos funciones y la revisión de un SQL).

---

## 1. Qué se hizo

Tres cosas:

1. **Revisar el SQL que la persona ya había ejecutado** (`crear-rls-cerrar-anon.sql`).
2. **Personas › Tutores (técnico)**: tres modos nuevos — *Editar*, *Quitar tutor* y
   *Borrar roster* — que cierran la simetría con el roster de alumnos.
3. **Notificaciones de Administración escolar**: qué alumnos del ciclo no tienen la
   información primordial para tramitarlos (CURP, nombre completo, número de control).

| Archivo | Qué cambió |
|---|---|
| `lib/auth/capacidades.ts` · `permisos.ts` | 3 capacidades nuevas, solo para el técnico |
| `lib/escolar/tutores/tutores-borrado-puro.ts` | **nuevo** — validar datos de tutor, avisos de quitar, confirmación del vaciado |
| `lib/escolar/tutores/tutores-borrado.ts` | **nuevo** — previsualizar/quitar, editar, previsualizar/vaciar |
| `lib/escolar/tutores/tutores.ts` | re-exporta la pieza nueva |
| `lib/escolar/alumno/datos-incompletos-puro.ts` | **nuevo** — qué le falta a un alumno |
| `lib/escolar/alumno/datos-incompletos.ts` | **nuevo** — lectura del roster activo |
| `app/actions/tutores.ts` | 6 actions nuevas, cada una con su `exigir()` |
| `app/actions/administracion.ts` | 1 action nueva (solo lectura) |
| `app/components/tutores-roster-panel.tsx` | **nuevo** — los tres modos del técnico |
| `app/components/datos-incompletos-panel.tsx` | **nuevo** — el aviso y su lista |
| `lib/navegacion/mapa-navegacion.ts` | 3 modos en Tutores + pestaña Notificaciones |
| `lib/navegacion/contenido-administracion.ts` | el hueco nuevo y su pieza |
| `app/components/oceano/contenido-{tecnico,administracion}-oceano.tsx` | montaje |
| `scripts/test-tutores-borrado.mjs` · `test-datos-incompletos.mjs` | **nuevas** suites (33 y 22 checks) |
| `scripts/diag-tutores.mjs` | **nuevo** diagnóstico `LEE` |
| `docs/sistema/pendientes.json` | cierra `rls-tablas-publicas`; abre 3 |

## 2. Quién lo ejecutó y qué pudo / no pudo hacer

**Un solo agente: Claude.** No intervino Cline. No es una excepción al reparto: lo
decidió el criterio del propio repo —`node scripts/diag-peso-cambio.mjs` sobre las ocho
rutas dio **4/14, umbral 4 → Claude**, porque toca `lib/auth/` y eso «no se deshace con
un revert».

| Pudo | No pudo / no hizo |
|---|---|
| Medir el estado real antes de diseñar (ver §3) | Probar los tres modos con una sesión real de técnico: queda como pendiente |
| Verificar el SQL por los cuatro caminos de su `verificar` | Probar «Borrar roster» de verdad: desactivaría 460 cuentas en producción |
| Dejar CI, `test-orden` y `verificar-docs` en verde | — |

## 3. Cómo se ejecutó y se midió (antes → después)

**La medición cambió el diseño dos veces**, y es lo más importante de este informe.

**(a) Los tutores están vacíos.** De 460 cuentas activas: **460 sin teléfono, 460 sin
correo, 460 sin CURP y 458 sin nombre**. Son las que creó «Generar automáticos»: sirven
para entrar, no para localizar a nadie. Por eso *Editar* —que el encargo pedía casi de
pasada— es la pieza que más vale de las tres, y por eso busca **por alumno** y no por
tutor: nadie puede buscar por un nombre que no existe.

**(b) A los alumnos solo les falta un dato, y les falta a casi todos.** Sobre el roster
ACTIVO del ciclo operativo —357 alumnos, que es el alcance del aviso—: **0 sin nombre,
0 con CURP mal formada, 356 sin número de control**. (Sobre `ALUMNOS` entero, que
incluye a quien ya no cursa: 472 y 471.) El encargo pedía avisar «a qué alumnos les hace
falta CURP, nombre completo y número de control»; hecho literalmente, el aviso habría
sido la misma frase repetida 356 veces. Se construyó como **resumen arriba y lista
filtrable debajo**. Las comprobaciones de CURP y nombre quedan igualmente: hoy no
disparan, y son la red para el alta manual de mañana.

Estado del roster de tutores (`node scripts/diag-tutores.mjs`, 2026-10-25):

| | |
|---|---|
| Cuentas | 463 (460 activas, 3 desactivadas) |
| Vínculos activos | 458, cubriendo 458 alumnos |
| Cuentas activas sin ningún alumno | 3 |
| Alumnos sin tutor | 14 de 472 |

**Verificación:** `npx tsc --noEmit` limpio · `npm run test:ci` **en verde (exit 0)** ·
`node scripts/test-orden.mjs` con las 20 reglas en verde (ningún trinquete subió:
C11 sigue en 21/21 porque los paneles nuevos declaran **clases como constantes**, no
componentes) · `node scripts/verificar-docs.mjs` sano · las dos suites nuevas, 33/33 y
22/22.

**El SQL revisado** (`crear-rls-cerrar-anon.sql`, aplicado por la persona):

| Camino de verificación | Esperado | Medido |
|---|---|---|
| Consulta final del `.sql` | 0 · 0 · 0 · 1 | **0 · 0 · 0 · 1** sobre 432 tablas |
| `node scripts/diag-rls-anon.mjs` | anon ve 0 | **0 en las 21 tablas**; service_role sigue viendo 472 alumnos, 463 tutores, 4 642 asistencias |
| `get_advisors security` | sin `rls_disabled_in_public` | **0 apariciones** |
| `node scripts/fase11-perfil.mjs --sujetos=3 --runs=3` | la app sigue leyendo | **todos los pasos ok** |

Quedan tres avisos, los tres esperados: `rls_enabled_no_policy` (INFO — es el diseño) y
dos WARN anteriores al cambio (`function_search_path_mutable`, `extension_in_public`).

## 4. Qué normas respetó (CONTRATO §2)

| Norma | Cómo |
|---|---|
| Alcance | Lo pedido y nada más. Lo único añadido —`diag-tutores.mjs`— existe porque dos pendientes nuevos necesitaban un `verificar` real |
| R6 — no duplicar fuentes | Corregir CURP/nombre/número de control sigue donde ya estaba; Notificaciones solo **avisa**, no escribe |
| R8 — no borrar legacy de paso | «Borrar» es siempre `activo = false`; no se retiró ningún camino existente |
| Capas | Decisión en `-puro`, I/O en `lib/`, `exigir()` + delegación en la action, montaje en la UI. C8 y C3 en verde |
| Autorización | 3 capacidades nuevas, **solo técnico**. Notificaciones se apoya en `alumno.ver_expediente`, que ese rol ya tenía: no se inventó una capacidad para leer lo que ya puede abrir |
| Verificación | `test:ci` verde; medición antes y después con el mismo script |
| Documentación | `pendientes.json`, `scripts/README.md` y `ESTADO-ACTUAL.md` en el mismo cambio |
| Scripts peligrosos | Ninguno de `_peligrosos/` ni `_archivo/` se ejecutó |

No aplican: esquema y SQL (no hay tabla ni columna nueva), `gen:matriz` (sí hay actions
nuevas — **se corrió**).

## 5. ¿Sigue la filosofía y la arquitectura?

| Principio | Veredicto |
|---|---|
| Una fuente única por concepto | **Sí.** El aviso de datos incompletos lee; la corrección vive donde ya vivía |
| Medir antes de modificar | **Sí**, y dos decisiones de diseño salieron de la medición, no del encargo |
| Reversibilidad | **Sí.** Ninguna de las tres operaciones borra una fila |
| La decisión probable sin BD, aparte | **Sí.** 55 checks nuevos sin tocar la red |
| La UI no decide el acceso | **Sí.** El mapa dibuja; `exigir()` autoriza |

## 6. Desviaciones y decisiones propias

- **«Borrar» es desactivar, nunca `DELETE`.** El encargo decía «borrar»; con 460 cuentas
  en producción y sin staging, un borrado real no se deshace. Mismo criterio que la baja
  de alumno.
- **Vaciar el roster pide escribir «BORRAR 460»**, cifra tomada de la previsualización.
  Si cambió entre mirar y confirmar, el servidor la rechaza: la confirmación vale para la
  foto que se vio, no para cualquiera.
- **Las tres capacidades son solo del técnico.** El encargo decía «al perfil técnico»;
  Administración escolar conserva consultar y crear tutores.
- **Notificaciones es pestaña propia, no un apartado del expediente.** Ahí ya existe
  «Notificaciones», pero es del alumno elegido; esta mira el roster entero.
- **Panel aparte** (`tutores-roster-panel.tsx`): `tutores-panel.tsx` ya tiene 712 líneas y
  hace el trabajo contrario (poblar el roster).
- **Se añadió `diag-tutores.mjs`**, que el encargo no pedía: sin él, dos pendientes nuevos
  no tenían forma de verificarse.

## 7. Lo no verificado / pendiente

- **Nadie ha ejecutado los tres modos con una sesión real de técnico** → pendiente
  `probar-roster-tutores-con-sesion`. «Borrar roster» **no conviene probarlo en
  producción**.
- **Notificaciones no se ha visto con sesión de Administración escolar**; sí se verificó
  que la lectura compila, pasa CI y que las cifras que pintará son las medidas aquí.
- **`next build`** no se ejecutó aparte: va dentro de `npm run test:ci`, que está en verde.
- **Los dos pendientes de datos** (356 del ciclo sin número de control, 460 tutores sin contacto)
  son trabajo de persona: hace falta la fuente, no código.

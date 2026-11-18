# INFORME — El «Comentario personal» del alumno pasa a ser editable

**Fecha:** 2026-11-17 · **Agente:** Claude (diagnóstico + implementación + revisión)
**Petición:** «Haz un cambio en los comentarios personales de los alumnos, cambia su
edición permitida para directivos, administración y tutor vinculado al alumno en caso
de haber.»

---

## 1. Qué se hizo

El «Comentario personal» del expediente (`ETIQUETAS PERSONALES."COMENTARIO PERSONAL"`)
**se pintaba como un `textarea readOnly` para todo el mundo**, incluidos directivo,
administración y tutor. Existía ya una Server Action para guardarlo
(`actionGuardarComentarioPersonal`) pero **ningún componente la llamaba**: era un
camino muerto. El cambio lo abre, y solo para quien se pidió.

Quién escribe ahora: **directivo**, **administración escolar** y el **tutor VINCULADO**
al alumno. Nadie más. El alumno sigue leyéndolo; el maestro conserva su propio canal,
el tablón firmado (`alumno.comentar`), que es otra cosa y no se tocó.

Archivos:

| Archivo | Qué cambió |
|---|---|
| `lib/escolar/alumno/comentario-personal-puro.ts` | **NUEVO.** La regla («quién escribe») y la validación del texto. Puro: sin I/O. Define también `ModoAccesoAlumno`. |
| `lib/auth/capacidades.ts` | **NUEVA** capacidad `alumno.editar_comentario_personal`. |
| `lib/auth/permisos.ts` | La capacidad se concede a `directivo`, `administracion` y `tutor`. A nadie más. |
| `lib/escolar/alumno/acceso-alumno.ts` | `AccesoAlumno.modo` ahora **importa** la unión `ModoAccesoAlumno` en vez de repetirla. |
| `app/actions/escolar.ts` | `actionGuardarComentarioPersonal` exige la capacidad nueva, aplica la regla pura y guarda sobre `res.curp` (la CURP resuelta, no la que llegó por parámetro). |
| `app/components/oceano/comentario-personal-alumno.tsx` | **NUEVO.** El bloque: lectura para todos, borrador con Guardar/Cancelar para quien puede. |
| `app/components/oceano/contenido-alumno-oceano.tsx` | Monta el componente en lugar del `textarea readOnly`; nuevo prop `puedeEditarComentarioPersonal`. |
| `app/perfil/page.tsx` | Resuelve el flag en el SERVIDOR: capacidad **y** modo de acceso. |
| `scripts/test-comentario-personal.mjs` | **NUEVA** suite (14 checks). |
| `scripts/test-permisos.mjs` | +8 aserciones de la capacidad nueva. |
| `scripts/README.md`, `ESTADO-ACTUAL.md`, `docs/sistema/pendientes.json` | Fila de la suite, estado al día (67 suites), pendiente de prueba con sesión. |

## 2. Quién lo ejecutó y qué pudo / no pudo hacer

Lo implementó Claude en el repo, sin delegar: el cambio toca `lib/auth/` (capacidad y
matriz), que según `AGENTS.md` **no se delega sin revisión**.

**No pudo** probarlo con una sesión real. Firmar una cookie de sesión contra el
servidor local exige leer `AULANUBE_SESSION_SECRET` de `.env.local`, y el clasificador
de permisos lo bloqueó. **No se buscó una vía alterna**: bloquear eso es correcto. Queda
como pendiente `probar-comentario-personal-con-sesion`.

Tampoco se tocó la base: ninguna fila de `ETIQUETAS PERSONALES` se leyó ni se escribió
en esta tarea. Una consulta de solo lectura para obtener una CURP de ejemplo también
quedó bloqueada; no hacía falta insistir.

## 3. Cómo se ejecutó y se midió

Antes de tocar nada se midió **dónde vive hoy la decisión**, que es lo que decidió el
diseño:

- `actionGuardarComentarioPersonal` exigía `alumno.editar_datos_personales` y luego
  `acceso.puedeEditarDatosPersonales`.
- Ese flag es `true` para **directivo, administración y tutor vinculado** — exactamente
  el conjunto pedido. Reutilizarlo tal cual habría sido una línea de trabajo.
- **Pero la capacidad la tiene también el TÉCNICO** (`permisos.ts`), y hoy el técnico
  queda fuera solo porque `resolverAccesoAlumno` **no tiene rama para su rol**: cae en
  «Rol sin acceso a perfiles de alumnos». Es decir, está fuera **por omisión, no por
  regla**. El día que alguien le abra alcance para el padrón —cosa razonable— heredaría
  en silencio la escritura de la nota del expediente.

De ahí la decisión: **capacidad propia + regla propia**, no reutilizar el flag.

Verificación (todo verde, sin base de datos):

```
npx tsc --noEmit                          → sin errores
npm run lint                              → 0 errores (2 warnings preexistentes: roster.ts, gen-panel.mjs)
npm run test:suites                       → 67/67 suites en verde
node scripts/test-comentario-personal.mjs → OK 14/14
node scripts/test-permisos.mjs            → 878 pasadas, 0 fallidas
node scripts/test-orden.mjs               → 20/20 reglas
npm run verificar:estado                  → al día (150 líneas, límite ~150)
npm run verificar:docs                    → sano
npm run build                             → compila; /perfil sigue dinámica
```

Y una comprobación de que lo nuevo **llegó al build** y no solo al código fuente: el
texto «Vacío: al guardar se borra la nota» aparece en dos chunks de cliente
(`.next/static/chunks/`) y en el chunk de SSR. El servidor local sirve `/login`
correctamente tras el build.

## 4. Qué normas respetó (CONTRATO §2)

- **La lógica en `lib/`, la action valida y delega.** La decisión está en un módulo
  puro; la action resuelve sesión y alcance y llama.
- **Capacidad ≠ alcance** (`GLOSARIO.md`). La capacidad dice QUÉ (`exigir`); el alcance
  dice SOBRE QUIÉN (`resolverAccesoAlumno` + la regla pura). Las dos puertas, en ese
  orden, también en la página que pinta el botón.
- **La UI no pregunta por el rol.** El flag llega resuelto del servidor. Un botón
  visible no es uno que la action vaya a rechazar por permiso.
- **Lista cerrada de capacidades**: la nueva entra en `CAPACIDADES`, así que una action
  que exija algo inventado no compila.
- **R6 (no duplicar)**: `AccesoAlumno.modo` dejó de repetir la unión de modos; la
  importa. No hay dos listas que puedan desincronizarse.
- **C9/C10/C11/C13**: `escolar.ts` queda en 991 líneas (bajo el techo de 1000); la suite
  nueva tiene fila en `scripts/README.md`; el componente es de nombre único (no mueve el
  trinquete de 21); los imports de `lib/` llevan extensión `.ts` explícita.
- **Sin SQL y sin migración de datos** (CONTRATO §1.3): el campo ya existía.

## 5. ¿Sigue la filosofía y la arquitectura?

Sí, y en un punto la mejora. La petición se podía cumplir en una línea reutilizando
`puedeEditarDatosPersonales`, porque **hoy** los dos conjuntos coinciden. Lo que no
coincide es la *intención*: una es «quien mantiene la ficha», la otra es «quien escribe
la nota». Que hoy den el mismo resultado es una coincidencia, y una coincidencia no es
una regla. Separarlas cuesta un archivo puro de 79 líneas y, a cambio, el técnico queda
fuera **por regla escrita y probada**, no por un hueco en un `switch`.

El resto es el patrón que ya usa el repo: módulo puro para la decisión, suite que lo
prueba sin red, flag resuelto en el servidor, componente que solo presenta.

## 6. Desviaciones y decisiones propias

1. **Capacidad nueva en vez de reutilizar la existente.** Razonada arriba. Es la
   desviación de fondo respecto a la lectura literal de la petición («cambia su edición
   permitida»), que se podía haber hecho sin tocar `lib/auth/`.
2. **El texto VACÍO es válido**: guardar vacío **borra** la nota. Un campo que se puede
   escribir y no se puede limpiar obliga a inventar un «.» para vaciarlo. Está dicho en
   la UI («Vacío: al guardar se borra la nota») y probado en la suite.
3. **El texto se recorta y el límite se mide sobre lo ya recortado**, para que unos
   espacios al final no agoten los 200 caracteres. Antes la action medía el texto crudo.
4. **Se guarda sobre `res.curp`**, la CURP que devolvió el resolutor, no la del
   parámetro. Antes se usaba el parámetro: con un tutor la diferencia es nula porque el
   vínculo ya se comprobó, pero escribir con la CURP normalizada por el servidor es lo
   correcto y es lo que hacen las demás actions.
5. **`AccesoAlumno.modo` ahora importa su tipo.** Es un cambio que la petición no pedía;
   se hizo porque la alternativa era mantener la misma unión escrita dos veces.
6. **Se corrigieron dos cifras de `ESTADO-ACTUAL.md` §5** que el borrado del 2026-11-16
   había dejado falsas (`asistencia_alumnos` 3 863 y `clases_impartidas` 81 → **0 y 0**).
   No es de esta tarea, pero el documento declara que se actualiza en el mismo cambio que
   lo vuelve falso y estaba sin hacer.

## 7. Lo no verificado / pendiente

- **Sesión real** (pendiente `probar-comentario-personal-con-sesion`): directivo y
  administración escribiendo desde `Alumnos / Tutores › Información personal`; un tutor
  vinculado sobre su alumno; un tutor **no** vinculado recibiendo «No tienes relación
  con ese alumno»; el alumno viendo el bloque **sin** botón; y vaciar + guardar para
  comprobar que borra.
- **El alcance del tutor no se probó contra la base.** La regla pura cubre
  `modo: "tutor"`, y el vínculo real (`tutor_alumnos`) lo comprueba
  `resolverAccesoAlumno`, que ya estaba en pie y no se tocó.
- **Nada de esto está desplegado**: el cambio queda en local, sin commit ni push.

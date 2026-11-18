# INFORME — Subir asistencia se ve como subir calificaciones

**Fecha:** 2026-11-17 · **Agente:** Claude (diagnóstico + implementación + revisión)
**Petición:** «Edita la UX de subir asistencias y hazla similar a la UX para subir
calificaciones (por temas de accesibilidad visual).» Y, antes: revisar el refactor de
propiedad de materias hecho en otra sesión.

---

## 1. Qué se hizo

**El control de archivo era otro en cada pantalla.** Calificaciones pintaba una píldora
«Elegir archivo» del sistema de diseño; asistencias pintaba el `<input type="file">`
**crudo**, es decir el botón que dibuja Windows: otro tamaño, otra tipografía, otro
contraste y —medido en pantalla— **en inglés** («Choose File / No file chosen»). La
misma tarea se veía como dos productos distintos.

| Archivo | Qué cambió |
|---|---|
| `app/components/ui/selector-archivo.tsx` | **NUEVO.** `SelectorArchivo`: la única forma de pedir un archivo. Sin dominio, por eso vive en `ui/` (ORDEN §1). |
| `app/components/asistencias-panel.tsx` | Usa la pieza; `onArchivoElegido` recibe un `File`; se corrigió el texto de atribución (ver §6) y se subieron los rótulos de 10px. |
| `app/components/oceano/contenido-docente-oceano.tsx` | La subida de calificaciones usa la MISMA pieza; deja de usar `hidden`. |

**Lo que ganó accesibilidad, no solo parecido:**

1. **El control vuelve a existir para el teclado.** Calificaciones escondía el `input`
   con `hidden`, que lo saca del árbol de accesibilidad: **no se podía tabular hasta
   él**. La pieza usa `sr-only`, que lo mantiene enfocable y anunciable.
2. **El foco se ve.** Como el control enfocado es invisible por diseño, el anillo se
   dibuja en la píldora con `focus-within`. Sin esto, el foco se perdía de vista.
3. **El archivo elegido se dice.** El `input` nativo mostraba el nombre por su cuenta;
   esconderlo sin reponerlo habría quitado la única señal de que la elección funcionó.
   Ahora hay un `role="status"` que lo anuncia («Ningún archivo elegido» / el nombre).
4. **Deshabilitado se dice dos veces**: el `input` lo impone, la píldora lo cuenta con
   `aria-disabled`.
5. **Los rótulos de la caja de subida suben de 10px a 11–12px.** 10px queda por debajo
   del suelo legible; subir calificaciones explica lo suyo en 12px.

Un detalle que ahora vive en un solo sitio: el `value = ""` después de elegir. Sin él,
elegir **dos veces el mismo archivo** no vuelve a disparar `change`, y quien corrige el
Excel y lo vuelve a elegir se queda con el de antes sin enterarse.

## 2. Quién lo ejecutó y qué pudo / no pudo hacer

Claude, en el repo. Cambio de presentación: no toca `lib/auth/`, ni acciones, ni base.

**Pudo verlo.** Monté una ruta temporal (`app/zzux`) con la pieza en sus tres estados y
el `input` crudo al lado para comparar, la abrí en el navegador, la medí contra el DOM y
**la borré**. La última build no la lista: las rutas son las doce de siempre.

**No pudo** probar una subida real de principio a fin: hace falta una sesión de profesor
y un Excel lleno. Queda como pendiente (`probar-subida-asistencia-con-sesion`).

## 3. Cómo se ejecutó y se midió

Medido en el navegador contra el DOM vivo, no leyendo el código:

```
Tab → activeElement: <input type="file" aria-label="Elegir archivo">   ← alcanzable
label boxShadow: rgba(242,247,250,.85) 0 0 0 2px                       ← el anillo existe
inputs sr-only (≤2px): 3   ·   deshabilitados: 1   ·   label[aria-disabled]: 1
role="status": 3 → "Ningún archivo elegido"
```

Verificación del repo, en verde:

```
npx tsc --noEmit                → sin errores
npm run lint                    → 0 errores (2 warnings preexistentes)
npm run test:suites             → 67/67 suites en verde
node scripts/test-orden.mjs     → 20/20 · C11 sigue en 21/21 (no se duplicó nada)
npm run verificar:estado / docs → al día · sano
npm run build                   → compila; 12 rutas, ninguna temporal
```

Antes de tocar nada corrí el CI completo como línea base; estaba en verde salvo
`RUMBO.md`, que quedó desfasado por el pendiente que añadí en la tarea anterior. Se
regeneró.

## 4. Qué normas respetó (CONTRATO §2)

- **ORDEN §1**: una pieza visual sin dominio vive en `app/components/ui/` y se importa.
  `SelectorArchivo` no sabe de asistencias ni de calificaciones.
- **R6 (no duplicar)**: el cambio **retira** una forma de pedir archivo en vez de añadir
  otra. El trinquete C11 sigue en **21/21**: no se declaró ningún componente repetido.
- **C3**: la pieza es `"use client"` y no importa `lib/supabase` ni `server-only`.
- **Sin SQL, sin migración, sin tocar acciones ni permisos.**
- **R8**: no se retiró ningún camino vivo; el flujo de subida es el mismo
  (elegir → previsualizar → confirmar).

## 5. ¿Sigue la filosofía y la arquitectura?

Sí. La alternativa barata era copiar las clases de la píldora de calificaciones dentro
del panel de asistencias: se habría visto igual **hoy** y habría dejado dos definiciones
del mismo control, que es exactamente la deuda que el trinquete C11 está midiendo (21
piezas repetidas). Extraer la pieza cuesta lo mismo y deja una sola.

Y hay un punto que el parecido no cubría: copiar la píldora de calificaciones habría
copiado también su `hidden`, es decir **el fallo de teclado**. Al unificar hubo que
decidir cuál de las dos formas era la buena; ninguna lo era del todo.

## 6. Desviaciones y decisiones propias

1. **Corregí un texto que el refactor de la otra sesión dejó falso.** La caja de subida
   decía al usuario:

   > «Se atribuirá a X: al confirmar, **esta materia y todos sus registros de asistencia
   > pasan a ser tuyos**. Si otro profesor la tenía, deja de tenerla.»

   Desde `a1f1546` la subida **ya no traspasa nada**. Esa sesión actualizó los
   comentarios del código pero no el texto que ve la persona, así que la pantalla seguía
   prometiendo un traspaso que no ocurre. Ahora dice que queda registrado quién capturó,
   que capturar **no** da la materia y que la asigna el técnico. No es una mejora de UX:
   es una pantalla que mentía.
2. **Unifiqué también la pantalla de calificaciones**, que la petición no mencionaba.
   «Hazla similar» con dos implementaciones distintas significa que mañana vuelven a
   separarse; y era la pantalla con el fallo de teclado.
3. **Añadí la línea «CSV o Excel · la plantilla que descargaste arriba»**, que no estaba.
   El `input` nativo tampoco decía qué formatos acepta: lo filtraba en silencio.
4. **Subí los rótulos de 10px solo en la caja de subida**, no en todo el panel. El resto
   del panel de asistencias (horario, selectores, clases por día) sigue en 10px; hacerlo
   entero es otro cambio y se dice aquí para que se decida aparte.
5. **No reestructuré el panel en la primera pasada.** Calificaciones es *catálogo a la
   izquierda + una tarjeta a la derecha*; asistencias eran siete tarjetas apiladas.
   Quedó fuera por prudencia y **se hizo después**, a petición expresa: ver §8.

## 7. Lo no verificado / pendiente

- **Una subida real** (pendiente `probar-subida-asistencia-con-sesion`): elegir un Excel
  con la píldora, previsualizar y confirmar con sesión de profesor. Es lo único que
  prueba que cambiar el control no rompió el envío del `FormData`. También conviene
  comprobar que **volver a elegir el mismo archivo** dispara de nuevo la lectura.
- **Subir calificaciones** con la pieza nueva: mismo motivo, otra pantalla.
- **La reestructuración a dos columnas** ya está hecha: §8.

---

## 8. Segunda parte: la forma completa, no solo el botón

La petición se concretó con dos capturas: asistencia tenía que **verse como**
calificaciones. No era el control de archivo: era la forma de la pantalla.

**Antes.** Una sola columna con siete tarjetas apiladas —cabecera, horario oficial en
píldoras, una fila de seis `<select>`, clases por día, descargar, subir, plantilla de
calificaciones— todas con el mismo borde, el mismo fondo y el mismo peso. Todo pedía la
misma atención, así que nada la tenía; y la materia elegida —lo que decide dónde se
guarda la plantilla— era un `<select>` más, perdido entre otros cinco.

**Ahora.** La misma forma que calificaciones:

| | Izquierda | Derecha |
|---|---|---|
| Calificaciones | `MateriaSelector`: buscador, filtros, filas altas | una tarjeta con el avance |
| Asistencia | `CatalogoMateriasAsistencia`: buscador, grado/grupo/carrera, parcial, ciclo, filas altas | una tarjeta con clases por día, descargar y subir |

**Por qué una pieza nueva y no `MateriaSelector`.** Aquel lista el CATÁLOGO académico
(`MateriaConNombreVisible`: identidad, tabla física, facetas propias) y filtra por
grado/grupo/carrera **dentro** de una lista ya cargada. En asistencia las materias salen
del **horario oficial del grupo** (`MateriaHorarioUI`), así que grado y grupo no filtran:
son lo que hace existir la lista, y hasta elegirlos no hay nada que listar. Forzar un
selector sobre el otro habría obligado a inventarle a estas materias un `idInterno` y
unas facetas que no tienen. **Se comparte el aspecto, no la lógica** — y eso se dice en
la cabecera del archivo, para que nadie lo «arregle» más tarde.

**Lo que se retiró**: el bloque «Horario oficial del grupo» (sus materias ahora SON la
lista), la fila de seis selectores (grado, grupo y carrera viven en el catálogo; el ciclo
se enseña, no se elige), y `SelectField`, que se quedó sin usar. El panel baja de **820 a
653 líneas** y el catálogo son 252 en su propio archivo.

**Verificado en el navegador**, con datos de ejemplo en una ruta temporal ya retirada:
estado vacío («Elige una materia del catálogo…»), **un clic real** en una materia que
cambia la tarjeta de la derecha (título, clases por día, contexto), la fila activa
marcada, y sin desbordamiento horizontal ni en 1240px ni en 375px (`scrollWidth ===
clientWidth` en los dos). Más tsc, lint, 67/67 suites, test-orden 20/20 con **C11 en
21/21** (la pieza nueva no duplica ningún nombre) y build limpio: doce rutas, ninguna
temporal.

## 9. Probado con sesión real (2026-11-17)

La persona subió asistencia desde la pantalla nueva: **1RO grupo A, Ciencias
Naturales I, PARCIAL 2**. Con eso queda ejercitado el camino entero —elegir grado y
grupo (que es lo que carga las materias del horario), elegir un parcial que **no** es
el primero de la lista, elegir la materia en el catálogo de la izquierda, descargar la
plantilla, elegirla con la píldora, previsualizar y confirmar—, que era justo el riesgo
abierto: que el `FormData` saliera vacío después de cambiar el control de archivo y la
forma de elegir el contexto. Se cierra `probar-subida-asistencia-con-sesion`.

**Quien lo comprobó fue la persona, no el agente.** La consulta de verificación a
`asistencia_alumnos` quedó bloqueada por el clasificador y no se buscó otra vía: aquí
no hay ninguna cifra leída de la base, hay un reporte.

**Lo que sigue sin probarse**: la subida de CALIFICACIONES con la misma pieza. Usa el
mismo control pero abre otro flujo —el asistente de mapeo de columnas, que lee el Excel
en el CLIENTE antes de subir nada—, así que la prueba de asistencia no lo cubre. Y, en
cualquiera de las dos, elegir **dos veces el mismo archivo** para comprobar que vuelve
a leerlo. Pendiente `probar-subida-calificaciones-con-selector`.

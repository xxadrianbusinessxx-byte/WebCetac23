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
5. **No reestructuré el panel.** Calificaciones es *catálogo a la izquierda + una tarjeta
   a la derecha*; asistencias son siete tarjetas apiladas. Parecerse del todo significa
   reescribir un componente de 800 líneas que funciona, y eso no se hace de pasada.

## 7. Lo no verificado / pendiente

- **Una subida real** (pendiente `probar-subida-asistencia-con-sesion`): elegir un Excel
  con la píldora, previsualizar y confirmar con sesión de profesor. Es lo único que
  prueba que cambiar el control no rompió el envío del `FormData`. También conviene
  comprobar que **volver a elegir el mismo archivo** dispara de nuevo la lectura.
- **Subir calificaciones** con la pieza nueva: mismo motivo, otra pantalla.
- **El resto del panel de asistencias** sigue con rótulos de 10px (punto 4 de §6).
- **La reestructuración a dos columnas** queda sin hacer, a propósito (punto 5 de §6).

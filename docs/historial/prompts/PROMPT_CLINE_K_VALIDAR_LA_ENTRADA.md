# PROMPT CLINE — K · `exigir()` dice quién puede; falta decir qué llega

## OBJETIVO — qué debe ser cierto al terminar

Toda Server Action que lea de un `FormData` valida su entrada contra un **esquema
declarado**, y una regla mecánica impide que la siguiente se escriba sin él.

**El hueco, dicho con precisión.** La autorización de este repo está bien
resuelta y se puede medir: **164 llamadas a `exigir()`, 25 de 26 actions, cero
que lean el rol directamente**. Pero `exigir()` responde *«este rol puede hacer
esto»*, no *«esto que ha llegado es lo que dice ser»*.

Hoy hay **34 `formData.get()` repartidos en 11 actions**, y cada una valida a su
manera o no valida. No es que no haya validación —`noticias.ts` comprueba que el
archivo sea un `File` no vacío y de tipo imagen, y está bien hecha—: es que es
**ad hoc, distinta en cada sitio y sin nada que la exija**. Es el mismo patrón
que tenían los permisos antes del PROMPT-2.

Y pesa más aquí que en otros repos: `ESTADO-ACTUAL.md` §4 dice que **las policies
de RLS son `USING (true)` y no autorizan nada**, así que no hay una segunda red
debajo. Un `formData.get("curp")` que llega con algo inesperado va directo a una
consulta.

## ANTES DE NADA — genera tu propio contexto

```bash
node scripts/gen-contexto.mjs --tarea=crear,permisos app/actions/ lib/
```

## MEDICIÓN INICIAL (pegada — no re-investigar)

`grep -rc "formData.get(" app/actions/*.ts`, el 2026-09-20:

```
escolar.ts             9        justificaciones.ts     5
carga-academica.ts     7        asistencias.ts         2
calificaciones.ts      2        etiquetas-dinamicas.ts 2
horario.ts             2        login.ts               2
documentos.ts          1        materias.ts            1
noticias.ts            1
                                          TOTAL       34
```

```
$ grep -c "zod\|valibot\|yup" package.json   →   0
```

**`login.ts` es el caso que ordena la prioridad:** dos `formData.get()` en la
puerta de entrada del portal, antes de que exista sesión y por tanto antes de que
`exigir()` pueda decir nada.

---

## SECUENCIA — tres partes, con parada entre cada una

### Parte 1 · Decidir con qué, y que la decisión esté escrita

Instala **`valibot`**, no `zod`. Las dos hacen el trabajo; valibot pesa ~2 KB
frente a ~13 KB y este repo tiene 8 dependencias de producción contadas. Si
encuentras una razón técnica para preferir zod, dila y decídelo tú — pero que la
razón esté en el informe, porque una dependencia nueva en este repo es una
decisión, no un detalle.

Crea `lib/validacion/` con:

- `esquemas-puro.ts` — los esquemas, **sin una línea de I/O**. Es un módulo
  `-puro` de los que exige C5, y por tanto **DEBE tener suite**
  (`scripts/test-validacion.mjs`).
- Un helper único para la frontera, del estilo `leerFormData(esquema, formData)`,
  que devuelva `{ ok: true, datos }` o `{ ok: false, error }` — **la misma forma
  que ya devuelven las actions**, para no inventar un tercer convenio de
  respuesta.

**No conviertas ninguna action todavía.**

**PARA AQUÍ.** Enseña el módulo, su suite y `node scripts/test-validacion.mjs`.

### Parte 2 · Las 11 actions, empezando por la puerta

Orden obligatorio, de más expuesto a menos: **`login.ts` primero**, luego
`escolar.ts` (9) y `carga-academica.ts` (7), luego el resto.

Por cada `formData.get()`:

1. Un campo del esquema con su tipo, su obligatoriedad y sus límites reales
   (longitud de una CURP, formato de una fecha, tamaño de un archivo).
2. `exigir()` sigue **primero**. El orden es: autorizar, luego validar, luego
   delegar. No lo inviertas: validar el payload de alguien que no tiene permiso
   es trabajo regalado y filtra información por los mensajes de error.
3. **Conserva la validación que ya existía**, no la sustituyas a ciegas. Donde el
   código de hoy sea más estricto que tu esquema, gana el de hoy — y eso se
   anota, porque significa que el esquema se quedó corto.

Cuidado con los mensajes: hoy devuelven texto en castellano pensado para el
usuario («Selecciona una imagen»). **No los degrades** a un volcado del validador.
El usuario no tiene que leer el nombre del campo que falló.

**PARA AQUÍ** al terminar `login.ts`, antes de seguir con las otras diez. Enseña
el diff completo de esa action.

### Parte 3 · La regla que lo sostiene

Sin esto, la Parte 2 se aplica a once actions y se olvida en la doce. En
`scripts/test-orden.mjs`, una regla **C12**:

> ninguna `app/actions/**` llama a `formData.get()` fuera de un esquema de
> `lib/validacion/`

La forma comprobable más simple: en un archivo que importe `lib/validacion`, los
`formData.get()` sueltos son 0. Usa `codigoDesnudo()`, que ya neutraliza
comentarios y cadenas.

Umbral: **0 si la Parte 2 llegó a las once**; si te quedaste a medias, el número
que haya, como trinquete con su deuda apuntando a este prompt. Lo que no vale es
declarar 0 sin haberlo alcanzado.

Y lo de siempre: fila en `docs/normativo/ORDEN.md`, contador de reglas al día en
`scripts/README.md`, y `npm run panel` para ver que `orden.C12` sale.

---

## REGLAS

- **`exigir()` no se toca.** 164 llamadas, 25 de 26 actions: eso funciona. Este
  prompt añade una capa al lado, no reemplaza ninguna.
- La lógica de validación va en el módulo puro. La action llama y delega — el
  punto 2 del CONTRATO, literal.
- Nada de cambiar el comportamiento observable: una entrada que hoy se acepta
  tiene que seguir aceptándose. Si tu esquema rechaza algo que hoy pasa, **para
  y dilo**: o el esquema está mal, o acabas de encontrar un agujero. Las dos
  cosas son informe, no un `catch` silencioso.
- Una sola dependencia nueva. Ni un plugin, ni un adaptador, ni un helper de
  formularios.

## LÍMITES — qué NO se toca

- `lib/auth/**` — nunca se delega sin revisión
- El esquema de la base: ninguna migración, ningún `.sql`
- `app/components/**`: la validación de cliente no entra aquí. Ocultar un botón
  no es autorización, y validar en el navegador no es validar (§7)
- `docs/historial/**`

## VALIDACIÓN

```bash
node scripts/test-validacion.mjs
node scripts/test-orden.mjs
node scripts/test-orden.mjs --detalle
npm run test:permisos
npm run test:ci
npx tsc --noEmit
npm run lint
npm run build
```

`npm run test:permisos` va en la lista a propósito: si la auditoría de permisos
se mueve al tocar las actions, es que has cambiado algo que no tocaba.

## INFORME FINAL

`docs/historial/informes/INFORME-PROMPT-K-VALIDAR-LA-ENTRADA.md`:

### La dependencia
Cuál, cuánto pesa, y por qué esa.

### Los 34 campos
Tabla: action · campo · tipo · reglas. Es el primer inventario de la superficie
de entrada del portal, y vale por sí solo aunque el resto se quede a medias.

### Lo que ya era más estricto que el esquema
Dónde el código de hoy validaba mejor, y qué se conservó.

### Lo que cambió de comportamiento
Idealmente vacío. Si no lo está, cada caso con su justificación.

### Validación
Los ocho comandos y el número final de C12.

---

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
5. Validar: npx tsc --noEmit + la suite pura del módulo + next build.
6. Volver a correr el diagnóstico del paso 1 y mostrar antes/después.
7. Entregar: qué archivos tocaste, por qué, y qué NO tocaste pudiendo hacerlo.
```

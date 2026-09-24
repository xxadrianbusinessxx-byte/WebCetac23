# INFORME — PROMPT K · La entrada validada: `exigir()` dice quién, el esquema dice qué

> Ejecutado el 2026-09-20 sobre `feature/uis-pendientes` (HEAD `c0705ff`), siguiendo
> `docs/historial/prompts/PROMPT_CLINE_K_VALIDAR_LA_ENTRADA.md`.
>
> **Las tres partes, enteras.** `valibot` instalado (única dependencia nueva),
> `lib/validacion/` con los esquemas y el helper, **las 11 actions convertidas** —las 34
> lecturas de `FormData`, cero sueltas—, la suite pura con **70 comprobaciones** y la regla
> **C12** como DURA en 0. 40/40 suites, `tsc` limpio, build limpio, CI en verde.
>
> Lo que **no** se tocó: ni una llamada a `exigir()` (siguen los mismos 25 de 26 archivos que lo
> usaban, y la auditoría de permisos da exactamente 573/0, como antes), ni el esquema de la base,
> ni `app/components/`.

---

## 1 · La dependencia

**`valibot@1.5.0`**, ~2 KB frente a los ~13 KB de `zod`. El prompt la eligió por peso y no
hubo razón técnica para preferir zod: este repo tiene 8 dependencias de producción y lo único
que se le pide al validador es *safe parse* de formularios planos. Zod habría traído un
`z.coerce` más cómodo, y con él la tentación de **convertir** la entrada en vez de rechazarla;
valibot obliga a escribir el chequeo. Se queda valibot.

Es `dependencies`, no `devDependencies`: lo importan las Server Actions en producción.

## 2 · `lib/validacion/` — dos módulos, y los dos puros

| Archivo | Qué es |
|---|---|
| `esquemas-puro.ts` | Los esquemas. **Solo importa `valibot`**: ni Supabase, ni `app/`, ni I/O. Es un `-puro` de los que exige C5 y **por eso Node lo carga directo**, sin compilarlo (la lección del PROMPT H). |
| `leer-form-data.ts` | El helper de frontera. Convierte el `FormData` en un objeto plano **sin interpretarlo** y valida. |

**El helper devuelve la MISMA forma que ya devolvían las actions** —`{ ok: true, datos }` /
`{ ok: false, error }`— y no un tercer convenio. En la action se lee así:

```ts
const entrada = leerFormData(esquemaArchivoMateria, formData);
if (!entrada.ok) return { ok: false, error: entrada.error };
// …y se delega
```

**Los mensajes son los de antes, palabra por palabra.** El `error` que sale es el texto
declarado en el esquema —«Selecciona un archivo válido.», «Solo se permiten imágenes.»,
«Indica CURP, fecha y motivo.»—, no un volcado del validador: el usuario nunca lee
`Invalid type: Expected File but received string` ni el nombre del campo.

### Dos cosas que se descubrieron construyéndolo

**1 · Validar el objeto entero BORRABA mensajes.** `v.safeParse(objeto, …)` responde a un campo
**ausente** con el mensaje del objeto (emite `invalid_key` y no llega a ejecutar el esquema del
campo). Y dos actions distinguen: `calificaciones.ts` dice «Faltan datos de sesión o materia.»
si falta la materia y «Selecciona un archivo válido.» si falta el archivo. Con el objeto
entero, **un POST sin archivo devolvía el mensaje de la materia** — comprobado con la suite—.
Por eso `leerFormData` valida **campo a campo, en el orden en que están declarados**: cada uno
falla con SU mensaje y el primero que falla es el que ve el usuario, que es exactamente el orden
en que las actions comprobaban a mano.

**2 · Sin mensaje en el `v.object`, un campo que falta se lee en inglés.** El mensaje del objeto
sigue declarado como respaldo, y la suite lo vigila: hay una comprobación de que **ningún
mensaje que salga del helper parece del validador** (`/Invalid|Expected|received/`).

---

## 3 · Los 34 campos: el inventario de la superficie de entrada

18 de los 34 eran **el mismo campo** (`archivo`), así que los esquemas cubren 13 nombres reales.

| Action | Campo | Tipo y reglas | Mensaje (el de siempre) |
|---|---|---|---|
| `login.ts` | `identificador` | texto obligatorio, recortado, ≤200 | «Indica identificador y clave.» |
| `login.ts` | `clave` | texto obligatorio, **sin recortar**, ≤200 | «Indica identificador y clave.» |
| `noticias.ts` | `archivo` | File no vacío + `image/*` | «Selecciona una imagen.» / «Solo se permiten imágenes.» |
| `materias.ts` | `archivo` | `instanceof File` **sin** comprobar tamaño (hoy era así) | «Selecciona un archivo.» |
| `documentos.ts` | `archivo` | File no vacío + ≤ `DOCUMENTO_MAX_BYTES` (20 MB) | «Selecciona un archivo válido.» / «El archivo supera el límite de 20MB.» |
| `asistencias.ts` ×2 | `archivo` | File no vacío | «Selecciona un archivo válido.» |
| `calificaciones.ts` | `materiaId` | texto obligatorio, ≤200 | «Faltan datos de sesión o materia.» |
| `calificaciones.ts` | `archivo` | File no vacío | «Selecciona un archivo válido.» |
| `escolar.ts` ×5 | `archivo` | File no vacío (materia, avance, registro, status, roster ×2) | «Selecciona un archivo válido.» |
| `escolar.ts` | `archivo` (foto) | File no vacío + `image/*` | «Selecciona una imagen.» / «Solo se permiten imágenes.» |
| `escolar.ts` ×2 | `mapeo` | texto **opcional** (su contenido lo sigue validando `mapeoRosterValido`) | «El mapeo de columnas enviado no es válido.» |
| `etiquetas-dinamicas.ts` ×2 | `archivo` | File no vacío | «Selecciona un archivo Excel válido.» |
| `horario.ts` ×2 | `archivo` | File no vacío | «Selecciona un archivo Excel válido.» |
| `justificaciones.ts` | `curp` | texto obligatorio, recortado y en MAYÚSCULAS | «Indica CURP, fecha y motivo.» |
| `justificaciones.ts` | `fecha` | texto obligatorio | ídem |
| `justificaciones.ts` | `motivo` | texto obligatorio ≤2000 (el límite real lo sigue diciendo la action, con su número) | ídem |
| `justificaciones.ts` | `materia_clave` | texto **opcional** (vacío = día completo) | ídem |
| `justificaciones.ts` | `archivo` | File no vacío + ≤ `JUSTIFICACION_MAX_BYTES` (5 MB) | «Adjunta un archivo (PDF, PNG o JPG) obligatorio.» / «El archivo supera el tamaño máximo (5 MB).» |
| `carga-academica.ts` ×2 | `archivo` | File no vacío | «Selecciona un archivo válido.» |
| `carga-academica.ts` ×2 | `mapeo` | texto opcional ≤20000 | «El mapeo de columnas enviado no es válido.» |
| `carga-academica.ts` ×2 | `periodoId` · `periodoNombre` | texto opcional | «Datos del periodo no válidos.» |
| `carga-academica.ts` ×2 | `grado` · `grupo` · `carrera` | texto opcional | «Datos del grupo no válidos.» |

**El orden es autorizar → validar → delegar, en las once.** Ninguna action valida antes de
`exigir()`: `leerFormData` va **después** del guardián de permiso en todas.

### Lo que ya era más estricto que el esquema, y se conservó

- **`documentos.ts` y `justificaciones.ts`** ya tenían tope de tamaño: el número **no se copió**
  al módulo puro, se **inyecta** (`esquemaSubirDocumento(DOCUMENTO_MAX_BYTES)`) para que siga
  habiendo una sola fuente de `20 MB` y de `5 MB`.
- **`materias.ts` solo comprobaba `instanceof File`**, sin tamaño. El esquema tiene una función
  para eso (`archivoPresente`) precisamente para **no** añadirle una regla que no tenía: un
  archivo vacío sigue pasando y falla más tarde, donde fallaba.
- **El `mapeo` de las cuatro rutas** sigue validándose con `mapeoRosterValido` en la capa de
  dominio. El esquema solo garantiza que lo que llega es texto: **replicar la regla habría
  creado la segunda fuente que R6 prohíbe**.
- **El límite del `motivo`** (`JUSTIFICACION_MOTIVO_MAX`) sigue en la action: su mensaje dice
  cuál es el número, y ese texto es mejor que uno genérico.
- **`clave` no se recorta.** El identificador sí (era `.trim()`), la clave no.

### Lo que cambió de comportamiento

Un solo caso, y es una cota de longitud: **un texto de más de 200 caracteres donde la action no
comprobaba longitud** (identificador, clave, `materiaId`, `grado`, `grupo`, `carrera`,
`periodoId`, `periodoNombre`) ahora se rechaza con el mensaje de su campo, donde antes llegaba a
la consulta. Ninguna entrada real se acerca a 200 caracteres en esos campos, y el prompt pedía
«límites reales»; aun así queda declarado aquí, que es donde el prompt manda declararlo. En
`mapeo` la cota es 20 000 y en `motivo` 2 000, por encima de cualquier valor real.

---

## 4 · La regla que lo sostiene (Parte 3): C12

Sin esto, la Parte 2 se aplica a once actions y se olvida en la duodécima.

> **C12** · ninguna action lee `formData` a mano: valida contra `lib/validacion/`
> **DURA, umbral 0** — las once ya pasan por su esquema.

En `scripts/test-orden.mjs`, con el formato de las otras once y sobre `codigoDesnudo()`, como
manda el prompt: la regla cuenta `formData.get(` / `getAll(` / `entries(` / `has(` / `keys(` /
`values(` en `app/actions/**`. Hoy **0**. Y es DURA y no trinquete porque el prompt lo dice:
«Umbral: 0 **si la Parte 2 llegó a las once**» — llegó. Declarar 0 sin haberlo alcanzado habría
sido lo único imperdonable.

Una nota de forma: la regla **no** se limita a los archivos que importan `lib/validacion/`, que
era la comprobación mínima que sugería el prompt. Se mide en todo `app/actions/**`, porque la
versión débil se esquiva sola: a una action nueva le basta con **no** importar el módulo para
pasar. La versión dura es la que hace falta para que la duodécima no se olvide.

- Fila en **`docs/normativo/ORDEN.md`** §2: la tabla «Quién puede importar a quién» gana la fila
  de `lib/validacion/` (solo `valibot`, es puro) y el bloque de PROMPT-K declara la norma
  —autorizar → validar → delegar— con C12 citada. Como en el PROMPT I, ORDEN es prosa normativa
  y no un inventario de reglas: el inventario es `test-orden --json`.
- **`scripts/README.md`**: fila de `test-validacion.mjs` en las suites puras y la de
  `test-orden.mjs` al día —«Doce reglas: diez **duras** y dos **trinquete**»—.
- **`ESTADO-ACTUAL.md`**: 39 → **40 suites**, y qué prueba `test-orden` incluye ya la entrada
  validada. Es el paso que ORDEN §6 dice que siempre se olvida.
- **`npm run panel`**: `orden.C12` sale en `.panel/estado.json` (umbral 0, actual 0, ok) sin
  tocar `gen-estado.mjs`.
- **`RUMBO.md`**: no hizo falta regenerarlo, y eso también es información: `gen-rumbo --check`
  pasó a la primera porque C12 nace en 0 y el bloque generado solo lista reglas que no están en 0.

---

## 5 · Validación

| Comando | Resultado |
|---|---|
| `node scripts/test-validacion.mjs` | **70 pasadas, 0 fallidas**, exit 0 |
| `node scripts/test-orden.mjs` | `Todo en orden: 12 reglas comprobadas` — **C12 en 0/0**, C11 en 21/21 |
| `node scripts/test-orden.mjs --detalle` | los 12 renglones, sin hallazgos en C12 |
| `npm run test:permisos` | exit 0 · `Resultado: 573 pasadas, 0 fallidas` **idéntico a antes** (el prompt lo pedía a propósito: si la auditoría se mueve, se tocó algo que no tocaba) |
| `npm run test:ci` | **exit 0** — 40/40 suites · invariantes «Al día» · rumbo «Al día» · ESTADO-ACTUAL al día · docs sanas |
| `npx tsc --noEmit` | 0 errores |
| `npm run lint` | 0 errores, 1 warning preexistente (`scripts/gen-panel.mjs:41`) |
| `npm run build` | exit 0, `✓ Compiled successfully in 4.9s` |

### Las dos suites de auditoría que se movieron, y por qué

`test-auditoria-ciclo-f2.mjs` y `test-auditoria-ciclo-f3.mjs` **fallaron al principio**, y es un
hallazgo que merece su párrafo: no prueban comportamiento, **leen el CÓDIGO FUENTE y le exigen
una forma**. Buscaban `/extraerContexto/` y `/formData\.get\("periodoId"\)/` dentro de
`carga-academica.ts`, y al mover la lectura al esquema dejaron de encontrar su patrón.

Se actualizaron **conservando el invariante** —la carga resuelve su contexto por `periodoNombre`,
y `periodoId` entra por el formulario— y con el motivo escrito al lado y su fecha. Lo importante:
esto demuestra que la red de seguridad del repo **también vigila las refactorizaciones**, no solo
los resultados. Ninguna de las dos aserciones se borró ni se aflojó.

---

## 6 · Qué se tocó y qué NO

**Tocado:** `lib/validacion/esquemas-puro.ts` y `lib/validacion/leer-form-data.ts` (nuevos);
`scripts/test-validacion.mjs` (nuevo, 40.ª suite); `scripts/test-orden.mjs` (regla C12);
las **11 actions** de `app/actions/`; las **2 auditorías de ciclo** (patrón, no invariante);
`docs/normativo/ORDEN.md`; `scripts/README.md`; `ESTADO-ACTUAL.md`; `package.json` +
`package-lock.json` (valibot). Y `scripts/verificar-docs.mjs` en el PROMPT I, no aquí.

**NO tocado, pudiendo haberlo hecho:**

- **`exigir()`**, ni una llamada: **25 de los 26 archivos** de `app/actions/` lo siguen usando
  igual que antes (el único que no, no lo usaba: `login.ts`, que es la puerta), y la auditoría de
  permisos da **573/0**, el mismo número. La capa nueva va **al lado**, no en lugar de.
- **`lib/auth/**`**: no se delega sin revisión.
- **`app/components/**`**: la validación de cliente no entra aquí. Ocultar un botón no es
  autorización, y validar en el navegador no es validar (§7).
- **El esquema de la base**: ningún `.sql`, ninguna migración.
- **`mapeoRosterValido`** y el resto de las reglas de dominio: siguen donde estaban. El esquema
  no las reemplaza, solo garantiza que lo que llega es del tipo que dicen.
- **La forma de la respuesta de las actions**: `{ok, datos}` / `{ok, error}` sigue siendo el
  único contrato; no se inventó un tercero.



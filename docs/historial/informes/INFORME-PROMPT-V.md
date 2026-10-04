# INFORME — PROMPT V (documentación para agentes)

Fecha: 2026-10-04. Ejecutado por Claude (no Cline) a pedido del usuario, con las
decisiones recomendadas (bloque DECISIONES del prompt). Base: `b184b01`. El prompt
está en `docs/historial/prompts/PROMPT_V_DOCUMENTACION_PARA_IA.md` y su porqué en
`docs/historial/auditorias/RETRO-AUDITORIA-DOCS-IA-2026-10-04.md`.

**Cómo leer este informe.** Cada parte pasó por tres agentes: un **implementador**
que hizo el cambio sin commit, un **auditor** independiente que lo revisó contra el
CONTRATO (`docs/normativo/CONTRATO-DE-CAMBIO.md` §2 y §3) y la filosofía, y un
**cierre** que aplicó los ajustes de la auditoría, volvió a validar y firmó el
commit. Cada sección de parte tiene las 7 subsecciones de la DECISIÓN 2: qué se
hizo, quién y con qué límites, cómo se midió, qué normas respetó, el veredicto
frente a la filosofía y la arquitectura, las desviaciones y lo que queda sin
verificar. El «Resumen» lo rellena el cierre final, cuando estén todas las partes.
Las cifras son fotos del 2026-10-04: la fuente viva es el script que las mide.

## Resumen

| Parte | Estado | Commit | Agentes | Veredicto filosofía |
|---|---|---|---|---|

---

## Parte A — Las herramientas de contexto fallan en voz alta

**Estado:** COMPLETA · **Commit:** el que contiene este informe («Prompt V, Parte A: …»; el sha va en el Resumen) · **Auditoría:** ACEPTAR_CON_CAMBIOS (los 2 ajustes, aplicados en el cierre)

### 1. Qué se hizo

| Archivo | Cambio | Ítem |
|---|---|---|
| `scripts/verificar-docs.mjs` | `pesa()` lee el Buffer y resta los bytes `0x0D`: mide lo versionado, igual que el CI. Línea fechada nueva bajo el párrafo de `TECHO_TOKENS` (el párrafo no se editó). `TECHO_TOKENS` sigue en 10500 | A1 |
| `scripts/gen-contexto.mjs` | `leer()` pasa CRLF → LF. `\` → `/` en las rutas, una vez, al leer los argumentos. `--tarea` por palabra completa y sin tildes (NFD); si una no casa, exit 1 con la lista de tareas válidas. Exit 1 si el presupuesto da 0 filas o si falta el CONTRATO (rama cline). `reglasOrden()` devuelve `null` si test-orden falla, y la rama claude escribe «no se pudo leer test-orden» | A2 |
| `scripts/gen-contexto.mjs` | `--salida` solo bajo `docs/historial/prompts/`; no pisa un archivo existente sin `--forzar` y nunca una carpeta. Cabecera JSDoc actualizada (QUÉ ESCRIBE y SALE CON 1) | A3 |
| `scripts/diag-peso-cambio.mjs` | `:262` desestructura `irreversible` (ya lo devolvía `pesar()`) | A4 |
| `scripts/README.md` | Fila de `gen-contexto.mjs`: `--salida=docs/historial/prompts/X.md`, `--forzar` y los casos de exit 1 | Ajuste 1 de la auditoría (cierre) |
| `docs/historial/informes/INFORME-PROMPT-V.md` | Este informe (DECISIÓN 4) | Cierre |

Diff de los scripts, sin contar los CR: +137/−28 (README incluido).

### 2. Quién lo ejecutó y qué pudo / no pudo hacer

| Agente | Rol | Pudo | No pudo y por qué |
|---|---|---|---|
| Claude (Opus 5.5), implementador | Hacer A1-A4 en lugar de Cline, sin commit | Leer el repo y `docs/historial/`; correr la VALIDACIÓN y `test:ci` antes y después; probar los fallos en una copia aislada del scratchpad, con la versión de `b184b01` como control positivo | Reproducir en el árbol real el fallo CRLF del CONTRATO, el presupuesto vacío o test-orden ilegible: habría que editar normativos o mover scripts. Comprobar la cifra en el CI de GitHub: no hay push. Tocar `scripts/README.md`: la parte no lo nombra (CONTRATO §2, alcance) |
| Claude, auditor independiente | Revisar contra CONTRATO §2/§3, las REGLAS de A y la filosofía | Re-ejecutar la VALIDACIÓN, `tsc`, eslint de los 3 scripts y los `--check`; repetir los fallos en su propia copia; comparar byte a byte el paquete de Cline nuevo con el de `b184b01` en 5 casos válidos | Re-ejecutar el build: lo dejó al cierre, porque `app/` no importa los `.mjs`. Corregir: un auditor no edita, solo propone (2 issues de severidad baja) |
| Claude, cierre | Aplicar la auditoría, re-validar, informe y commit | Editar `scripts/README.md` (ajuste 1) y corregir en este informe la frase de `cambio`/`cualquier` (ajuste 2); repetir la VALIDACIÓN completa y `test:ci`; commit con rutas concretas | Push: lo prohíben las reglas duras. Incluir el prompt V y la RETRO, que siguen sin seguimiento: no son archivos de la parte |

Ninguno de los tres tocó la base de datos, la red, `scripts/_peligrosos/`, `scripts/_archivo/`, `fase10-*` ni los 7 cambios ajenos del árbol.

### 3. Cómo se ejecutó y se midió

| Comando de VALIDACIÓN | Antes (`b184b01` + ajenos) | Después (cierre) |
|---|---|---|
| `npm run verificar:docs` | exit 0 · 10 485 tokens con CR (techo 10 500, margen aparente 15) | exit 0 · **10 345** tokens sin CR, igual que el CI · 0 rutas muertas |
| `gen-contexto --tarea=inexistente lib/auth/types.ts` | exit 0 y la misma salida que sin `--tarea` | exit 1 · mensaje y lista de las 13 tareas |
| `gen-contexto --tarea=sintoma lib/escolar/ciclo/calendario.ts` | exit 0 sin «Localizar un bug… síntoma» (la fila de ciclo salía solo por la sugerencia automática) | exit 0 con esa fila · idéntico byte a byte a `--tarea=síntoma` |
| `gen-contexto "app\actions\asistencias.ts"` | exit 0 sin «Tocar permisos…» | exit 0 con «Tocar permisos…» · idéntico a la ruta con `/` |
| `diag-peso-cambio lib/auth/permisos.ts` | «→ **Claude**» y luego `ReferenceError: irreversible`, exit 1 | exit 0 · TOTAL 3/14 → **Claude** («toca la AUTORIZACIÓN») · `--calibrar` sigue en 7/8 |
| `npm run test:ci` | EXIT 0 | EXIT 0 · 51/51 suites · test-orden 17 reglas OK · test-permisos 738/0 · auditoría de permisos 309/0 · `--check` de matriz, invariantes y rumbo al día · `verificar:estado` OK · build OK · lint: 1 aviso previo (`gen-panel.mjs:41` `MARCA`), ninguno nuevo |

**Tokens del arranque**: 10 485 con CR → 10 345 sin CR. Delta contra la base LF: **0**, porque no se tocó ninguno de los 8 archivos del arranque; la bajada de 140 sale solo de medir sin CR. Margen real hasta `TECHO_TOKENS = 10500`: **155**. El prompt decía «~10 344»; la cifra exacta es 10 345 por el redondeo por archivo.

**Casos de fallo**, probados en una copia aislada con la versión de `b184b01` como control:

| Caso | `b184b01` | Ahora |
|---|---|---|
| CONTRATO en CRLF | exit 0 con «(no se pudo leer CONTRATO-DE-CAMBIO.md §1)» | exit 0 y el paquete lleva el CONTRATO |
| CONTRATO sin bloque | exit 0 con el paquete sin CONTRATO | cline: exit 1 · claude: exit 0 (no lo usa) |
| Encabezado del presupuesto renombrado o sin `00-INDICE.md` | exit 0 con la lista vacía | exit 1 (también con `--tareas`) |
| Sin `scripts/test-orden.mjs`, `--agente=claude` | afirmaba «Ninguna regla… arrastra deuda viva» | «no se pudo leer test-orden» en las dos secciones |
| `--salida` fuera de `docs/historial/prompts/`, con `..`, absoluta, la carpeta, vacía o en una subcarpeta inexistente | escribía donde fuera | exit 1, sin escribir nada |
| `--salida` a un archivo existente | lo pisaba | exit 1 sin `--forzar`; con `--forzar` lo sobrescribe |

El paquete de Cline para entradas válidas es **idéntico byte a byte** al de `b184b01` en 5 casos (lo comprobó el auditor): no cambió contenido fuera de A.

### 4. Qué normas respetó

| Norma (CONTRATO §2 / §3) | Cumple | Evidencia |
|---|---|---|
| Ajenos intactos (reglas duras) | sí | Diff vacío con `--ignore-cr-at-eol --ignore-blank-lines` sobre los 7; el commit lleva solo rutas concretas |
| RESULTADO A1 | sí | 10 345 = suma de los blobs de HEAD / 4; párrafo fechado intacto y línea nueva debajo; techo sin tocar |
| RESULTADO A2: CRLF, exit 1 sin CONTRATO, con 0 filas o `--tarea` sin fila | sí | Copia aislada con control positivo; en el repo, `--tarea=inexistente` da exit 1 |
| RESULTADO A2: palabra completa y NFD | sí | `sintoma` = `síntoma`; `modificar`, `migracion`, `legacy`, `decision` y `permiso` dan exit 1; `ui` casa con la fila de apariencia y no con «arquitectura» |
| RESULTADO A2: `\` → `/` una vez | sí | Salida idéntica con `\` y con `/`; `capaDe`/`suitesDe` ya no normalizan por su cuenta |
| RESULTADO A2: rama claude sin test-orden | sí | «no se pudo leer test-orden»; ya no afirma «ninguna deuda» |
| RESULTADO A3 | sí | 10 rutas inválidas con exit 1; el hash del prompt V no cambió |
| RESULTADO A4 | sí | exit 0 y veredicto Claude; `:235` no usa `irreversible` |
| REGLAS de A: sin cambiar el paquete fuera de A, sin dependencias | sí | 5 paquetes idénticos byte a byte; ningún import nuevo |
| §2 Alcance: solo lo pedido | sí | Los 3 scripts de A + la fila del README que pidió la auditoría + este informe |
| §2 Alcance: legacy en pie (R8) | sí | No se borra nada; siguen el agente por defecto `cline` y el campo `claves` |
| §2 Alcance: sin fuente paralela (R6) | sí | Todo se lee de `00-INDICE`, CONTRATO §1 y `test-orden --json` |
| §2 Capas | n/a | Solo `scripts/`; no toca `lib/`, `app/` ni actions |
| §2 Datos | n/a | Sin esquema, sin base, sin `supabase/` |
| §2 Identidad | n/a | No toca dominio |
| §2 Verificación: tsc, suites, build | sí | `test:ci` en verde en el cierre (incluye los tres) |
| §2 Verificación: medición antes y después con el mismo script | sí | Tabla de la sección 3 |
| §2 Verificación: nada de `_peligrosos/` ni `_archivo/` | sí | Solo scripts de solo lectura permitidos |
| §2 Documentación: ESTADO-ACTUAL y MAPA §2 | n/a | No cambia ninguna regla estructural ni cierra deuda de `pendientes.json` |
| §2 Documentación: informe en `docs/historial/informes/` | sí | Este archivo (DECISIÓN 4) |
| ORDEN §4: `scripts/README.md` describe el contrato del script | sí | Era «no» en la auditoría; corregido en el cierre (ajuste 1) |
| §3 Motivos de rechazo inmediato | sí | Ninguno: sin `_peligrosos/`, sin migración, sin segunda fuente, con medición; la única cifra a mano es la línea fechada que pide A1 |
| Umbrales, `TECHO_TOKENS` y regeneradores | sí | 17 reglas OK; los `--check` al día; no se tocó `pendientes.json` ni ninguna Server Action |
| Finales de línea | sí | `gen-contexto` y `verificar-docs` en CRLF en el árbol; `diag-peso-cambio` y `README` en LF; `git diff --check` limpio |

### 5. ¿Sigue la filosofía y la arquitectura?

| Principio | Veredicto | Nota |
|---|---|---|
| R6 / §15: fuente única | respeta | El script sigue sin reescribir nada; si la fuente falta, ahora se para en vez de inventar una lista vacía. El README ya no describe un uso que falla |
| §16: medir antes y después | respeta | Antes y después de todos los comandos, más los fallos con control positivo; el cierre lo repitió |
| R8: el legacy no se retira antes de tiempo | respeta | `cline` por defecto (por los prompts archivados) y `claves` (lo usan las sugerencias automáticas, que son de la Parte E) |
| Reutilizar antes de crear | respeta | A4 usa el `irreversible` que `pesar()` ya devolvía; `listaTareas()` sirve a `--tareas` y al error |
| No aflojar umbrales ni `TECHO_TOKENS` | respeta | Medir sin CR no afloja: el CI ya medía 10 345, y ahora local y CI coinciden |
| Economía del arranque | respeta | Delta 0, margen 155 |
| ORDEN §4: dónde va cada cosa | respeta | Cambios dentro de los scripts, cabecera JSDoc y fila del inventario alineadas |
| Fallar en voz alta (objetivo de la parte) | respeta | Cada caso que antes daba exit 0 con un resultado incompleto sale con 1 y un mensaje, o está corregido |
| Capas e identidad | n/a | Herramientas de documentación, sin dominio |

**Veredicto global:** la Parte A sigue la filosofía y la arquitectura del repo; lo único que cambia es que las herramientas, cuando no pueden leer su fuente, lo dicen y se paran.

### 6. Desviaciones y decisiones propias

**Desviaciones**

| Ítem | Qué cambió | Por qué |
|---|---|---|
| A4: el ESTADO cita `:262` y `:235` | Solo `:262` | `irreversible` solo se usa después de `:262`; en `:235` (bucle de `--calibrar`) sería una variable sin usar y eslint avisaría |
| Validación «`--tarea=sintoma` casa síntoma» | Ningún cambio de código; aclaración | Antes ya salía la fila de ciclo, pero por la sugerencia automática; la de «síntoma» no salía y ahora sí |
| Fallo CRLF del CONTRATO | Probado en una copia aislada | En esta copia el CONTRATO está en LF; no se cambian los finales de un normativo solo para probar |
| Fila de `gen-contexto` en `scripts/README.md` | La editó el cierre, en el commit de A | La pidió la auditoría (ajuste 1): la B5 no recoge esa fila y quedaría describiendo un uso que ahora sale con 1 |

**Decisiones propias del implementador**
- `pesa()` resta todos los `0x0D`, no solo los de `\r\n`: local y CI coinciden aunque un archivo se versione con CRLF.
- `--tarea` casa si sus palabras aparecen **enteras y seguidas** en el nombre de la fila. Admite tareas de varias palabras («ciclo escolar», «Server Action»), y el singular «permiso» ya no casa con «permisos».
- **Corregido en el cierre (ajuste 2)**: el implementador escribió que «cambio» y «cualquier» solo casan con la fila 0. No es así: por palabra completa, «cambio» casa también con «Auditar un cambio antes de aceptarlo», y «cualquier» con «Ejecutar cualquier script» (comprobado: cada una añade esa fila). Las palabras vacías («o», «de», «un») casan con varias filas; es inocuo, pero conviene saberlo.
- Las comprobaciones de `--tarea` y del CONTRATO van al leer los argumentos: el script falla pronto y nunca escribe a medias. La de 0 filas corta también `--tareas`.
- La comprobación del CONTRATO solo aplica a la rama cline; la claude no lo usa.
- `reglasOrden()` devuelve `null` (no `[]`) si test-orden falla, si el JSON es inválido o si no trae reglas.
- `--salida`: `\` → `/`, `path.resolve` y `path.relative` dentro de la carpeta; error claro si la subcarpeta no existe; una carpeta nunca se sobrescribe, ni con `--forzar`.
- La normalización de rutas se hace una sola vez; se quitó el `replace` redundante de `capaDe()` y `suitesDe()`, sin cambio en la salida.
- Si falta `00-INDICE.md` o el CONTRATO, `presupuesto()` y `contrato()` devuelven vacío o `null` en vez de lanzar ENOENT, para salir con el mensaje claro.

**Nota para la Parte E.** Si E1(g) («es tarea de Claude») se implementa mirando la fila casada, `--tarea=cambio --agente=cline` daría ese error, porque «cambio» casa con «Auditar un cambio…». E1(g) debe comprobar el literal pedido (auditar o prompt), o asumir ese caso a propósito. Las 11 tareas de la tabla E2 ya son válidas, y `ui` cumple el caso negativo tal como está escrito.

### 7. Lo no verificado y lo pendiente

| Qué | Estado | Por qué / quién |
|---|---|---|
| La cifra 10 345 en el CI real de GitHub | no verificado | No hay push. La equivalencia sale de la suma de los blobs de HEAD y de la cifra del ESTADO ACTUAL del prompt |
| Los fallos (CRLF, presupuesto vacío, test-orden ilegible) en el árbol real | verificado solo en copia | Reproducirlos exigiría editar normativos o mover scripts |
| Suite propia de `gen-contexto` | pendiente | La crea la Parte E (E2) |
| `docs/historial/prompts/PROMPT_V_DOCUMENTACION_PARA_IA.md` y la RETRO | sin seguimiento | No son archivos de la parte; que decida el cierre final si van en un commit |
| Aviso de lint en `gen-panel.mjs:41` (`MARCA`) | previo | Ajeno a la Parte A |
| `--tarea=cambio` con E1(g) | a vigilar | Ver la nota para la Parte E en la sección 6 |

---

## Parte B — Scripts: ni secretos en la salida ni una cuarentena que se pueda desarmar

**Estado:** COMPLETA · **Commit:** el que contiene este informe («Prompt V, Parte B: …»; el sha va en el Resumen) · **Auditoría:** ACEPTAR_CON_CAMBIOS (el issue medio y los dos bajos de `test-orden`, aplicados en el cierre; el de `MAPA:90` queda para D1)

### 1. Qué se hizo

| Archivo | Cambio | Ítem |
|---|---|---|
| `diag-credenciales-duplicadas.mjs` | CLAVE de profesores y alumnos y CURPs → grupo A, B… con su recuento; la CURP sale `[oculta]` | B1 |
| `verificar-login-credenciales-iniciales.mjs` · `verificar-credenciales-iniciales.mjs` | contraseña y CURP → `[oculta]`; cada fila se nombra por los 8 primeros caracteres de `tutor_id` | B1 |
| `6j-verificar-password-tutor.mjs` | CURP del tutor y del alumno, contraseña inicial y el valor que coincide → `[oculta]` o el nombre del campo | B1 |
| `diagnostico-login-tutor.mjs` | `clave=` y `curpAlumno` → `[oculta]`; la cabecera ya no dice «NO expone contraseñas» sin serlo | B1 |
| `migrar-marcar-claves-compartidas-profesores.mjs` | CLAVE por profesor (también en el dry-run) → `[oculta]` con su grupo; la cabecera, sin los valores | B1 |
| `migrar-crear-tecnico.mjs` · `migrar-crear-administracion.mjs` | técnico: sin el literal de la clave, exige `--clave=` (≥ 6) antes de leer `.env.local` y no la imprime; administración: no repite la que llega por `--clave=` | B1 |
| `6i-diagnostico-login-tutor.mjs` · `diag-profesor-alcance.mjs` · `probe-profesores-data.mjs` · `probe-materias-alumnos.mjs` | 6i: la contraseña literal de un tutor real pasa a `--pw=`; alcance: `profesor_clave` (la CLAVE) solo como recuento; los dos probes: volcados con CLAVE y CURP → `[oculta]` | B1 (extra) |
| `scripts/_peligrosos/*.mjs` (23) | +1 línea: `throw new Error("CUARENTENA: …")` como primera sentencia tras los `import` | B2.1 |
| `scripts/test-orden.mjs` | C18 nueva (DURA, fuente crudo, falla también con la carpeta vacía); C6 ve el método HTTP sobre el fuente sin comentarios y con cadenas (`codigoDesnudo({ conservarCadenas })`), con la excepción nominal `C6_RPC_DE_LECTURA`; C10 apretado de 34 a 19 | B2.2 · B4 · B5 |
| `scripts/test-orden.mjs` | C18: el `import` acaba en su especificador, no en el primer `;`. C6: `rpc(variable)` quita la exención; el método se ve con backtick, con la clave entre comillas y en cualquier caja. Las comillas de esas regex van como `\x22`, `\x27` y `\x60` | Cierre (issues bajos 2 y 3) |
| `.clineignore` | `+ scripts/_peligrosos/`; fuera la línea `contexto.feliz` (ruta inexistente) | B2.3 |
| `fase10-carga.mjs` · `fase10-perfil-datos.mjs` | carga: `--confirmar-carga` en `:30`, antes de `.env.local` (`:65`) y del primer `fetch` (`:122`); `--x=v` y `--x v`. Perfil: cabecera `--runs=N`; panel directivo con la consulta de la app (`SELECT_TUTOR` copiada con cita, `order(created_at desc)`, credenciales en lotes de 50) | B3 |
| `scripts/README.md` | `CARGA`; una etiqueta por `gen-`; filas propias (3 probes de PATCH, `fase10-*`, `6j`, `diag-sql-aplicado`, `diagnostico-login-tutor`, la serie `f0…f8` por nombre); sin cifras derivables; la sospecha remite a ESTADO §5; «sin fila = `ESCRIBE`»; regla de credenciales | B1 · B5 |
| `scripts/README.md` | La regla se amplía a todo script que imprima una CURP, y 12 filas lo marcan: «salida sensible: no ejecutar desde Cline (imprime CURPs)» | Cierre (issue medio 1) |
| `RUMBO.md` | Regenerado en el cierre sobre `19dc335`: publica C10 = 19 | B5 |
| `docs/historial/informes/INFORME-PROMPT-V.md` | Esta sección | Cierre |

Diff de la parte sin contar los CR ni este informe: 41 archivos, +310/−97 (`test-orden` +99/−8, README +55/−32).

### 2. Quién lo ejecutó y qué pudo / no pudo hacer

| Agente | Rol | Pudo | No pudo y por qué |
|---|---|---|---|
| Claude (Opus 5.5), implementador | Hacer B1-B5 en lugar de Cline, sin commit | Leer código e historial para diagnosticar; medir antes y después; mutar `test-orden` con copia byte a byte y restaurarlo (comprobado con `cmp`); `node --check` de los 38 scripts editados; probar aislado el parser de `fase10-carga`; `test:ci` | Ejecutar los scripts editados (credenciales, `_peligrosos/`, `fase10`, probes): lo prohíben la cabecera y la parte. Confirmar en la base que la RPC desplegada es la del `.sql`. Decidir si se enmascaran las CURPs de los diagnósticos operativos: cambia herramientas, lo dejó para Claude o el usuario |
| Claude, auditor independiente | Revisar contra CONTRATO §2/§3, las REGLAS de B y la filosofía | Repetir la VALIDACIÓN barata, el control positivo de B4 y los `--check`; revisar el diff línea a línea; probar en el scratchpad los dos huecos (import sin `;`, `rpc(variable)`) y su arreglo | Corregir: un auditor solo propone (1 issue medio, 3 bajos). Ejecutar scripts que conectan a Supabase |
| Claude, cierre | Aplicar la auditoría, re-validar, informe y commit | Marcar las 12 filas y ampliar la regla (issue 1); endurecer C18 y C6 (issues 2 y 3) y probarlos aislados con los casos del auditor; regenerar RUMBO; VALIDACIÓN completa y `test:ci`; commit con rutas concretas | Editar el MAPA (issue 4): es de D1. Push: prohibido. Enmascarar las CURPs operativas: decisión del usuario (ver §6) |

Ninguno de los tres ejecutó un script de `_peligrosos/`, `_archivo/`, `fase10-*` ni de credenciales, ni conectó con Supabase, ni tocó los 7 archivos ajenos.

### 3. Cómo se ejecutó y se midió

Orden del implementador: MEDICIÓN → B1 → B2 (throw → C18 en verde → `.clineignore`) → B3 → B4 (control positivo antes de declarar la excepción) → B5 → C10 → `gen-rumbo` → VALIDACIÓN. El cierre: issues → `test-orden` antes/después con el mismo comando → VALIDACIÓN → `test:ci`.

| Medición | Antes (sin B) | Después (cierre) |
|---|---|---|
| `node scripts/test-orden.mjs --detalle` | 17 reglas OK. C6 = 0, pero solo miraba `.insert/.update/.upsert/.delete/.rpc(`. C10 34/34. C11 21/21 | 18 reglas OK. C6 = 0 viendo también el método HTTP. **C10 19/19**. C11 21/21. **C18 = 0**. Con los arreglos del cierre, salida idéntica a la de antes de aplicarlos |
| `git grep -niE "console…(clave\|contrase\|password\|inicial\|curp)"` (vivos) | 94 líneas; 9 scripts de credenciales imprimían valor o CURP, 2 probes volcaban filas con CLAVE y 6i tenía como literal la contraseña de un tutor real | 97 líneas revisadas: ningún script de credenciales imprime valor ni CURP. Quedan `clave_tutor` (público), la clave al azar de administración (una vez, si se generó) y CURPs en 13 scripts operativos, marcados en 12 filas del README |
| Control positivo de B4 (método HTTP sin excepción, 93 scripts vivos) | 1 hallazgo: `diag-materias-alumno.mjs:37` POST, la RPC de lectura `obtener_perfil_alumno` | El mismo hallazgo, también con la regex ampliada del cierre |
| `git grep -L "CUARENTENA" -- scripts/_peligrosos/` | los 23 | vacío |
| `git grep -n "confirmar-carga" scripts/fase10-carga.mjs` | nada | comprobación en `:30`; `.env.local` en `:65`; primer `fetch` en `:122` |
| `node scripts/gen-rumbo.mjs --check` | al día | al día (regenerado sobre `19dc335`, C10 = 19) |
| Tokens del arranque (`verificar:docs`) | 10 345 | **10 347** (+2, solo por RUMBO); techo 10 500 sin tocar; 0 rutas muertas |
| `npm run test:ci` | verde | **verde, exit 0**: tsc; lint 0 errores y 1 aviso previo (`gen-panel.mjs:41`); 51/51 suites; test-permisos 738/0; auditoría de permisos 309/0; `--check` de matriz, invariantes y rumbo al día; `verificar:estado` OK; `verificar:docs` OK; build OK |

**Pruebas de que los guardianes muerden** (implementador con mutaciones en el árbol, restauradas; cierre con las funciones extraídas de `test-orden.mjs` y probadas aparte):

| Caso | Resultado |
|---|---|
| Sin la línea `throw` / con una sentencia antes / comentarios entre imports y `throw` | C18 falla / falla / pasa |
| `import fs from "node:fs"` sin `;` + `fetch` con DELETE + `throw` (hueco del auditor) | antes del cierre pasaba; **ahora falla** |
| Import sin `;` seguido del `throw` · import de efecto lateral · shebang con CRLF | pasa · pasa · pasa |
| `diag-materias-alumno` con `rpc("eliminar_ciclo")` / con `const n = "eliminar_ciclo"; rpc(n)` | C6 falla / antes del cierre pasaba, **ahora falla** |
| Método con backtick · `"method": "DELETE"` · `method: "patch"` | antes no se veían; **ahora C6 los marca** |
| Método en comentarios · `GET` · `POSTER` | no marca nada |

### 4. Qué normas respetó

Del checklist del auditor; la columna «Cumple» es la suya, con lo que hizo el cierre donde cambió algo.

| Norma (CONTRATO §2 / §3) | Cumple | Evidencia |
|---|---|---|
| B1 · líneas citadas: `[oculta]`, grupos opacos con recuento, nunca una función del valor | sí | `etiqueta()` es un índice por orden; diff revisado línea a línea |
| B1 · cabecera de `diagnostico-login-tutor`, `--clave=` en el técnico, README:155 con recuentos, regla en Clasificación | sí | `--clave=` antes de `.env.local`; el literal ya no está en el árbol; «19, en dos grupos: 16 y 3» |
| B2 · `throw` en los 23, regla DURA sobre el fuente crudo, `.clineignore` | sí | `git grep -L` vacío; C18 = 0. El hueco del import sin `;` se cerró en el cierre |
| B3 · `--confirmar-carga` antes de `.env.local` y de todo `fetch`; ambas formas; perfil alineado | sí | `:30` < `:65` < `:122`; consulta idéntica a `tutores-credenciales.ts` |
| B4 · método HTTP sobre fuente con cadenas, exclusión solo en esa detección, excepción con motivo, control positivo | sí | Control repetido por auditor y cierre: solo `diag-materias-alumno:37`. El hueco de `rpc(variable)` se cerró en el cierre |
| B5 · etiquetas, filas, sin cifras, ESTADO §5, «sin fila = ESCRIBE», C10 ≤ 21 y RUMBO | sí | C10 = 19; RUMBO publica 19 y va en el commit |
| OBJETIVO 1 y VALIDACIÓN · «ninguno imprime valor ni CURP» | no → **estrechado y marcado en el cierre** | Los de credenciales cumplen. 13 operativos siguen imprimiendo CURPs; su fila lo marca y la decisión queda para el usuario (§6) |
| §2 Alcance: solo lo pedido, extras justificados | sí | Extras dentro del OBJETIVO (§6) |
| §2 Alcance: legacy en pie (R8) | sí | Sin borrados ni `git mv` |
| §2 Alcance: sin fuente paralela (R6) | sí | Sin módulo común de enmascarado; `SELECT_TUTOR` copiada con cita (inevitable: `server-only`) |
| §2 Capas · Datos · Identidad | n/a | Solo `scripts/` y documentación; sin esquema ni lógica de identidad |
| §2 Verificación: tsc, suites, build, medición antes/después | sí | Tabla de la sección 3 |
| §2 y §3 · nada de `_peligrosos/` ni `_archivo/` ejecutado; sin migración; sin cifras a mano | sí | Validación estática; la cifra de C10 la publica `gen-rumbo` |
| Reglas duras · ajenos intactos, índice vacío, finales de línea | sí | Diff de los 7 ajenos vacío con `--ignore-cr-at-eol --ignore-blank-lines`; `git add` con rutas concretas; `test-orden` sigue en CRLF (694/694) y el README en LF |
| `TECHO_TOKENS` y umbrales | sí | 10 500 intacto; C10 34 → 19; C6 y C18 duras en 0 |
| §2 Documentación (ESTADO, MAPA §2, informe) | sí | B no cambia nada que recojan; la línea de ORDEN es de C8; este informe |

### 5. ¿Sigue la filosofía y la arquitectura?

| Principio | Veredicto | Nota |
|---|---|---|
| R6 / §15 · fuente única | respeta | El README pierde cifras en vez de actualizarlas; C10 lo publica `gen-rumbo`; la copia de `SELECT_TUTOR` está citada |
| §16 · medir antes y después con el mismo instrumento | respeta | Misma batería antes y después; el cierre comparó `test-orden --detalle` y `--json` antes y después de sus arreglos: idénticos |
| R8 · el legacy no se retira | respeta | Los 23 de `_peligrosos/` se conservan, desarmados |
| Reutilizar antes de crear | respeta | `codigoDesnudo` gana una opción; la excepción sigue el patrón de `ONCONFLICT_NO_LITERAL_PERMITIDO` |
| No aflojar umbrales ni `TECHO_TOKENS` | respeta | C10 baja a 19; C18 nace dura |
| Economía del arranque | respeta | +2 tokens, solo por RUMBO |
| ORDEN · dónde va cada cosa | respeta | Regla en `test-orden`, inventario en el README, exclusión en `.clineignore`; la línea normativa, en C8 |
| Guardianes que fallan en voz alta | respeta | Los dos matices del auditor (import sin `;`, `rpc(variable)`) están cerrados; una forma de import que C18 no reconoce hace fallar la regla, no la deja pasar |
| Ninguna salida de diagnóstico expone credenciales | respeta en parte | Los de credenciales, sí. Los operativos siguen imprimiendo CURPs, ahora con la marca y la decisión pendiente |

**Veredicto global:** la Parte B sigue la filosofía y la arquitectura del repo: convierte dos reglas en prosa (la cuarentena y «los diagnósticos no escriben») en guardianes mecánicos que muerden; el único objetivo que queda a medias, el de las CURPs, está a la vista y espera una decisión.

### 6. Desviaciones y decisiones propias

**Desviaciones**

| Ítem | Qué cambió | Por qué |
|---|---|---|
| B1 más allá de las líneas citadas | CURPs de `diag-credenciales:98`, `6j:60/:90`, `verificar-credenciales-iniciales:37`; `diag-profesor-alcance:63`; los volcados de dos probes; el eco de `--clave=` en administración; el literal de 6i → `--pw=` | El OBJETIVO pide que ningún diagnóstico imprima una credencial; el grep no ve volcados ni literales |
| B5 · etiqueta propia también en `gen-panel`, `gen-matriz-permisos`, `gen-invariantes` y `gen-seccion4` | Cada uno dice lo que escribe | También escriben y figuraban como `LEE(fs)` o sin etiqueta |
| B3 · también la consulta de tutores de `fase10-perfil-datos` | `SELECT_TUTOR` + `order(created_at desc)` | El panel directivo lanza las dos consultas |
| README · «Con guarda (de escritura o de carga)» y la fila de `test-orden` sin «Diecisiete reglas» | Título y texto | `fase10-carga` tiene guarda pero no escribe; la cifra quedaba falsa con C18 |
| C18 falla con `_peligrosos/` vacío · el técnico exige `--clave=` sin generar una al azar | — | Un guardián que mide 0 no protege; generar la clave obligaría a imprimirla |
| **OBJETIVO 1 estrechado (cierre)** | Los 13 scripts que imprimen CURPs sin ser de credenciales se **marcan**, no se enmascaran: `7-diagnostico-materias-alumnos`, `diag-alcance-tutor`, `diag-inscripciones-duplicadas`, `-reactivacion`, `-vs-roster`, `diag-materias-alumno`, `diagnostico-ciclo-activo-bug`, `p0-verificar-restauracion`, `probe-curp`, `probe-materias-alumnos` y `probe-schema-tabla` (en la fila de los probes), `migrar-deduplicar-inscripciones` y `migrar-marcar-decision-manual` | La CURP es credencial (la CLAVE del alumno son sus 6 últimos caracteres, `claveDesdeCurp`; la contraseña inicial del tutor, los 8 últimos). Pero enmascararla cambia herramientas operativas (cruce con el roster, deduplicar) y no se pueden ejecutar para comprobarlas. El riesgo concreto es que la salida entre en el contexto de Cline, y la marca lo cubre |

**Decisión pendiente para el usuario:** en los diagnósticos `LEE`, (a) sustituir la CURP por nombre + grupo o por el id de la fila, o (b) conservarla con la marca, como ahora. En los dos `migrar-*` y en `probe-curp` la CURP es la clave de trabajo: lo razonable es (b).

**Decisiones propias**
- Implementador: C18 salta shebang, comentarios e `import` (no `import(` ni `import.meta`) y compara la primera línea con `trimEnd`. La excepción de C6 solo exime un POST a `/rest/v1/rpc/` si todas las RPC del archivo están declaradas. Etiquetas opacas de una línea por script (sin módulo común) y sin imprimir la longitud. C10 apretado a lo medido (19), no a 21.
- Cierre: en C18, el `import` termina en su especificador con `;` opcional, y una forma que no reconoce devuelve −1 (C18 falla). En C6, cualquier `rpc(` con nombre no literal quita la exención, y la regex de método admite backtick, clave entre comillas y cualquier caja. Las comillas de esas regex se escriben `\x22`, `\x27`, `\x60` para no desalinear el escáner de `test-orden.mjs`, que C6 también recorre (es un `test-`). RUMBO, regenerado justo antes del commit.

**Para D1** (issue bajo 4, no se edita aquí): `docs/sistema/MAPA-DEL-SISTEMA.md:90` manda a `diagnostico-login-tutor.mjs` y `verificar-login-credenciales-iniciales.mjs`, que ahora son «salida sensible: no ejecutar desde Cline». Añadir «(salida sensible: los ejecuta Claude o una persona)». En `:93`, `6i-diagnostico-login-tutor.mjs` pide ahora `--pw=`.

### 7. Lo no verificado y lo pendiente

| Qué | Estado | Por qué / quién |
|---|---|---|
| Las salidas enmascaradas, la guarda de `fase10-carga` y la consulta de `fase10-perfil-datos` en vivo | no verificado | Ejecutarlos está prohibido; validación estática (`node --check`, diff, parser aislado, mutaciones) |
| Que la `obtener_perfil_alumno` desplegada sea solo SELECT | no verificado | Sin acceso a la base; la excepción de C6 se apoya en el `.sql` del repo |
| Cambio de clave del técnico y del tutor de 6i | pendiente, de persona | Sus literales salieron del árbol pero siguen en el historial (`b184b01`); purgarlo es destructivo. Confirmar o forzar el cambio |
| CURPs reales en el repo: 5 CSV de `scripts/_archivo/` (~1 250 líneas), fixtures de `test-rediseno-oceano.mjs:652-653` (una da la contraseña inicial del tutor de 6i), 7 probes de `_peligrosos/`, `docs/historial/` | pendiente, decisión | Ocultarlas en la salida protege poco mientras el repo las tenga: la medida real es rotar las claves derivadas de la CURP |
| La clave compartida de profesores publicada en ESTADO-ACTUAL, GLOSARIO, CONTRATO, MAPA y REGLAS | pendiente | El «grupo A (16)» de `diag-credenciales` se invierte leyendo el arranque; la mitigación es el pendiente `claves-compartidas-profesores` (forzar el cambio) |
| Enmascarar las CURPs de los 13 operativos | decisión del usuario | Ver §6 |
| «`probe-*` (los 16 que quedan aquí)»: hoy son 17 | pendiente | Parte C (ninguna cifra derivable a mano) |
| «hoy faltan 35» (C10) y «las once reglas» en `test-orden.mjs` | pendiente | Parte D5 |
| Filas de `6i-listar-tutores`, `6k-verificar-clave-tutor` y 17 `probe-*` | deuda de C10 (19) | No lo pedía la parte |
| Línea normativa de la cuarentena en ORDEN · `MAPA:90` y `:93` | pendiente | C8 · D1 |
| `6j-verificar-password-tutor.mjs:30` usa por defecto el usuario (nombre real) de una tutora | sin tocar | No es credencial |
| El escáner de `test-orden` no entiende literales de regex | a vigilar | Hoy 0 falsos positivos en 93 scripts vivos; las regex nuevas no llevan comillas literales |
| Un `import … with { type: "json" }` en `_peligrosos/` haría fallar C18 | a vigilar | Falla en voz alta, no deja pasar; ninguno de los 23 lo usa |

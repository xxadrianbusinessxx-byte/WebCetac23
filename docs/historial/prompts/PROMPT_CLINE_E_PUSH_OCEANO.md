# PROMPT CLINE — E · Publicar el rediseño Océano (preview primero, main después)

> Este prompt NO cambia código de producto. Publica lo que ya está hecho y
> verifica que funciona antes de que llegue a main. Se ejecuta en **tres pasos
> con parada entre ellos**: el paso 3 solo se hace con autorización explícita.

---

## CONTEXTO

La rama `feature/rediseno-oceano` migra el portal del tema claro «Frutiger
Aero» al diseño oscuro **Océano**, y con él reemplaza cinco rutas por un shell
único en `/oceano`.

Estado medido hoy (no estimado — sale de recorrer los imports):

- **Cobertura funcional: completa.** Los 5 clientes retirados (`/perfil`,
  `/profesor`, `/directivo`, `/tutor`, `/configuracion`) montaban entre 4 y 13
  componentes cada uno. Todos son alcanzables desde `/oceano` salvo dos:
  `ui/frutiger-backdrop.tsx` y `ui/glossy-person-icon.tsx`, que son la
  decoración que este rediseño viene a sustituir.
- **Navegación: sin huecos.** 40 apartados activos, 40 con pieza que los
  pinta. Cero activos sin pieza. Además 6 maquetas y 10 apagados, todos
  declarados en `lib/navegacion/mapa-navegacion.ts`.
- **Restyle sobre la superficie viva: 89 %** (189 claro / 1590 oscuro). El 69 %
  que reporta el diagnóstico global incluye 522 ocurrencias que viven en
  clientes legacy YA NO ALCANZABLES, conservados por R8.
- **Verificación en ejecución: NINGUNA.** Nadie ha abierto el portal con
  sesiones reales de los cinco roles. Eso es lo que este prompt cierra.

Rama: `feature/rediseno-oceano`, **25 commits por delante** de su remoto.
Es un fast-forward: no hay divergencia que resolver.

---

## OBJETIVO

1. Publicar la rama para que Vercel genere un **Preview Deployment**, sin tocar
   producción.
2. Verificar en ese preview que lo que funcionaba en la UI antigua funciona en
   la nueva, rol por rol.
3. **Solo si el paso 2 sale limpio y el responsable lo autoriza**, llevar la
   rama a `main`.

---

## PASO 1 — Publicar la rama (y PARAR)

### Antes de tocar nada

```bash
git status                       # el árbol debe estar limpio
git log --oneline origin/feature/rediseno-oceano..feature/rediseno-oceano
git diff --stat origin/feature/rediseno-oceano..feature/rediseno-oceano
```

Pega las tres salidas. Si `git status` muestra algo sin commitear, **para y
repórtalo**: no commitees por tu cuenta lo que encuentres.

### Comprobación de secretos (obligatoria antes del push)

```bash
git ls-files | grep -i "\.env"
```

Debe devolver **únicamente** `.env.example`. Si aparece `.env.local` o
cualquier otro archivo con credenciales, **PARA y repórtalo**: un push publica
lo que haya, y un secreto empujado a GitHub ya no se retira borrándolo.

### El push

```bash
git push origin feature/rediseno-oceano
```

**Solo esa rama.** Nada de `git push --all`, nada de `--force`, nada de tocar
`main`. Ojo: la rama local `main` tiene 1 commit sin publicar
(`058e02a docs: evaluacion del repositorio`) — **no lo publiques**, no forma
parte de este trabajo.

### Variables de entorno en Vercel

Comprueba en **Vercel → Settings → Environment Variables** que estas cinco
existen con el scope **Preview** marcado:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
AULANUBE_SESSION_SECRET
CLOUDINARY_CLOUD_NAME          (y las tres CLOUDINARY_* si Documentos se prueba)
```

`AULANUBE_SESSION_SECRET` es la crítica y la razón es concreta: un Preview
corre con `NODE_ENV=production`, y `lib/auth/session.ts` **lanza excepción** si
falta en producción. Sin ella el login revienta y parecerá un fallo de la
migración cuando es de configuración.

**Si alguna falta, NO la crees tú.** Repórtalo: son credenciales y las pone el
responsable.

### Entrega del paso 1 y PARADA

Reporta: la URL del preview, el estado del build en Vercel, y si hubo warnings.
**Para aquí.** No sigas al paso 2 sin confirmación.

---

## PASO 2 — Verificar en el preview (y PARAR)

### AVISO QUE NO SE PUEDE SALTAR

El preview aísla el **frontend**, no la **base de datos**. Con las mismas
variables de Supabase, escribir en el preview es **escribir en producción real**
(`scripts/README.md`: no hay staging).

Por tanto, en esta verificación:

- **SÍ:** entrar con cada rol, navegar todas las pestañas y apartados, abrir
  materias, ver tablas, ver el calendario, cerrar sesión y volver a entrar.
- **NO:** subir ningún Excel, no ejecutar el configurador de ciclo, no aplicar
  carga académica, no guardar ni borrar días del calendario, no resolver
  justificaciones, no tocar credenciales de profesores.

Si una verificación exige escribir para tener sentido, **decláralo como no
verificado** en vez de escribir.

### Qué comprobar, rol por rol

Contrasta contra `lib/navegacion/mapa-navegacion.ts`, que es la fuente. Para
cada rol, que el número de pestañas y apartados coincida y que cada apartado
activo pinte algo:

| Rol | Pestañas | Qué mirar con atención |
|---|---|---|
| alumno | Perfil · Materias · Calendario · Chat | los 5 apartados de Perfil traen datos; Calendario escolar dibuja el mes; Chat sale apagado con su motivo |
| tutor | igual + `Perfil › Mis mensajes` | el selector de alumno del rail cambia el alcance de TODO; la bandeja trae lo dirigido al tutor |
| maestro | Materias · Calendario/Asistencias | el catálogo llega filtrado (R-4); Calendario escolar se ve SIN botones de guardar/eliminar |
| directivo | + Grupos/Boleta + Administración escolar | **Grupos/Boleta lista GRUPOS (1RO A…), no materias**; las 4 maquetas navegan y no operan |
| técnico | Ciclo escolar · Catálogo · Personas · Contenido | los 10 apartados activos montan su panel; Documentos y Noticias apagados |

### Los cuatro puntos donde SÉ que se ve tema claro

No son sorpresas; están medidos. Confirma si molestan de verdad o no:

1. `cambio-clave-forzado.tsx` (39 ocurrencias) — lo monta el layout raíz para
   cualquiera con `debeCambiarCredenciales`. **Es el único que un usuario
   normal puede encontrarse de frente.**
2. `alumnos-estrella` + `eventos-inicio` (12) — bloques conservados en la
   portada pública.
3. `documentos-panel` + `documentos-client` (126) y `glossy-nav-pill` (11) —
   solo visibles en `/documentos`.
4. `app/layout.tsx` (1) — el `text-slate-800` del `body`.

### Y un cabo suelto que hay que decidir, no arreglar

`/documentos` sigue viva con la UI antigua, pero desde `/oceano` **no hay
ningún enlace hacia ella** (la barra legacy no se dibuja en esa ruta). Solo se
alcanza escribiendo la URL. En el mapa, `contenido/documentos` está
`off(..., "decision")`. **No lo toques**: repórtalo para que el responsable
decida entre retirar la ruta o darle entrada.

### Entrega del paso 2 y PARADA

Una tabla: rol · pestañas vistas · apartados activos que respondieron ·
apartados que fallaron · qué error exacto. Y una frase clara: **¿funciona en la
nueva UI todo lo que funcionaba en la antigua, sí o no?**

**Para aquí.** El paso 3 NO se ejecuta sin un «sí» explícito del responsable.

---

## PASO 3 — Llevar a main (SOLO con autorización explícita)

No lo ejecutes por iniciativa propia, ni aunque el paso 2 salga perfecto.

Cuando se autorice, **vía Pull Request**, no merge local:

```bash
gh pr create --base main --head feature/rediseno-oceano \
  --title "Rediseño Océano: portal unificado en /oceano" \
  --body-file <resumen del paso 2>
```

El PR deja el cambio revisable y revertible de un clic, que es justo lo que
hace falta cuando 25 commits reemplazan cinco rutas a la vez. Un
`git push origin main` directo no.

**Prohibido en este paso:** `--force` sobre `main`, `git rebase` de la rama ya
publicada, y borrar `feature/rediseno-oceano` tras el merge (R8: es la única
vuelta atrás barata).

---

## LÍMITES DE ESTE PROMPT

- **No escribas código de producto.** Si encuentras un fallo, repórtalo; no lo
  arregles dentro de este prompt. Un arreglo metido en un prompt de publicación
  es un cambio sin diagnóstico y sin suite.
- **No borres ni desactives nada legacy.** R8.
- **No ejecutes nada de `scripts/_peligrosos/`.** Hay scripts con nombre
  inofensivo que vacían tablas en real.
- **No crees ni edites variables de entorno.** Son credenciales del
  responsable.
- **No commitees lo que encuentres sin commitear.** Repórtalo.

---

## CONTRATO (obligatorio)

Adaptado: este prompt publica, no implementa. Los puntos 2, 3 y 4 del contrato
estándar se cumplen por no aplicar —no hay lógica nueva, no hay escritura de
datos, no hay fuente nueva—. Los que sí aplican:

```
1. Antes de tocar nada: pegar `git status`, `git log` y `git diff --stat`
   contra el remoto, y la comprobación de secretos (`git ls-files | grep .env`).
5. Validar ANTES del push, en local: npx tsc --noEmit + npm run test:suites
   + npm run build. Los tres en verde o no hay push.
6. Después del push: el estado del build de Vercel, y tras la verificación el
   diagnóstico `node scripts/diag-restyle-oceano.mjs` para dejar la cifra
   registrada junto a la publicación.
7. Entregar: qué se publicó, qué se verificó, qué NO se pudo verificar por no
   escribir en la base real, y qué quedó pendiente de decisión.
```

---

## INFORME FINAL

### Publicado
Qué rama, qué commit, qué URL de preview.

### Verificación por rol
La tabla del paso 2.

### Lo que NO se verificó
Y por qué (típicamente: exigía escribir en la base real).

### Diferencias con la UI antigua
Funciones que no se encontraron, o que se comportan distinto.

### Pendiente de decisión del responsable
`/documentos` sin entrada, los cuatro focos de tema claro, y lo que salga.

### Estado de main
Debe decir **«sin tocar»** salvo que el paso 3 se haya autorizado por escrito.

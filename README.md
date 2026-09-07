# mi-web-escolar — portal escolar CETAC 23

Portal escolar con cuatro roles (alumno, profesor, directivo, tutor): asistencia,
calificaciones, horario, justificaciones, documentos y administración del ciclo escolar.

Next.js 16 · React 19 · Supabase (PostgREST + Storage) · Cloudinary · SheetJS.
Sin API REST propia: todo el transporte navegador→servidor son Server Actions.

## Empezar

```bash
npm install
npm run dev          # http://localhost:3000
```

Variables de entorno: copiar `.env.example` a `.env.local` y rellenarlas.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (webpack). `dev:turbo` para turbopack. |
| `npm run build` | Build de producción. |
| `npm run lint` | ESLint. |
| `npx tsc --noEmit` | Typecheck. Debe dar 0 errores antes de cualquier entrega. |
| `npm run test:compilar` | Compila los módulos puros que consumen las suites `test-*.mjs`. |

## Documentación

Toda la documentación se navega desde un único índice:

**→ [`docs/00-INDICE.md`](docs/00-INDICE.md)**

Atajos:

| Para | Leer |
|---|---|
| Saber qué es verdad hoy | [`ESTADO-ACTUAL.md`](ESTADO-ACTUAL.md) |
| Localizar un bug por su síntoma | [`docs/sistema/MAPA-DEL-SISTEMA.md`](docs/sistema/MAPA-DEL-SISTEMA.md) |
| Entender cómo funciona por dentro | [`docs/sistema/FLUJO-TECNICO.md`](docs/sistema/FLUJO-TECNICO.md) |
| Qué está prohibido y por qué | [`docs/normativo/REGLAS_NO_HACER.md`](docs/normativo/REGLAS_NO_HACER.md) |
| Ejecutar algo de `scripts/` | [`scripts/README.md`](scripts/README.md) — **obligatorio** |

## Si eres un agente de IA

Empieza por [`AGENTS.md`](AGENTS.md). No cargues documentación «por si acaso»:
el índice existe precisamente para no gastar contexto.

## Aviso

No hay entorno de staging. `scripts/` corre con `service_role` y salta RLS:
lo que se toca, se toca en producción. `scripts/_peligrosos/` contiene scripts que
vacían tablas.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "./service.ts";

/**
 * Cliente de datos por petición: Server Components, Server Actions y Route Handlers.
 *
 * Es el de service_role (salta RLS). La clave anon/publicable ya no lee ni escribe
 * datos: `supabase/crear-rls-cerrar-anon.sql` la deja sin acceso (RLS activada y
 * sin políticas), así que quién puede ver qué lo decide la app (`exigir()` y el
 * alcance de cada rol), no la base. Solo servidor: nunca desde un Client Component.
 * El tope de peticiones simultáneas (`fetchConTope`) lo pone `createServiceClient()`.
 *
 * Antes era `createServerClient` de `@supabase/ssr` con la clave anon y las cookies;
 * la app no usa sesiones de Supabase Auth (la sesión es la cookie propia de
 * `lib/auth/`), así que las cookies no cambiaban nada. Sigue siendo `async` para
 * no tocar los ~230 `await createClient()`.
 */
export async function createClient(): Promise<SupabaseClient> {
  const cliente = createServiceClient();
  if (!cliente) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY (Vercel / .env.local): con anon cerrado por RLS, el servidor no puede leer la base.",
    );
  }
  return cliente;
}

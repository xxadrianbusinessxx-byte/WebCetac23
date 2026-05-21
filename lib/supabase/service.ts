import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "./env";

/** Cliente con service role (solo servidor). Omite RLS en lecturas/escrituras escolares. */
export function createServiceClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) return null;
  return createSupabaseClient(getSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Preferir service role en Server Actions; si no está en Vercel, usar el cliente de sesión. */
export async function clienteLecturaEscolar(
  clienteSesion: SupabaseClient,
): Promise<SupabaseClient> {
  return createServiceClient() ?? clienteSesion;
}

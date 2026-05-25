import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicKey, getSupabaseUrl } from "./env";

/** Cliente para componentes con `"use client"` (singleton en el navegador). */
export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabasePublicKey());
}

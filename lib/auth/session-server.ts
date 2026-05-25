import { cookies } from "next/headers";
import { decodePortalSession, PORTAL_SESSION_COOKIE } from "./session";
import type { PortalSessionPayload } from "./types";

export async function obtenerSesionPortal(): Promise<PortalSessionPayload | null> {
  const store = await cookies();
  const token = store.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) return null;
  return decodePortalSession(token);
}

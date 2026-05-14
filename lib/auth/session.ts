import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { PortalSessionPayload } from "./types";

export const PORTAL_SESSION_COOKIE = "aulanube_portal";

function sessionSecret(): string {
  const s = process.env.AULANUBE_SESSION_SECRET?.trim();
  if (s) return s;
  if (process.env.NODE_ENV !== "production") {
    return "__aulanube_dev_session_secret__";
  }
  throw new Error("Define AULANUBE_SESSION_SECRET en producción.");
}

function sign(body: string): string {
  return createHmac("sha256", sessionSecret()).update(body).digest("base64url");
}

export function encodePortalSession(payload: PortalSessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodePortalSession(token: string): PortalSessionPayload | null {
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = sign(body);
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PortalSessionPayload;
    if (
      parsed &&
      typeof parsed.matricula === "string" &&
      (parsed.rol === "alumno" || parsed.rol === "maestro" || parsed.rol === "directivo")
    ) {
      return parsed;
    }
  } catch {
    /* inválido */
  }
  return null;
}

export async function setPortalSessionCookie(payload: PortalSessionPayload): Promise<void> {
  const store = await cookies();
  store.set(PORTAL_SESSION_COOKIE, encodePortalSession(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

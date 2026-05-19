import type { Metadata } from "next";
import { Suspense } from "react";
import { obtenerSesionPortal } from "@/lib/auth/session-server";
import { ChatClient } from "./chat-client";

export const metadata: Metadata = {
  title: "AulaNube — Chat",
  description: "Conversación entre la comunidad escolar.",
};

export default async function ChatPage() {
  const sesion = await obtenerSesionPortal();
  return (
    <Suspense fallback={<div className="min-h-dvh bg-sky-100" />}>
      <ChatClient sesion={sesion} />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { ChatClient } from "./chat-client";

export const metadata: Metadata = {
  title: "AulaNube — Chat",
  description: "Conversación entre la comunidad escolar.",
};

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-sky-100" />}>
      <ChatClient />
    </Suspense>
  );
}

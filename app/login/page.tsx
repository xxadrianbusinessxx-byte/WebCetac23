import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AulaNube — Login",
  description: "El acceso se realiza desde la página principal.",
};

export default function LoginPage() {
  redirect("/");
}

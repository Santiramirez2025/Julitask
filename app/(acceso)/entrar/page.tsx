import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { usuarioActual } from "@/lib/auth";
import { FormEntrar } from "@/components/FormAcceso";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function Entrar() {
  if (await usuarioActual()) redirect("/");
  return (
    <>
      <h1 className="mb-5 text-[1.9rem] leading-tight font-bold text-marino">Entrar</h1>
      <FormEntrar />
    </>
  );
}

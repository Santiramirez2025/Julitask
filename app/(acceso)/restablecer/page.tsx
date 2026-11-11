import type { Metadata } from "next";
import Link from "next/link";
import { FormRestablecer } from "@/components/FormAcceso";

export const metadata: Metadata = { title: "Contraseña nueva", referrer: "no-referrer" };

export default async function Restablecer({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  return (
    <>
      <h1 className="mb-5 text-[1.9rem] leading-tight font-bold text-marino">Elegí tu contraseña nueva</h1>
      {/^[a-f0-9]{64}$/.test(token) ? (
        <FormRestablecer token={token} />
      ) : (
        <>
          <p className="rounded-[14px] bg-rojo-claro px-3.5 py-2.5 font-semibold text-rojo">El enlace no es válido. Pedí uno nuevo.</p>
          <Link href="/recuperar" className="boton mt-4 w-full">Pedir otro enlace</Link>
        </>
      )}
    </>
  );
}

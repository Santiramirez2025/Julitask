"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, Settings, Sparkles } from "lucide-react";
import { useApp } from "./Proveedor";

const PADRES: Record<string, { href: string; texto: string }> = {
  obras: { href: "/obras", texto: "Obras" },
  clientes: { href: "/clientes", texto: "Clientes" },
  inmuebles: { href: "/inmuebles", texto: "Inmuebles" },
};

export function Barra() {
  const ruta = usePathname();
  const app = useApp();
  const partes = ruta.split("/").filter(Boolean);
  const enInicio = partes.length === 0;
  const volver = partes.length >= 2 && PADRES[partes[0]] ? PADRES[partes[0]] : { href: "/", texto: "Inicio" };

  return (
    <header className="sticky top-0 z-20 bg-papel/92 backdrop-blur-sm">
      <div className="mx-auto flex min-h-[3.6rem] max-w-3xl items-center justify-between gap-2 px-3 pt-[env(safe-area-inset-top)]">
        {enInicio ? (
          <Link
            href="/ajustes"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 font-semibold text-marino hover:bg-hundido"
          >
            <Settings aria-hidden size={21} /> Ajustes
          </Link>
        ) : (
          <Link
            href={volver.href}
            className="inline-flex min-h-11 items-center gap-0.5 rounded-xl py-1 pr-3 pl-1 font-bold text-marino hover:bg-hundido"
          >
            <ChevronLeft aria-hidden size={24} /> {volver.texto}
          </Link>
        )}
        <button
          type="button"
          onClick={() => app.abrirAsistente()}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 font-bold text-marino hover:bg-hundido"
        >
          <Sparkles aria-hidden size={20} /> Asistente
        </button>
      </div>
    </header>
  );
}

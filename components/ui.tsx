import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { plataCentavos, MONEDAS, type Totales } from "@/lib/dinero";

export function Titulo({ children, detalle }: { children: ReactNode; detalle?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-[1.9rem] leading-tight font-bold text-marino">{children}</h1>
      {detalle && <p className="mt-1 text-tenue">{detalle}</p>}
    </div>
  );
}

/** Pantalla sin datos: dice qué es esto y ofrece el primer paso. */
export function Vacio({
  Icono,
  titulo,
  texto,
  children,
}: {
  Icono: LucideIcon;
  titulo: string;
  texto?: string;
  children?: ReactNode;
}) {
  return (
    <div className="tarjeta flex flex-col items-center px-6 py-10 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-marino-claro text-marino">
        <Icono aria-hidden size={30} strokeWidth={1.8} />
      </span>
      <p className="mt-4 text-[1.2rem] font-bold text-marino">{titulo}</p>
      {texto && <p className="mt-1 max-w-xs text-tenue">{texto}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

/** Totales por moneda, uno debajo del otro: pesos y dólares nunca se suman. */
export function Montos({ totales, className = "" }: { totales: Totales; className?: string }) {
  const con = MONEDAS.filter((m) => totales[m]);
  if (!con.length) return <span className={`cifra ${className}`}>$ 0</span>;
  return (
    <>
      {con.map((m) => (
        <span key={m} className={`cifra block ${className}`}>
          {plataCentavos(totales[m]!, m)}
        </span>
      ))}
    </>
  );
}

type Tono = "neutro" | "verde" | "ambar" | "rojo";
const TONOS: Record<Tono, { activo: string; numero: string }> = {
  neutro: { activo: "bg-marino text-white", numero: "text-marino" },
  verde: { activo: "bg-verde text-white", numero: "text-verde" },
  ambar: { activo: "bg-ambar text-white", numero: "text-ambar" },
  rojo: { activo: "bg-rojo text-white", numero: "text-rojo" },
};

/** Los tres indicadores de arriba (Por pagar / Pagado / Vencido). Tocarlos filtra la lista. */
export function Indicadores({
  items,
}: {
  items: { href: string; etiqueta: string; cantidad: number; totales: Totales; tono: Tono; activo: boolean }[];
}) {
  return (
    <nav aria-label="Filtrar por estado" className="mb-5 grid grid-cols-3 gap-2">
      {items.map((i) => (
        <Link
          key={i.etiqueta}
          href={i.href}
          aria-current={i.activo ? "true" : undefined}
          scroll={false}
          className={`flex min-h-[5.6rem] flex-col justify-between rounded-[18px] px-3 py-2.5 ${
            i.activo ? TONOS[i.tono].activo : "tarjeta"
          }`}
        >
          <span className={`text-[0.9rem] font-bold ${i.activo ? "" : "text-tenue"}`}>{i.etiqueta}</span>
          <span>
            <span className={`block text-[1.5rem] leading-none font-bold ${i.activo ? "" : TONOS[i.tono].numero}`}>
              {i.cantidad}
            </span>
            <span className={`mt-1 block text-[0.78rem] leading-tight ${i.activo ? "opacity-90" : "text-tenue"}`}>
              <Montos totales={i.totales} />
            </span>
          </span>
        </Link>
      ))}
    </nav>
  );
}

export function Pestanas({ items }: { items: { href: string; texto: string; activa: boolean }[] }) {
  return (
    <nav aria-label="Vista" className="mb-5 flex rounded-[16px] bg-hundido p-1">
      {items.map((i) => (
        <Link
          key={i.texto}
          href={i.href}
          aria-current={i.activa ? "page" : undefined}
          scroll={false}
          className={`flex min-h-11 flex-1 items-center justify-center rounded-[12px] font-bold ${
            i.activa ? "bg-tarjeta text-marino shadow-sm" : "text-tenue"
          }`}
        >
          {i.texto}
        </Link>
      ))}
    </nav>
  );
}

export function Seccion({ titulo, children, accion }: { titulo: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <section aria-label={titulo} className="mt-7">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 className="text-[1.15rem] font-bold text-marino">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

export function Barrita({ porcentaje, excedida }: { porcentaje: number; excedida?: boolean }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-hundido" aria-hidden>
      <div
        className={`h-full rounded-full ${excedida ? "bg-rojo" : porcentaje >= 85 ? "bg-ambar" : "bg-verde"}`}
        style={{ width: `${Math.min(Math.max(porcentaje, 0), 100)}%` }}
      />
    </div>
  );
}

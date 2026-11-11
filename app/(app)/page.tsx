import Link from "next/link";
import {
  CalendarDays, CreditCard, Landmark, Users, Home, HardHat, ChevronRight, TriangleAlert, CopyCheck,
} from "lucide-react";
import { exigirUsuario } from "@/lib/auth";
import { asegurarRecurrentes, datosHoy } from "@/lib/consultas";
import { enZona, fechaLarga, fechaRelativa, mesYAnio, saludo } from "@/lib/fechas";
import { plata, plataCentavos } from "@/lib/dinero";
import { Buscador, BotonPagar } from "@/components/Controles";
import { Montos } from "@/components/ui";

const plural = (n: number, uno: string, muchos: string) => `${n} ${n === 1 ? uno : muchos}`;

export default async function MiDia() {
  const u = await exigirUsuario();
  await asegurarRecurrentes(u.id);
  const d = await datosHoy(u);
  const av = u.prefs.avisos;
  const nombre = u.nombre.split(" ")[0];

  const proxima = d.reuniones.find((r) => r.inicio.getTime() + r.duracionMin * 60_000 > Date.now());
  const pagosPorPagar = d.pagosPersonales.length;
  const impuestosProximos = d.impuestos.length;

  const lineas = [
    d.reuniones.length && {
      href: "/agenda",
      texto: plural(d.reuniones.length, "reunión", "reuniones"),
      detalle: proxima ? `La próxima, ${enZona(proxima.inicio).hora} con ${proxima.persona ?? proxima.titulo}` : undefined,
    },
    d.tareas.length && { href: "/agenda", texto: plural(d.tareas.length, "tarea pendiente", "tareas pendientes") },
    pagosPorPagar && { href: "/pagos", texto: plural(pagosPorPagar, "pago pendiente", "pagos pendientes") },
    d.paraContactar.length && {
      href: "/clientes?ver=hoy",
      texto: plural(d.paraContactar.length, "cliente para contactar", "clientes para contactar"),
    },
    impuestosProximos && {
      href: "/impuestos",
      texto: plural(impuestosProximos, "vencimiento próximo", "vencimientos próximos"),
    },
  ].filter(Boolean) as { href: string; texto: string; detalle?: string }[];

  const vencidos = d.vencidos.filter((p) => (p.tipo === "impuesto" ? av.impuestos : av.pagos));
  const excedidas = av.obras ? d.obrasExcedidas : [];
  const duplicados = av.duplicados ? d.duplicados.slice(0, 3) : [];

  const tarjetas = [
    { href: "/agenda", texto: "Mi agenda", Icono: CalendarDays, estado: d.reuniones.length + d.tareas.length ? `${d.reuniones.length + d.tareas.length} para hoy` : "" },
    { href: "/pagos", texto: "Pagos", Icono: CreditCard, estado: pagosPorPagar ? `${pagosPorPagar} por pagar` : "" },
    { href: "/impuestos", texto: "Impuestos", Icono: Landmark, estado: impuestosProximos ? `${impuestosProximos} por vencer` : "" },
    { href: "/clientes", texto: "Clientes", Icono: Users, estado: d.paraContactar.length ? `${d.paraContactar.length} para contactar` : "" },
    { href: "/inmuebles", texto: "Inmuebles", Icono: Home, estado: "" },
    { href: "/obras", texto: "Obras", Icono: HardHat, estado: d.obras.filter((o) => o.estado === "activa").length ? `${d.obras.filter((o) => o.estado === "activa").length} en curso` : "" },
  ];

  return (
    <>
      <p className="text-tenue first-letter:uppercase">{fechaLarga(d.hoy)}</p>
      <h1 className="mt-0.5 mb-4 text-[2.1rem] leading-[1.1] font-bold text-marino">
        {saludo()}, {nombre}.
      </h1>

      <Buscador />

      <section aria-labelledby="hoy" className="mt-5 overflow-hidden rounded-[26px] bg-marino text-white">
        <h2 id="hoy" className="px-5 pt-4 text-[0.95rem] font-bold tracking-wide text-white/75">
          Hoy
        </h2>
        {lineas.length === 0 ? (
          <p className="px-5 pt-1 pb-5 text-[1.45rem] leading-snug font-bold">No tenés nada pendiente.</p>
        ) : (
          <ul className="pb-2">
            {lineas.map((l) => (
              <li key={l.texto} className="border-white/12 not-first:border-t">
                <Link href={l.href} className="flex min-h-[3.5rem] items-center justify-between gap-3 px-5 py-2.5 hover:bg-white/8">
                  <span>
                    <span className="block text-[1.4rem] leading-tight font-bold">{l.texto}</span>
                    {l.detalle && <span className="block text-[0.95rem] text-white/80">{l.detalle}</span>}
                  </span>
                  <ChevronRight aria-hidden size={22} className="shrink-0 text-white/60" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(vencidos.length > 0 || excedidas.length > 0 || duplicados.length > 0) && (
        <section aria-label="Para revisar" className="mt-3 space-y-2">
          {vencidos.slice(0, 4).map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-[18px] bg-rojo-claro py-2.5 pr-2.5 pl-4">
              <Link href={p.tipo === "impuesto" ? "/impuestos?ver=vencido" : "/pagos?ver=vencido"} className="min-w-0 flex-1">
                <span className="block truncate font-bold text-rojo">{p.concepto}</span>
                <span className="block text-[0.93rem] text-rojo">
                  Venció {fechaRelativa(p.vence, d.hoy).toLowerCase()} — <span className="cifra">{plata(p.importe, p.moneda)}</span>
                </span>
              </Link>
              <BotonPagar id={p.id} concepto={p.concepto} />
            </div>
          ))}
          {vencidos.length > 4 && (
            <Link href="/pagos?ver=vencido" className="block px-1 font-bold text-rojo underline">
              Ver los {vencidos.length} vencidos
            </Link>
          )}
          {excedidas.map((o) => (
            <Link key={o.id} href={`/obras/${o.id}`} className="flex items-center gap-3 rounded-[18px] bg-ambar-claro px-4 py-3 text-ambar">
              <TriangleAlert aria-hidden size={22} className="shrink-0" />
              <span>
                <span className="block font-bold">{o.nombre} pasó el presupuesto</span>
                <span className="block text-[0.93rem]">
                  <span className="cifra">{plataCentavos(-o.calc.disponible, o.moneda)}</span> de más
                </span>
              </span>
            </Link>
          ))}
          {duplicados.map(([a, b]) => (
            <Link key={a.id + b.id} href={a.donde} className="flex items-center gap-3 rounded-[18px] bg-ambar-claro px-4 py-3 text-ambar">
              <CopyCheck aria-hidden size={22} className="shrink-0" />
              <span>
                <span className="block font-bold">¿Está cargado dos veces?</span>
                <span className="block text-[0.93rem]">
                  {"concepto" in a ? String(a.concepto) : a.texto} — <span className="cifra">{plata(a.importe, a.moneda)}</span>
                </span>
              </span>
            </Link>
          ))}
        </section>
      )}

      <nav aria-label="Secciones" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tarjetas.map(({ href, texto, Icono, estado }) => (
          <Link
            key={href}
            href={href}
            className="tarjeta flex min-h-[7.4rem] flex-col justify-between p-4 hover:bg-hundido"
          >
            <Icono aria-hidden size={30} strokeWidth={1.7} className="text-marino" />
            <span>
              <span className="block text-[1.2rem] leading-tight font-bold text-marino">{texto}</span>
              {estado && <span className="mt-0.5 block text-[0.9rem] text-tenue">{estado}</span>}
            </span>
          </Link>
        ))}
      </nav>

      <section aria-labelledby="mes" className="tarjeta mt-5 p-4">
        <h2 id="mes" className="font-bold text-tenue">
          Pagado en {mesYAnio(d.hoy)}
        </h2>
        <div className="mt-2 grid grid-cols-2 gap-4">
          <Link href="/pagos?ver=pagado">
            <span className="block text-[0.9rem] text-tenue">Gastos e impuestos</span>
            <Montos totales={d.gastadoMes.personales} className="text-[1.35rem] font-bold text-marino" />
          </Link>
          <Link href="/obras">
            <span className="block text-[0.9rem] text-tenue">Obras</span>
            <Montos totales={d.gastadoMes.obras} className="text-[1.35rem] font-bold text-marino" />
          </Link>
        </div>
      </section>
    </>
  );
}

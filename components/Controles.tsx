"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Check, Download, FileSpreadsheet, FileText, Mic, Search, Sparkles, CalendarClock, Copy, Table,
} from "lucide-react";
import { Hoja } from "./Hoja";
import { useApp } from "./Proveedor";
import type { Forma } from "@/lib/entidades";
import { marcarPagado, completar, reprogramar, marcarGastoPagado } from "@/lib/acciones/datos";
import { hoy, sumarDias } from "@/lib/fechas";
import { hayDictado } from "@/lib/cliente";

export function BotonNuevo({
  forma,
  inicial,
  children,
  className = "boton",
}: {
  forma: Forma;
  inicial?: Record<string, string>;
  children: ReactNode;
  className?: string;
}) {
  const app = useApp();
  return (
    <button type="button" className={className} onClick={() => app.abrirFormulario(forma, { inicial })}>
      {children}
    </button>
  );
}

/** Zona tocable que abre el registro para editarlo. */
export function Editable({
  forma,
  id,
  children,
  className = "",
  etiqueta,
}: {
  forma: Forma;
  id: string;
  children: ReactNode;
  className?: string;
  etiqueta?: string;
}) {
  const app = useApp();
  return (
    <button
      type="button"
      aria-label={etiqueta}
      className={`text-left ${className}`}
      onClick={() => app.abrirFormulario(forma, { id })}
    >
      {children}
    </button>
  );
}

export function BotonPagar({ id, concepto }: { id: string; concepto: string }) {
  const app = useApp();
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      aria-label={`Marcar ${concepto} como pagado`}
      className="boton boton-verde boton-chico shrink-0"
      onClick={() =>
        iniciar(async () => {
          const r = await marcarPagado(id, true);
          if (r.ok) app.avisar(r.mensaje, { deshacer: () => marcarPagado(id, false) });
          else app.avisar(r.error ?? "No se pudo marcar.", { error: true });
        })
      }
    >
      <Check aria-hidden size={18} strokeWidth={2.6} /> Ya pagué
    </button>
  );
}

export function GastoPagado({ id, pagado, concepto }: { id: string; pagado: boolean; concepto: string }) {
  const app = useApp();
  const [pendiente, iniciar] = useTransition();
  if (pagado) return null;
  return (
    <button
      type="button"
      disabled={pendiente}
      aria-label={`Marcar ${concepto} como pagado`}
      className="boton boton-verde boton-chico shrink-0"
      onClick={() =>
        iniciar(async () => {
          const r = await marcarGastoPagado(id, true);
          if (r.ok) app.avisar(r.mensaje, { deshacer: () => marcarGastoPagado(id, false) });
          else app.avisar(r.error ?? "No se pudo marcar.", { error: true });
        })
      }
    >
      <Check aria-hidden size={18} strokeWidth={2.6} /> Ya pagué
    </button>
  );
}

export function CasillaTarea({ id, hecha, titulo }: { id: string; hecha: boolean; titulo: string }) {
  const app = useApp();
  const [pendiente, iniciar] = useTransition();
  const [marcada, setMarcada] = useState(hecha);
  return (
    <label className="grid size-11 shrink-0 cursor-pointer place-items-center">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={marcada}
        disabled={pendiente}
        aria-label={`${marcada ? "Desmarcar" : "Terminar"}: ${titulo}`}
        onChange={(e) => {
          const valor = e.target.checked;
          setMarcada(valor);
          iniciar(async () => {
            const r = await completar(id, valor);
            if (!r.ok) {
              setMarcada(!valor);
              app.avisar(r.error ?? "No se pudo guardar.", { error: true });
            } else if (valor) {
              app.avisar(r.mensaje, {
                deshacer: async () => {
                  setMarcada(false);
                  await completar(id, false);
                },
              });
            }
          });
        }}
      />
      <span
        aria-hidden
        className={`grid size-7 place-items-center rounded-full border-2 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-marino-2 ${
          marcada ? "border-verde bg-verde text-white" : "border-[#8b929c] bg-tarjeta text-transparent"
        }`}
      >
        <Check size={17} strokeWidth={3} />
      </span>
    </label>
  );
}

export function Reprogramar({ id, fecha, hora, titulo }: { id: string; fecha: string; hora: string | null; titulo: string }) {
  const app = useApp();
  const [abierta, setAbierta] = useState(false);
  const [nuevaFecha, setNuevaFecha] = useState(fecha);
  const [nuevaHora, setNuevaHora] = useState(hora ?? "");
  const [pendiente, iniciar] = useTransition();

  const mover = (f: string, h: string | null) =>
    iniciar(async () => {
      const r = await reprogramar(id, f, h);
      if (r.ok) {
        setAbierta(false);
        app.avisar(r.mensaje, { deshacer: () => reprogramar(id, fecha, hora) });
      } else app.avisar(r.error ?? "No se pudo reprogramar.", { error: true });
    });

  const base = fecha < hoy() ? hoy() : fecha;
  return (
    <>
      <button
        type="button"
        aria-label={`Reprogramar ${titulo}`}
        className="grid size-11 shrink-0 place-items-center rounded-xl text-marino hover:bg-hundido"
        onClick={() => setAbierta(true)}
      >
        <CalendarClock aria-hidden size={22} />
      </button>
      <Hoja abierta={abierta} alCerrar={() => setAbierta(false)} titulo="Pasar a otro día">
        <div className="grid grid-cols-3 gap-2">
          {[
            { t: "Mañana", f: sumarDias(hoy(), 1) },
            { t: "Un día después", f: sumarDias(base, 1) },
            { t: "Una semana después", f: sumarDias(base, 7) },
          ].map((o) => (
            <button key={o.t} type="button" disabled={pendiente} className="boton boton-suave px-2" onClick={() => mover(o.f, null)}>
              {o.t}
            </button>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`rf-${id}`} className="mb-1.5 block font-bold">Día</label>
            <input id={`rf-${id}`} type="date" className="campo" value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`rh-${id}`} className="mb-1.5 block font-bold">Hora</label>
            <input id={`rh-${id}`} type="time" className="campo" value={nuevaHora} onChange={(e) => setNuevaHora(e.target.value)} />
          </div>
        </div>
        <button type="button" disabled={pendiente || !nuevaFecha} className="boton mt-4 w-full" onClick={() => mover(nuevaFecha, nuevaHora || null)}>
          Guardar nuevo horario
        </button>
      </Hoja>
    </>
  );
}

const FORMATOS = {
  xlsx: { texto: "Excel", detalle: "Para abrir y trabajar los números", Icono: FileSpreadsheet },
  pdf: { texto: "PDF", detalle: "Para imprimir o mandar", Icono: FileText },
  csv: { texto: "CSV", detalle: "Para importar en otro sistema", Icono: Table },
  ics: { texto: "Calendario", detalle: "Para Google Calendar o el iPhone", Icono: CalendarClock },
} as const;

export function Descargar({
  tipo,
  parametros = "",
  formatos = ["xlsx", "pdf", "csv"],
  children = "Descargar informe",
  className = "boton boton-suave",
}: {
  tipo: string;
  parametros?: string;
  formatos?: (keyof typeof FORMATOS)[];
  children?: ReactNode;
  className?: string;
}) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setAbierta(true)}>
        <Download aria-hidden size={20} /> {children}
      </button>
      <Hoja abierta={abierta} alCerrar={() => setAbierta(false)} titulo="¿En qué formato?">
        <div className="space-y-2.5">
          {formatos.map((f) => {
            const { texto, detalle, Icono } = FORMATOS[f];
            return (
              <a
                key={f}
                href={`/api/exportar/${tipo}?formato=${f}${parametros}`}
                download
                onClick={() => setTimeout(() => setAbierta(false), 300)}
                className="tarjeta flex min-h-[4.2rem] items-center gap-3.5 rounded-[16px] px-4 py-2.5 hover:bg-hundido"
              >
                <Icono aria-hidden size={26} className="shrink-0 text-marino" strokeWidth={1.8} />
                <span>
                  <span className="block text-[1.05rem] font-bold text-marino">{texto}</span>
                  <span className="block text-[0.92rem] text-tenue">{detalle}</span>
                </span>
              </a>
            );
          })}
        </div>
      </Hoja>
    </>
  );
}

export function Buscador({ inicial = "" }: { inicial?: string }) {
  const app = useApp();
  const router = useRouter();
  const [q, setQ] = useState(inicial);
  const [conVoz, setConVoz] = useState(false);
  useEffect(() => setConVoz(hayDictado()), []);
  return (
    <form
      role="search"
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/buscar?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <div className="relative flex-1">
        <Search aria-hidden size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-tenue" />
        <label htmlFor="buscar" className="sr-only">Buscar</label>
        <input
          id="buscar"
          type="search"
          enterKeyHint="search"
          className="campo pl-11"
          placeholder="Buscar"
          autoComplete="off"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <button
        type="button"
        aria-label={conVoz ? "Pedir por voz" : "Abrir el asistente"}
        className="grid size-[3.1rem] shrink-0 place-items-center rounded-[14px] bg-marino text-white hover:bg-marino-2"
        onClick={() => app.abrirAsistente(undefined, true)}
      >
        {conVoz ? <Mic aria-hidden size={22} /> : <Sparkles aria-hidden size={22} />}
      </button>
    </form>
  );
}

export function BotonAsistente({
  pedido,
  children,
  className = "boton boton-suave",
}: {
  pedido?: string;
  children: ReactNode;
  className?: string;
}) {
  const app = useApp();
  return (
    <button type="button" className={className} onClick={() => app.abrirAsistente(pedido)}>
      {children}
    </button>
  );
}

export function Copiar({ texto, children = "Copiar" }: { texto: string; children?: ReactNode }) {
  const app = useApp();
  return (
    <button
      type="button"
      className="boton boton-suave boton-chico"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          app.avisar("Copiado");
        } catch {
          app.avisar("No se pudo copiar. Mantené apretado el texto para copiarlo.", { error: true });
        }
      }}
    >
      <Copy aria-hidden size={18} /> {children}
    </button>
  );
}

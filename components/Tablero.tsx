"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { useApp } from "./Proveedor";
import { moverCliente } from "@/lib/acciones/datos";
import { ESTADOS_CLIENTE } from "@/lib/entidades";

export type TarjetaCliente = {
  id: string;
  nombre: string;
  interes: string | null;
  estado: string;
  whatsapp: string | null;
  seguimiento: string | null; // texto listo para mostrar
  toca: boolean; // hay que contactarlo hoy o antes
};

/** Etapas en columnas. Las tarjetas se mueven arrastrando (computadora) o con el selector (celular). */
export function Tablero({ clientes }: { clientes: TarjetaCliente[] }) {
  const app = useApp();
  const [, iniciar] = useTransition();
  // Cambios aplicados al instante, antes de que responda el servidor.
  const [movidos, setMovidos] = useState<Record<string, string>>({});
  const [sobre, setSobre] = useState<string | null>(null);

  const estadoDe = (c: TarjetaCliente) => movidos[c.id] ?? c.estado;

  const mover = (c: TarjetaCliente, destino: string) => {
    const origen = estadoDe(c);
    if (origen === destino) return;
    setMovidos((m) => ({ ...m, [c.id]: destino }));
    iniciar(async () => {
      const r = await moverCliente(c.id, destino);
      if (!r.ok) {
        setMovidos((m) => ({ ...m, [c.id]: origen }));
        app.avisar(r.error ?? "No se pudo mover.", { error: true });
        return;
      }
      app.avisar(`${c.nombre}: ${r.mensaje.toLowerCase()}`, {
        deshacer: async () => {
          setMovidos((m) => ({ ...m, [c.id]: origen }));
          await moverCliente(c.id, origen);
        },
      });
    });
  };

  return (
    <div className="relative -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:snap-none">
      {ESTADOS_CLIENTE.map((etapa) => {
        const lista = clientes.filter((c) => estadoDe(c) === etapa.valor);
        return (
          <section
            key={etapa.valor}
            aria-label={`${etapa.etiqueta}: ${lista.length}`}
            onDragOver={(e) => {
              e.preventDefault();
              setSobre(etapa.valor);
            }}
            onDragLeave={() => setSobre((s) => (s === etapa.valor ? null : s))}
            onDrop={(e) => {
              e.preventDefault();
              setSobre(null);
              const c = clientes.find((x) => x.id === e.dataTransfer.getData("text/plain"));
              if (c) mover(c, etapa.valor);
            }}
            className={`w-[78%] shrink-0 snap-center rounded-[20px] p-2.5 sm:w-64 ${
              sobre === etapa.valor ? "bg-marino-claro" : "bg-hundido"
            }`}
          >
            <h2 className="flex items-center justify-between px-1.5 pt-1 pb-2.5 font-bold text-marino">
              {etapa.etiqueta}
              <span className="chip bg-tarjeta">{lista.length}</span>
            </h2>
            {lista.length === 0 ? (
              <p className="px-1.5 pb-3 text-[0.93rem] text-tenue">Nadie en esta etapa.</p>
            ) : (
              <ul className="space-y-2.5">
                {lista.map((c) => (
                  <li
                    key={c.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", c.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    className="tarjeta relative rounded-[16px] p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/clientes/${c.id}`} className="min-w-0 flex-1 py-0.5">
                        <span className="block truncate text-[1.05rem] font-bold text-marino underline-offset-2 hover:underline">
                          {c.nombre}
                        </span>
                        {c.interes && <span className="line-clamp-2 block text-[0.93rem] text-tenue">{c.interes}</span>}
                      </Link>
                      {c.whatsapp && (
                        <a
                          href={`https://wa.me/${c.whatsapp}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`WhatsApp a ${c.nombre}`}
                          className="grid size-11 shrink-0 place-items-center rounded-full bg-verde text-white hover:bg-[#145535]"
                        >
                          <MessageCircle aria-hidden size={21} />
                        </a>
                      )}
                    </div>
                    {c.seguimiento && (
                      <p className={`chip mt-2 ${c.toca ? "chip-rojo" : ""}`}>{c.seguimiento}</p>
                    )}
                    <label className="mt-2.5 block">
                      <span className="sr-only">Etapa de {c.nombre}</span>
                      <select
                        className="campo min-h-11 py-1.5 text-[0.95rem]"
                        value={estadoDe(c)}
                        onChange={(e) => mover(c, e.target.value)}
                      >
                        {ESTADOS_CLIENTE.map((o) => (
                          <option key={o.valor} value={o.valor}>
                            {o.valor === estadoDe(c) ? o.etiqueta : `Pasar a ${o.etiqueta}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

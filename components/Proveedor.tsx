"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  Plus, Receipt, ListChecks, CalendarPlus, UserPlus, Home, HardHat, Undo2, Check, CircleAlert,
} from "lucide-react";
import { Hoja } from "./Hoja";
import { Formulario } from "./Formulario";
import { Asistente } from "./Asistente";
import type { Forma } from "@/lib/entidades";
import type { OpcionesFormularios } from "@/lib/consultas";

type Aviso = { texto: string; deshacer?: () => void | Promise<unknown>; error?: boolean };
type PedidoFormulario = { forma: Forma; id?: string; inicial?: Record<string, string> };

type Contexto = {
  abrirFormulario: (forma: Forma, opciones?: { id?: string; inicial?: Record<string, string> }) => void;
  avisar: (texto: string, opciones?: { deshacer?: Aviso["deshacer"]; error?: boolean }) => void;
  confirmar: (pregunta: string, textoBoton?: string) => Promise<boolean>;
  abrirAsistente: (pedido?: string, dictar?: boolean) => void;
  opciones: OpcionesFormularios;
  iaActiva: boolean;
};

const Ctx = createContext<Contexto | null>(null);

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp se usa dentro de <Proveedor>");
  return c;
}

const AGREGAR: { forma: Forma; etiqueta: string; Icono: typeof Plus }[] = [
  { forma: "pago", etiqueta: "Gasto", Icono: Receipt },
  { forma: "tarea", etiqueta: "Tarea", Icono: ListChecks },
  { forma: "reunion", etiqueta: "Reunión", Icono: CalendarPlus },
  { forma: "cliente", etiqueta: "Cliente", Icono: UserPlus },
  { forma: "inmueble", etiqueta: "Inmueble", Icono: Home },
  { forma: "gastoObra", etiqueta: "Gasto de obra", Icono: HardHat },
];

export function Proveedor({
  children,
  opciones,
  iaActiva,
}: {
  children: ReactNode;
  opciones: OpcionesFormularios;
  iaActiva: boolean;
}) {
  const ruta = usePathname();
  const [menu, setMenu] = useState(false);
  const [formulario, setFormulario] = useState<PedidoFormulario | null>(null);
  const [aviso, setAviso] = useState<(Aviso & { n: number }) | null>(null);
  const [pregunta, setPregunta] = useState<{ texto: string; boton: string } | null>(null);
  const [asistente, setAsistente] = useState<{ pedido?: string; dictar?: boolean; n: number } | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const contador = useRef(0);

  const avisar = useCallback<Contexto["avisar"]>((texto, o) => {
    setAviso({ texto, deshacer: o?.deshacer, error: o?.error, n: ++contador.current });
  }, []);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), aviso.deshacer ? 8000 : 4500);
    return () => clearTimeout(t);
  }, [aviso]);

  const confirmar = useCallback<Contexto["confirmar"]>((texto, boton = "Sí, borrar") => {
    setPregunta({ texto, boton });
    return new Promise<boolean>((res) => {
      resolver.current = res;
    });
  }, []);

  const responder = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setPregunta(null);
  };

  const abrirFormulario = useCallback<Contexto["abrirFormulario"]>((forma, o) => {
    setMenu(false);
    setFormulario({ forma, id: o?.id, inicial: o?.inicial });
  }, []);

  const abrirAsistente = useCallback<Contexto["abrirAsistente"]>((pedido, dictar) => {
    setAsistente({ pedido, dictar, n: ++contador.current });
  }, []);

  const valor = useMemo(
    () => ({ abrirFormulario, avisar, confirmar, abrirAsistente, opciones, iaActiva }),
    [abrirFormulario, avisar, confirmar, abrirAsistente, opciones, iaActiva],
  );

  // Desde la pantalla de una obra, "Gasto de obra" ya viene con esa obra elegida.
  const obraActual = /^\/obras\/([0-9a-f-]{36})$/.exec(ruta)?.[1];
  const clienteActual = /^\/clientes\/([0-9a-f-]{36})$/.exec(ruta)?.[1];
  const inicialSegunPantalla = (forma: Forma): Record<string, string> | undefined => {
    if (forma === "gastoObra" && obraActual) return { obraId: obraActual };
    if ((forma === "reunion" || forma === "tarea") && clienteActual) return { clienteId: clienteActual };
    return undefined;
  };

  return (
    <Ctx.Provider value={valor}>
      {children}

      <button
        type="button"
        onClick={() => setMenu(true)}
        className="boton fixed right-4 bottom-[max(1.1rem,env(safe-area-inset-bottom))] z-30 min-h-[3.6rem] rounded-full px-6 text-[1.08rem] shadow-[0_10px_28px_-6px_rgb(20_39_74/0.55)]"
      >
        <Plus aria-hidden size={24} strokeWidth={2.6} />
        Agregar
      </button>

      <Hoja abierta={menu} alCerrar={() => setMenu(false)} titulo="¿Qué querés agregar?">
        <div className="grid grid-cols-2 gap-3">
          {AGREGAR.map(({ forma, etiqueta, Icono }) => (
            <button
              key={forma}
              type="button"
              onClick={() => abrirFormulario(forma, { inicial: inicialSegunPantalla(forma) })}
              className="tarjeta flex min-h-[6.2rem] flex-col items-start justify-between gap-2 p-4 text-left text-[1.08rem] font-bold text-marino hover:bg-hundido"
            >
              <Icono aria-hidden size={28} strokeWidth={1.9} />
              {etiqueta}
            </button>
          ))}
        </div>
      </Hoja>

      {formulario && (
        <Formulario
          key={`${formulario.forma}-${formulario.id ?? "nuevo"}`}
          {...formulario}
          alCerrar={() => setFormulario(null)}
        />
      )}

      <Hoja abierta={pregunta !== null} alCerrar={() => responder(false)} titulo="Confirmar">
        <p className="text-[1.08rem]">{pregunta?.texto}</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" className="boton boton-suave" onClick={() => responder(false)}>
            Cancelar
          </button>
          <button type="button" className="boton boton-rojo" onClick={() => responder(true)}>
            {pregunta?.boton}
          </button>
        </div>
      </Hoja>

      {asistente && (
        <Asistente
          key={asistente.n}
          pedidoInicial={asistente.pedido}
          dictarAlAbrir={asistente.dictar}
          alCerrar={() => setAsistente(null)}
        />
      )}

      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(max(1.1rem,env(safe-area-inset-bottom))+4.6rem)] z-[60] flex justify-center px-4"
      >
        {aviso && (
          <div
            key={aviso.n}
            className={`pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl py-2.5 pr-2.5 pl-4 text-white shadow-xl ${aviso.error ? "bg-rojo" : "bg-tinta"}`}
          >
            {aviso.error ? <CircleAlert aria-hidden size={20} /> : <Check aria-hidden size={20} />}
            <span className="py-1.5 font-semibold">{aviso.texto}</span>
            {aviso.deshacer && (
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-white/15 px-3.5 font-bold hover:bg-white/25"
                onClick={async () => {
                  const d = aviso.deshacer!;
                  setAviso(null);
                  await d();
                }}
              >
                <Undo2 aria-hidden size={18} /> Deshacer
              </button>
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

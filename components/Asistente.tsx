"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Mic, SendHorizontal, Square, Check } from "lucide-react";
import { Hoja } from "./Hoja";
import { useApp } from "./Proveedor";
import { preguntar, type RespuestaAsistente } from "@/lib/acciones/asistente";
import { guardar } from "@/lib/acciones/datos";
import { crearDictado, hayDictado } from "@/lib/cliente";

type Mensaje =
  | { de: "yo"; texto: string }
  | { de: "app"; r: RespuestaAsistente; estado?: "guardado" | "cancelado"; conflicto?: string };

const SUGERENCIAS = [
  "¿Qué tengo pendiente hoy?",
  "¿Cuánto gasté este mes?",
  "¿Qué impuestos vencen esta semana?",
  "Clientes para contactar",
];

export function Asistente({
  pedidoInicial,
  dictarAlAbrir,
  alCerrar,
}: {
  pedidoInicial?: string;
  dictarAlAbrir?: boolean;
  alCerrar: () => void;
}) {
  const app = useApp();
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [conVoz, setConVoz] = useState(false);
  const [errorVoz, setErrorVoz] = useState("");
  // Si el asistente pidió un dato que faltaba, la respuesta se suma al pedido original.
  const pendiente = useRef("");
  const dictado = useRef<ReturnType<typeof crearDictado>>(null);
  const fin = useRef<HTMLDivElement>(null);
  const arranco = useRef(false);

  async function enviar(crudo: string) {
    const pedido = crudo.trim();
    if (!pedido || pensando) return;
    setTexto("");
    setMensajes((m) => [...m, { de: "yo", texto: pedido }]);
    setPensando(true);
    try {
      const completo = pendiente.current ? `${pendiente.current} ${pedido}` : pedido;
      const r = await preguntar(completo);
      pendiente.current = r.faltan ? completo : "";
      setMensajes((m) => [...m, { de: "app", r }]);
    } catch {
      setMensajes((m) => [...m, { de: "app", r: { texto: "No pude responder. Revisá tu conexión y probá de nuevo." } }]);
    } finally {
      setPensando(false);
    }
  }

  function dictar() {
    if (escuchando) {
      dictado.current?.stop();
      return;
    }
    const d = crearDictado();
    if (!d) return;
    dictado.current = d;
    setErrorVoz("");
    d.onresult = (e) => {
      const dicho = e.results[0]?.[0]?.transcript ?? "";
      if (dicho) enviar(dicho);
    };
    d.onerror = (e) => {
      setErrorVoz(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Para dictar, permití el uso del micrófono en el navegador."
          : e.error === "no-speech"
            ? "No escuché nada. Tocá el micrófono y hablá."
            : "No se pudo usar el micrófono. Escribí el pedido.",
      );
    };
    d.onend = () => setEscuchando(false);
    try {
      d.start();
      setEscuchando(true);
    } catch {
      setEscuchando(false);
    }
  }

  useEffect(() => {
    setConVoz(hayDictado());
    if (arranco.current) return;
    arranco.current = true;
    if (pedidoInicial) enviar(pedidoInicial);
    else if (dictarAlAbrir && hayDictado()) dictar();
    return () => dictado.current?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" });
  }, [mensajes, pensando]);

  async function confirmar(i: number, forzar = false) {
    const m = mensajes[i];
    if (m.de !== "app" || !m.r.propuesta) return;
    const r = await guardar(m.r.propuesta.forma, m.r.propuesta.datos, null, { forzar });
    setMensajes((lista) =>
      lista.map((x, j) =>
        j !== i || x.de !== "app"
          ? x
          : r.ok
            ? { ...x, estado: "guardado", conflicto: undefined }
            : { ...x, conflicto: r.conflicto ?? r.error ?? "No se pudo guardar. Tocá Corregir para revisar los datos." },
      ),
    );
  }

  const marcar = (i: number, estado: "cancelado") =>
    setMensajes((lista) => lista.map((x, j) => (j === i && x.de === "app" ? { ...x, estado } : x)));

  return (
    <Hoja
      abierta
      alCerrar={alCerrar}
      titulo="Asistente"
      pie={
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            enviar(texto);
          }}
        >
          <label htmlFor="pedido" className="sr-only">Tu pedido</label>
          <input
            id="pedido"
            className="campo"
            placeholder={escuchando ? "Te escucho…" : "Escribí tu pedido"}
            autoComplete="off"
            enterKeyHint="send"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          {conVoz && (
            <button
              type="button"
              onClick={dictar}
              aria-label={escuchando ? "Dejar de escuchar" : "Dictar"}
              aria-pressed={escuchando}
              className={`grid size-[3.1rem] shrink-0 place-items-center rounded-[14px] ${escuchando ? "bg-rojo text-white" : "bg-hundido text-marino hover:bg-linea"}`}
            >
              {escuchando ? <Square aria-hidden size={20} /> : <Mic aria-hidden size={22} />}
            </button>
          )}
          <button
            type="submit"
            disabled={!texto.trim() || pensando}
            aria-label="Enviar"
            className="boton size-[3.1rem] shrink-0 p-0"
          >
            <SendHorizontal aria-hidden size={21} />
          </button>
        </form>
      }
    >
      <div className="space-y-3" aria-live="polite">
        {mensajes.length === 0 && !pensando && (
          <div>
            <p className="text-tenue">Pedime lo que necesites, escribiendo o con el micrófono.</p>
            <div className="mt-3 flex flex-col items-start gap-2">
              {SUGERENCIAS.map((s) => (
                <button key={s} type="button" className="boton boton-suave boton-chico text-left" onClick={() => enviar(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {mensajes.map((m, i) =>
          m.de === "yo" ? (
            <p key={i} className="ml-auto w-fit max-w-[85%] rounded-[18px] rounded-br-md bg-marino px-4 py-2.5 text-white">
              {m.texto}
            </p>
          ) : (
            <div key={i} className="tarjeta max-w-[94%] rounded-[18px] rounded-bl-md px-4 py-3">
              <p className="font-semibold">{m.r.texto}</p>
              {m.r.lineas && m.r.lineas.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {m.r.lineas.map((l, j) => (
                    <li key={j} className="border-l-[3px] border-linea pl-2.5">{l}</li>
                  ))}
                </ul>
              )}
              {m.r.propuesta && (
                <div className="mt-3">
                  <ul className="space-y-1 rounded-[14px] bg-hundido px-3.5 py-3">
                    {m.r.propuesta.resumen.map((l, j) => (
                      <li key={j}>{l}</li>
                    ))}
                  </ul>
                  {m.conflicto && m.estado !== "guardado" && (
                    <div role="alert" className="mt-2.5 rounded-[14px] bg-ambar-claro px-3.5 py-2.5 text-ambar">
                      <p className="font-semibold">{m.conflicto}</p>
                      {m.r.propuesta.forma === "reunion" && (
                        <button type="button" className="boton boton-chico mt-2" onClick={() => confirmar(i, true)}>
                          Guardar igual
                        </button>
                      )}
                    </div>
                  )}
                  {m.estado === "guardado" ? (
                    <p className="mt-2.5 flex items-center gap-1.5 font-bold text-verde">
                      <Check aria-hidden size={20} /> Guardado
                    </p>
                  ) : m.estado === "cancelado" ? (
                    <p className="mt-2.5 text-tenue">Cancelado. No se guardó nada.</p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="boton boton-verde boton-chico" onClick={() => confirmar(i)}>
                        Confirmar
                      </button>
                      <button
                        type="button"
                        className="boton boton-suave boton-chico"
                        onClick={() => {
                          const p = m.r.propuesta!;
                          alCerrar();
                          app.abrirFormulario(p.forma, { inicial: p.datos });
                        }}
                      >
                        Corregir
                      </button>
                      <button type="button" className="boton boton-suave boton-chico" onClick={() => marcar(i, "cancelado")}>
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              )}
              {m.r.enlaces && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.r.enlaces.map((e) =>
                    e.href.startsWith("/api/") ? (
                      <a key={e.href} href={e.href} className="boton boton-suave boton-chico">{e.texto}</a>
                    ) : (
                      <Link key={e.href} href={e.href} onClick={alCerrar} className="boton boton-suave boton-chico">
                        {e.texto}
                      </Link>
                    ),
                  )}
                </div>
              )}
            </div>
          ),
        )}

        {pensando && <p className="text-tenue">Buscando…</p>}
        {errorVoz && <p role="alert" className="font-semibold text-rojo">{errorVoz}</p>}
        <div ref={fin} />
      </div>
    </Hoja>
  );
}

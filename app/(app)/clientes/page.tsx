import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { MessageCircle, Plus, Users, PhoneCall } from "lucide-react";
import { db, clientes } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth";
import { numeroWhatsApp } from "@/lib/entidades";
import { fechaRelativa, hoy as fechaHoy } from "@/lib/fechas";
import { normalizar } from "@/lib/calculos";
import { Titulo, Vacio } from "@/components/ui";
import { BotonNuevo, Descargar } from "@/components/Controles";
import { Tablero, type TarjetaCliente } from "@/components/Tablero";
import { Contacte } from "@/components/Fichas";

export const metadata: Metadata = { title: "Clientes" };

export default async function Clientes({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string }> }) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  const hoy = fechaHoy();
  const q = normalizar(sp.q ?? "");

  const todos = await db
    .select()
    .from(clientes)
    .where(and(eq(clientes.usuarioId, u.id), isNull(clientes.borradoEl)))
    .orderBy(asc(clientes.proximoSeguimiento), asc(clientes.nombre));

  const toca = (c: (typeof todos)[number]) =>
    c.estado !== "cerrado" && c.proximoSeguimiento !== null && c.proximoSeguimiento <= hoy;
  const paraHoy = todos.filter(toca);
  const soloHoy = sp.ver === "hoy";
  const filtrados = q
    ? todos.filter((c) => normalizar(`${c.nombre} ${c.interes ?? ""} ${c.notas ?? ""}`).includes(q))
    : todos;

  const tarjetas: TarjetaCliente[] = filtrados.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    interes: c.interes,
    estado: c.estado,
    whatsapp: numeroWhatsApp(c.whatsapp ?? c.telefono),
    seguimiento: c.proximoSeguimiento && c.estado !== "cerrado" ? `Contactar: ${fechaRelativa(c.proximoSeguimiento, hoy).toLowerCase()}` : null,
    toca: toca(c),
  }));

  return (
    <>
      <Titulo>Clientes</Titulo>
      {todos.length === 0 ? (
        <Vacio Icono={Users} titulo="Todavía no cargaste clientes" texto="Anotá cada interesado y cuándo volver a hablarle, así ninguno se pierde.">
          <BotonNuevo forma="cliente">
            <Plus aria-hidden size={21} /> Nuevo cliente
          </BotonNuevo>
        </Vacio>
      ) : (
        <>
          <Link
            href={soloHoy ? "/clientes" : "/clientes?ver=hoy"}
            className={`boton mb-4 w-full ${soloHoy ? "" : paraHoy.length ? "boton-rojo" : "boton-suave"}`}
          >
            <PhoneCall aria-hidden size={20} />
            {soloHoy ? "Ver todos los clientes" : paraHoy.length ? `Clientes para contactar hoy (${paraHoy.length})` : "Clientes para contactar hoy: ninguno"}
          </Link>

          {soloHoy ? (
            paraHoy.length === 0 ? (
              <p className="tarjeta px-4 py-6 text-center text-tenue">Hoy no tenés a nadie para contactar.</p>
            ) : (
              <ul className="space-y-3">
                {paraHoy.map((c) => {
                  const wa = numeroWhatsApp(c.whatsapp ?? c.telefono);
                  return (
                    <li key={c.id} className="tarjeta p-4">
                      <Link href={`/clientes/${c.id}`} className="block">
                        <span className="block text-[1.2rem] font-bold text-marino underline-offset-2 hover:underline">{c.nombre}</span>
                        {c.interes && <span className="block text-tenue">{c.interes}</span>}
                        <span className="chip chip-rojo mt-1.5">Contactar: {fechaRelativa(c.proximoSeguimiento!, hoy).toLowerCase()}</span>
                      </Link>
                      <div className="mt-3 grid grid-cols-2 gap-2.5">
                        {wa ? (
                          <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="boton boton-verde">
                            <MessageCircle aria-hidden size={20} /> WhatsApp
                          </a>
                        ) : (
                          <Link href={`/clientes/${c.id}`} className="boton boton-suave">Ver ficha</Link>
                        )}
                        <Contacte id={c.id} nombre={c.nombre} className="boton boton-suave" />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )
          ) : (
            <>
              <form role="search" className="mb-4">
                <label htmlFor="q" className="sr-only">Filtrar por nombre o interés</label>
                <input id="q" name="q" type="search" defaultValue={sp.q ?? ""} className="campo" placeholder="Filtrar por nombre o por lo que buscan" autoComplete="off" />
              </form>
              {q && (
                <p className="mb-3 text-tenue">
                  {filtrados.length} de {todos.length} —{" "}
                  <Link href="/clientes" className="font-bold text-marino underline">Quitar filtro</Link>
                </p>
              )}
              <Tablero clientes={tarjetas} />
            </>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <BotonNuevo forma="cliente" className="boton boton-suave">
              <Plus aria-hidden size={20} /> Nuevo cliente
            </BotonNuevo>
            <Descargar tipo="clientes" />
          </div>
        </>
      )}
    </>
  );
}

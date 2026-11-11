import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { CalendarPlus, Mail, MessageCircle, Pencil, Phone } from "lucide-react";
import { db, clientes, inmuebles, intereses, eventos, visitas, archivos } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth";
import { esId, etiquetaDe, ESTADOS_CLIENTE, numeroWhatsApp } from "@/lib/entidades";
import { enZona, fechaCorta, fechaRelativa, hoy as fechaHoy } from "@/lib/fechas";
import { plata } from "@/lib/dinero";
import { Seccion } from "@/components/ui";
import { BotonNuevo, Editable } from "@/components/Controles";
import { Contacte, Vinculos, Documentos, BotonVisita, BorrarVisita } from "@/components/Fichas";

export const metadata: Metadata = { title: "Cliente" };

export default async function Cliente({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirUsuario();
  const { id } = await params;
  if (!esId(id)) notFound();
  const [c] = await db
    .select()
    .from(clientes)
    .where(and(eq(clientes.id, id), eq(clientes.usuarioId, u.id), isNull(clientes.borradoEl)))
    .limit(1);
  if (!c) notFound();
  const hoy = fechaHoy();

  const [vinculados, todosInmuebles, agenda, historial, docs] = await Promise.all([
    db
      .select({ id: inmuebles.id, nombre: inmuebles.nombre, detalle: inmuebles.direccion })
      .from(intereses)
      .innerJoin(inmuebles, eq(intereses.inmuebleId, inmuebles.id))
      .where(and(eq(intereses.clienteId, id), isNull(inmuebles.borradoEl)))
      .orderBy(asc(inmuebles.nombre)),
    db
      .select({ id: inmuebles.id, nombre: inmuebles.nombre })
      .from(inmuebles)
      .where(and(eq(inmuebles.usuarioId, u.id), isNull(inmuebles.borradoEl)))
      .orderBy(asc(inmuebles.nombre)),
    db
      .select()
      .from(eventos)
      .where(and(eq(eventos.clienteId, id), eq(eventos.usuarioId, u.id), isNull(eventos.borradoEl)))
      .orderBy(desc(eventos.inicio))
      .limit(30),
    db
      .select({ v: visitas, inmueble: inmuebles.nombre })
      .from(visitas)
      .innerJoin(inmuebles, eq(visitas.inmuebleId, inmuebles.id))
      .where(and(eq(visitas.clienteId, id), eq(visitas.usuarioId, u.id), isNull(visitas.borradoEl)))
      .orderBy(desc(visitas.fecha))
      .limit(50),
    db
      .select({ id: archivos.id, nombre: archivos.nombre, mime: archivos.mime })
      .from(archivos)
      .where(and(eq(archivos.usuarioId, u.id), eq(archivos.entidad, "cliente"), eq(archivos.entidadId, id)))
      .orderBy(desc(archivos.creadoEl)),
  ]);

  const telefono = c.whatsapp ?? c.telefono;
  const wa = numeroWhatsApp(telefono);
  const toca = c.estado !== "cerrado" && c.proximoSeguimiento && c.proximoSeguimiento <= hoy;

  const datos = [
    ["Qué busca", c.interes],
    ["Presupuesto", c.presupuesto ? plata(c.presupuesto, c.presupuestoMoneda) : null],
    ["Teléfono", c.telefono],
    ["Email", c.email],
    ["Última conversación", c.ultimaConversacion ? fechaRelativa(c.ultimaConversacion, hoy) : "Todavía no hablaron"],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.9rem] leading-tight font-bold text-marino">{c.nombre}</h1>
          <p className="mt-1.5 flex flex-wrap gap-2">
            <span className="chip chip-marino">{etiquetaDe(ESTADOS_CLIENTE, c.estado)}</span>
            {c.proximoSeguimiento && c.estado !== "cerrado" && (
              <span className={`chip ${toca ? "chip-rojo" : ""}`}>
                Contactar: {fechaRelativa(c.proximoSeguimiento, hoy).toLowerCase()}
              </span>
            )}
          </p>
        </div>
        <Editable forma="cliente" id={c.id} className="boton boton-suave boton-chico shrink-0" etiqueta="Editar cliente">
          <Pencil aria-hidden size={18} /> Editar
        </Editable>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {wa && (
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="boton boton-verde">
            <MessageCircle aria-hidden size={20} /> WhatsApp
          </a>
        )}
        <Contacte id={c.id} nombre={c.nombre} className={wa ? "boton" : "boton col-span-2"} />
        {c.telefono && (
          <a href={`tel:${c.telefono.replace(/[^\d+]/g, "")}`} className="boton boton-suave">
            <Phone aria-hidden size={19} /> Llamar
          </a>
        )}
        {c.email && (
          <a href={`mailto:${c.email}`} className="boton boton-suave">
            <Mail aria-hidden size={19} /> Email
          </a>
        )}
      </div>

      <dl className="tarjeta mt-4 divide-y divide-linea">
        {datos.map(([t, v]) => (
          <div key={t} className="px-4 py-3">
            <dt className="text-[0.88rem] text-tenue">{t}</dt>
            <dd className="font-semibold break-words">{v}</dd>
          </div>
        ))}
      </dl>

      {c.notas && (
        <Seccion titulo="Notas">
          <p className="tarjeta p-4 whitespace-pre-wrap">{c.notas}</p>
        </Seccion>
      )}

      <Seccion titulo="Inmuebles que le interesan">
        <Vinculos lado="cliente" propioId={c.id} vinculados={vinculados} disponibles={todosInmuebles} />
      </Seccion>

      <Seccion
        titulo="Reuniones y tareas"
        accion={
          <BotonNuevo forma="reunion" inicial={{ clienteId: c.id, persona: c.nombre }} className="boton boton-suave boton-chico">
            <CalendarPlus aria-hidden size={18} /> Reunión
          </BotonNuevo>
        }
      >
        {agenda.length === 0 ? (
          <p className="tarjeta px-4 py-4 text-tenue">Sin reuniones ni tareas con este cliente.</p>
        ) : (
          <ul className="tarjeta divide-y divide-linea overflow-hidden">
            {agenda.map((e) => {
              const z = enZona(e.inicio);
              return (
                <li key={e.id}>
                  <Editable forma={e.tipo as "reunion" | "tarea" | "recordatorio"} id={e.id} className="block w-full px-4 py-3">
                    <span className="block font-bold">{e.tipo === "reunion" ? e.titulo || "Reunión" : e.titulo}</span>
                    <span className="block text-[0.93rem] text-tenue">
                      {fechaCorta(z.fecha)}
                      {e.sinHora ? "" : `, ${z.hora}`}
                      {e.lugar ? ` — ${e.lugar}` : ""}
                      {e.tipo !== "reunion" ? (e.completadoEl ? " — Hecha" : " — Pendiente") : ""}
                    </span>
                  </Editable>
                </li>
              );
            })}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Visitas y consultas" accion={todosInmuebles.length > 0 ? <BotonVisita clienteId={c.id} /> : undefined}>
        {historial.length === 0 ? (
          <p className="tarjeta px-4 py-4 text-tenue">Todavía no visitó ni consultó por ningún inmueble.</p>
        ) : (
          <ul className="tarjeta divide-y divide-linea overflow-hidden">
            {historial.map(({ v, inmueble }) => (
              <li key={v.id} className="flex items-center gap-2 py-1 pr-1.5 pl-4">
                <Link href={`/inmuebles/${v.inmuebleId}`} className="min-w-0 flex-1 py-2">
                  <span className="block font-bold">
                    {v.tipo === "visita" ? "Visitó" : "Consultó por"} {inmueble}
                  </span>
                  <span className="block text-[0.93rem] text-tenue">
                    {fechaCorta(v.fecha)}
                    {v.notas ? ` — ${v.notas}` : ""}
                  </span>
                </Link>
                <BorrarVisita id={v.id} />
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Documentos">
        <Documentos entidad="cliente" entidadId={c.id} archivos={docs} />
      </Seccion>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { FileDown, Pencil } from "lucide-react";
import { db, inmuebles, clientes, intereses, visitas, archivos } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth";
import { esId, etiquetaDe, ESTADOS_INMUEBLE, ESTADOS_CLIENTE } from "@/lib/entidades";
import { fechaCorta } from "@/lib/fechas";
import { plata } from "@/lib/dinero";
import { Seccion } from "@/components/ui";
import { Editable } from "@/components/Controles";
import { Fotos, Documentos, Vinculos, CompartirFicha, BotonVisita, BorrarVisita } from "@/components/Fichas";

export const metadata: Metadata = { title: "Inmueble" };

export default async function Inmueble({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirUsuario();
  const { id } = await params;
  if (!esId(id)) notFound();
  const [i] = await db
    .select()
    .from(inmuebles)
    .where(and(eq(inmuebles.id, id), eq(inmuebles.usuarioId, u.id), isNull(inmuebles.borradoEl)))
    .limit(1);
  if (!i) notFound();

  const [adjuntos, interesados, todosClientes, historial] = await Promise.all([
    db
      .select({ id: archivos.id, nombre: archivos.nombre, mime: archivos.mime, esFoto: archivos.esFoto })
      .from(archivos)
      .where(and(eq(archivos.usuarioId, u.id), eq(archivos.entidad, "inmueble"), eq(archivos.entidadId, id)))
      .orderBy(asc(archivos.creadoEl)),
    db
      .select({ id: clientes.id, nombre: clientes.nombre, estado: clientes.estado })
      .from(intereses)
      .innerJoin(clientes, eq(intereses.clienteId, clientes.id))
      .where(and(eq(intereses.inmuebleId, id), isNull(clientes.borradoEl)))
      .orderBy(asc(clientes.nombre)),
    db
      .select({ id: clientes.id, nombre: clientes.nombre })
      .from(clientes)
      .where(and(eq(clientes.usuarioId, u.id), isNull(clientes.borradoEl)))
      .orderBy(asc(clientes.nombre)),
    db
      .select({ v: visitas, cliente: clientes.nombre })
      .from(visitas)
      .leftJoin(clientes, eq(visitas.clienteId, clientes.id))
      .where(and(eq(visitas.inmuebleId, id), eq(visitas.usuarioId, u.id), isNull(visitas.borradoEl)))
      .orderBy(desc(visitas.fecha))
      .limit(100),
  ]);

  const precio = i.precio ? plata(i.precio, i.moneda) : null;
  const superficie = i.superficie ? `${Number(i.superficie).toLocaleString("es-AR")} m²` : null;
  const textoCompartir = [i.nombre, `${i.tipo}${i.direccion ? ` en ${i.direccion}` : ""}`, superficie, precio, i.observaciones]
    .filter(Boolean)
    .join("\n");

  const datos = [
    ["Dirección", i.direccion],
    ["Superficie", superficie],
    ["Propietario", i.propietario],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.9rem] leading-tight font-bold text-marino">{i.nombre}</h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="chip chip-marino">{etiquetaDe(ESTADOS_INMUEBLE, i.estado)}</span>
            <span className="chip">{i.tipo}</span>
          </p>
        </div>
        <Editable forma="inmueble" id={i.id} className="boton boton-suave boton-chico shrink-0" etiqueta="Editar inmueble">
          <Pencil aria-hidden size={18} /> Editar
        </Editable>
      </div>

      {precio && <p className="cifra mb-4 text-[1.7rem] font-bold text-tinta">{precio}</p>}

      <Fotos inmuebleId={i.id} fotos={adjuntos.filter((a) => a.esFoto)} />

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <a href={`/api/exportar/ficha?id=${i.id}`} className="boton boton-suave">
          <FileDown aria-hidden size={20} /> Ficha PDF
        </a>
        <CompartirFicha id={i.id} nombre={i.nombre} texto={textoCompartir} />
      </div>

      {datos.length > 0 && (
        <dl className="tarjeta mt-4 divide-y divide-linea">
          {datos.map(([t, v]) => (
            <div key={t} className="px-4 py-3">
              <dt className="text-[0.88rem] text-tenue">{t}</dt>
              <dd className="font-semibold break-words">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {i.observaciones && (
        <Seccion titulo="Observaciones">
          <p className="tarjeta p-4 whitespace-pre-wrap">{i.observaciones}</p>
        </Seccion>
      )}

      <Seccion titulo="Clientes interesados">
        <Vinculos
          lado="inmueble"
          propioId={i.id}
          vinculados={interesados.map((c) => ({ id: c.id, nombre: c.nombre, detalle: etiquetaDe(ESTADOS_CLIENTE, c.estado) }))}
          disponibles={todosClientes}
        />
      </Seccion>

      <Seccion titulo="Visitas y consultas" accion={<BotonVisita inmuebleId={i.id} />}>
        {historial.length === 0 ? (
          <p className="tarjeta px-4 py-4 text-tenue">Todavía no hay visitas ni consultas.</p>
        ) : (
          <ul className="tarjeta divide-y divide-linea overflow-hidden">
            {historial.map(({ v, cliente }) => (
              <li key={v.id} className="flex items-center gap-2 py-1 pr-1.5 pl-4">
                <div className="min-w-0 flex-1 py-2">
                  <span className="block font-bold">
                    {v.tipo === "visita" ? "Visita" : "Consulta"}
                    {cliente && v.clienteId ? (
                      <>
                        {" de "}
                        <Link href={`/clientes/${v.clienteId}`} className="text-marino underline underline-offset-2">{cliente}</Link>
                      </>
                    ) : null}
                  </span>
                  <span className="block text-[0.93rem] text-tenue">
                    {fechaCorta(v.fecha)}
                    {v.notas ? ` — ${v.notas}` : ""}
                  </span>
                </div>
                <BorrarVisita id={v.id} />
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Documentos">
        <Documentos entidad="inmueble" entidadId={i.id} archivos={adjuntos.filter((a) => !a.esFoto)} />
      </Seccion>
    </>
  );
}

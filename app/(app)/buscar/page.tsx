import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { SearchX } from "lucide-react";
import { db, pagos, eventos, clientes, inmuebles, obras, gastosObra } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth";
import { enZona, fechaCorta } from "@/lib/fechas";
import { plata } from "@/lib/dinero";
import { Titulo, Vacio, Seccion } from "@/components/ui";
import { Buscador, Editable } from "@/components/Controles";

export const metadata: Metadata = { title: "Buscar" };

const sinAcentos = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

export default async function Buscar({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await exigirUsuario();
  const q = sinAcentos((await searchParams).q ?? "").slice(0, 80);
  // Busca sin distinguir mayúsculas ni acentos: "reunion" encuentra "Reunión".
  const patron = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const coincide = (...cols: PgColumn[]): SQL =>
    or(
      ...cols.map(
        (c) => sql`translate(lower(coalesce(${c}, '')), 'áéíóúüñ', 'aeiouun') like ${patron}`,
      ),
    )!;

  const vacio = q.length < 2;
  const [rPagos, rEventos, rClientes, rInmuebles, rObras, rGastos] = vacio
    ? [[], [], [], [], [], []]
    : await Promise.all([
        db.select().from(pagos)
          .where(and(eq(pagos.usuarioId, u.id), isNull(pagos.borradoEl), coincide(pagos.concepto, pagos.proveedor, pagos.notas, pagos.categoria)))
          .orderBy(desc(pagos.vence)).limit(15),
        db.select().from(eventos)
          .where(and(eq(eventos.usuarioId, u.id), isNull(eventos.borradoEl), coincide(eventos.titulo, eventos.persona, eventos.lugar, eventos.notas)))
          .orderBy(desc(eventos.inicio)).limit(15),
        db.select().from(clientes)
          .where(and(eq(clientes.usuarioId, u.id), isNull(clientes.borradoEl), coincide(clientes.nombre, clientes.interes, clientes.telefono, clientes.email, clientes.notas)))
          .limit(15),
        db.select().from(inmuebles)
          .where(and(eq(inmuebles.usuarioId, u.id), isNull(inmuebles.borradoEl), coincide(inmuebles.nombre, inmuebles.direccion, inmuebles.propietario, inmuebles.observaciones)))
          .limit(15),
        db.select().from(obras)
          .where(and(eq(obras.usuarioId, u.id), isNull(obras.borradoEl), coincide(obras.nombre, obras.direccion, obras.notas)))
          .limit(10),
        db.select({ g: gastosObra, obra: obras.nombre }).from(gastosObra)
          .innerJoin(obras, eq(gastosObra.obraId, obras.id))
          .where(and(eq(gastosObra.usuarioId, u.id), isNull(gastosObra.borradoEl), isNull(obras.borradoEl), coincide(gastosObra.concepto, gastosObra.proveedor, gastosObra.categoria)))
          .orderBy(desc(gastosObra.fecha)).limit(15),
      ]);
  const total = rPagos.length + rEventos.length + rClientes.length + rInmuebles.length + rObras.length + rGastos.length;
  const fila = "block w-full px-4 py-3 hover:bg-hundido";
  const lista = "tarjeta divide-y divide-linea overflow-hidden";

  return (
    <>
      <Titulo>Buscar</Titulo>
      <Buscador inicial={(await searchParams).q ?? ""} />

      {vacio ? (
        <p className="mt-5 text-tenue">Escribí al menos dos letras: un nombre, un proveedor, una dirección…</p>
      ) : total === 0 ? (
        <div className="mt-5">
          <Vacio Icono={SearchX} titulo="Sin resultados" texto="Probá con otra palabra o con menos letras." />
        </div>
      ) : (
        <>
          {rClientes.length > 0 && (
            <Seccion titulo="Clientes">
              <ul className={lista}>
                {rClientes.map((c) => (
                  <li key={c.id}>
                    <Link href={`/clientes/${c.id}`} className={fila}>
                      <span className="block font-bold">{c.nombre}</span>
                      {c.interes && <span className="block text-[0.93rem] text-tenue">{c.interes}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </Seccion>
          )}
          {rInmuebles.length > 0 && (
            <Seccion titulo="Inmuebles">
              <ul className={lista}>
                {rInmuebles.map((i) => (
                  <li key={i.id}>
                    <Link href={`/inmuebles/${i.id}`} className={fila}>
                      <span className="block font-bold">{i.nombre}</span>
                      <span className="block text-[0.93rem] text-tenue">{i.direccion || i.tipo}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Seccion>
          )}
          {rEventos.length > 0 && (
            <Seccion titulo="Agenda">
              <ul className={lista}>
                {rEventos.map((e) => {
                  const z = enZona(e.inicio);
                  return (
                    <li key={e.id}>
                      <Editable forma={e.tipo as "reunion" | "tarea" | "recordatorio"} id={e.id} className={fila}>
                        <span className="block font-bold">{e.tipo === "reunion" ? (e.persona ?? e.titulo) : e.titulo}</span>
                        <span className="block text-[0.93rem] text-tenue">
                          {fechaCorta(z.fecha)}
                          {e.sinHora ? "" : `, ${z.hora}`}
                          {e.lugar ? ` — ${e.lugar}` : ""}
                        </span>
                      </Editable>
                    </li>
                  );
                })}
              </ul>
            </Seccion>
          )}
          {rPagos.length > 0 && (
            <Seccion titulo="Pagos e impuestos">
              <ul className={lista}>
                {rPagos.map((p) => (
                  <li key={p.id}>
                    <Editable forma={p.tipo === "impuesto" ? "impuesto" : "pago"} id={p.id} className={fila}>
                      <span className="flex justify-between gap-3 font-bold">
                        <span className="truncate">{p.concepto}</span>
                        <span className="cifra shrink-0">{plata(p.importe, p.moneda)}</span>
                      </span>
                      <span className="block text-[0.93rem] text-tenue">
                        {p.pagadoEl ? `Pagado el ${fechaCorta(p.pagadoEl)}` : `Vence el ${fechaCorta(p.vence)}`}
                      </span>
                    </Editable>
                  </li>
                ))}
              </ul>
            </Seccion>
          )}
          {rObras.length > 0 && (
            <Seccion titulo="Obras">
              <ul className={lista}>
                {rObras.map((o) => (
                  <li key={o.id}>
                    <Link href={`/obras/${o.id}`} className={fila}>
                      <span className="block font-bold">{o.nombre}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Seccion>
          )}
          {rGastos.length > 0 && (
            <Seccion titulo="Gastos de obra">
              <ul className={lista}>
                {rGastos.map(({ g, obra }) => (
                  <li key={g.id}>
                    <Link href={`/obras/${g.obraId}`} className={fila}>
                      <span className="flex justify-between gap-3 font-bold">
                        <span className="truncate">{g.concepto}</span>
                        <span className="cifra shrink-0">{plata(g.importe, g.moneda)}</span>
                      </span>
                      <span className="block text-[0.93rem] text-tenue">
                        {obra} — {fechaCorta(g.fecha)}
                        {g.proveedor ? ` — ${g.proveedor}` : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Seccion>
          )}
        </>
      )}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gte, isNull, lt, ne } from "drizzle-orm";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Bell, Sparkles, CalendarPlus, ListChecks } from "lucide-react";
import { db, eventos, clientes } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth";
import {
  aInstante, enZona, esFecha, hoy as fechaHoy, sumarDias, sumarMeses, inicioSemana, inicioMes, finMes,
  diaSemana, fechaLarga, fechaCorta, mesYAnio, NOMBRES_DIAS, NOMBRES_DIAS_CORTOS,
} from "@/lib/fechas";
import { Titulo, Pestanas, Vacio } from "@/components/ui";
import { BotonAsistente, BotonNuevo, CasillaTarea, Editable, Reprogramar, Descargar } from "@/components/Controles";

export const metadata: Metadata = { title: "Agenda" };

type Fila = { e: typeof eventos.$inferSelect; cliente: string | null };

async function traer(uid: string, desde: string, hasta: string) {
  return db
    .select({ e: eventos, cliente: clientes.nombre })
    .from(eventos)
    .leftJoin(clientes, eq(eventos.clienteId, clientes.id))
    .where(
      and(
        eq(eventos.usuarioId, uid), isNull(eventos.borradoEl),
        gte(eventos.inicio, aInstante(desde)), lt(eventos.inicio, aInstante(sumarDias(hasta, 1))),
      ),
    )
    .orderBy(asc(eventos.inicio));
}

export default async function Agenda({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; dia?: string }>;
}) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  const hoy = fechaHoy();
  const vista = sp.vista === "semana" || sp.vista === "mes" ? sp.vista : "hoy";
  const dia = esFecha(sp.dia) ? sp.dia : hoy;
  const url = (v: string, d: string) => `/agenda?vista=${v}${d === hoy ? "" : `&dia=${d}`}`;

  const desde = vista === "hoy" ? dia : vista === "semana" ? inicioSemana(dia) : inicioMes(dia);
  const hasta = vista === "hoy" ? dia : vista === "semana" ? sumarDias(desde, 6) : finMes(dia);
  const filas = await traer(u.id, desde, hasta);

  // Tareas de días anteriores que quedaron sin hacer: se muestran solo al mirar el día de hoy.
  const atrasadas =
    vista === "hoy" && dia === hoy
      ? await db
          .select({ e: eventos, cliente: clientes.nombre })
          .from(eventos)
          .leftJoin(clientes, eq(eventos.clienteId, clientes.id))
          .where(
            and(
              eq(eventos.usuarioId, u.id), isNull(eventos.borradoEl), ne(eventos.tipo, "reunion"),
              isNull(eventos.completadoEl), lt(eventos.inicio, aInstante(hoy)),
            ),
          )
          .orderBy(asc(eventos.inicio))
          .limit(50)
      : [];

  const porDia = new Map<string, Fila[]>();
  for (const f of filas) {
    const k = enZona(f.e.inicio).fecha;
    porDia.set(k, [...(porDia.get(k) ?? []), f]);
  }

  const paso = vista === "hoy" ? 1 : 7;
  const anterior = vista === "mes" ? sumarMeses(inicioMes(dia), -1) : sumarDias(dia, -paso);
  const siguiente = vista === "mes" ? sumarMeses(inicioMes(dia), 1) : sumarDias(dia, paso);
  const rotulo =
    vista === "hoy"
      ? dia === hoy ? `Hoy, ${fechaLarga(dia)}` : fechaLarga(dia)
      : vista === "semana"
        ? `${fechaCorta(desde)} al ${fechaCorta(hasta)}`
        : mesYAnio(dia);

  return (
    <>
      <Titulo>Mi agenda</Titulo>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <BotonNuevo forma="reunion" inicial={{ fecha: dia }}>
          <CalendarPlus aria-hidden size={20} /> Reunión
        </BotonNuevo>
        <BotonNuevo forma="tarea" inicial={{ fecha: dia }} className="boton boton-suave">
          <ListChecks aria-hidden size={20} /> Tarea
        </BotonNuevo>
      </div>
      <BotonAsistente pedido="¿Qué tengo pendiente hoy?" className="boton boton-suave mb-5 w-full">
        <Sparkles aria-hidden size={20} /> ¿Qué tengo hoy?
      </BotonAsistente>

      <Pestanas
        items={[
          { href: url("hoy", dia), texto: "Hoy", activa: vista === "hoy" },
          { href: url("semana", dia), texto: "Semana", activa: vista === "semana" },
          { href: url("mes", dia), texto: "Mes", activa: vista === "mes" },
        ]}
      />

      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href={url(vista, anterior)} aria-label="Anterior" scroll={false} className="grid size-11 place-items-center rounded-xl text-marino hover:bg-hundido">
          <ChevronLeft aria-hidden size={24} />
        </Link>
        <h2 className="text-center text-[1.1rem] font-bold text-marino first-letter:uppercase">{rotulo}</h2>
        <Link href={url(vista, siguiente)} aria-label="Siguiente" scroll={false} className="grid size-11 place-items-center rounded-xl text-marino hover:bg-hundido">
          <ChevronRight aria-hidden size={24} />
        </Link>
      </div>
      {dia !== hoy && (
        <p className="-mt-2 mb-4 text-center">
          <Link href={`/agenda?vista=${vista}`} scroll={false} className="font-bold text-marino underline">
            Volver a hoy
          </Link>
        </p>
      )}

      {vista === "hoy" && (
        <>
          {atrasadas.length > 0 && (
            <section className="mb-5">
              <h3 className="mb-2 font-bold text-rojo">Quedó sin hacer</h3>
              <Lista filas={atrasadas} conFecha />
            </section>
          )}
          {filas.length === 0 && atrasadas.length === 0 ? (
            <Vacio Icono={CalendarDays} titulo="Día libre" texto="No hay reuniones ni tareas para este día." />
          ) : (
            filas.length > 0 && <Lista filas={filas} />
          )}
        </>
      )}

      {vista === "semana" && (
        <div className="space-y-4">
          {Array.from({ length: 7 }, (_, i) => sumarDias(desde, i)).map((d) => {
            const delDia = porDia.get(d) ?? [];
            return (
              <section key={d}>
                <h3 className={`mb-1.5 flex items-center gap-2 font-bold first-letter:uppercase ${d === hoy ? "text-marino" : "text-tenue"}`}>
                  <Link href={url("hoy", d)} className="first-letter:uppercase hover:underline">
                    {NOMBRES_DIAS[diaSemana(d)]} {Number(d.slice(8))}
                  </Link>
                  {d === hoy && <span className="chip chip-marino">Hoy</span>}
                </h3>
                {delDia.length ? <Lista filas={delDia} /> : <p className="border-l-[3px] border-linea py-1 pl-3 text-tenue">Nada agendado</p>}
              </section>
            );
          })}
        </div>
      )}

      {vista === "mes" && (
        <div className="tarjeta p-2.5">
          <div className="grid grid-cols-7 text-center text-[0.82rem] font-bold text-tenue" aria-hidden>
            {NOMBRES_DIAS_CORTOS.map((n) => (
              <span key={n} className="py-1.5">{n}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: diaSemana(desde) }, (_, i) => (
              <span key={`v${i}`} />
            ))}
            {Array.from({ length: Number(hasta.slice(8)) }, (_, i) => sumarDias(desde, i)).map((d) => {
              const n = porDia.get(d)?.length ?? 0;
              return (
                <Link
                  key={d}
                  href={url("hoy", d)}
                  aria-label={`${fechaLarga(d)}${n ? `, ${n} ${n === 1 ? "cosa agendada" : "cosas agendadas"}` : ""}`}
                  className={`flex aspect-square min-h-11 flex-col items-center justify-center rounded-xl font-bold ${
                    d === hoy ? "bg-marino text-white" : n ? "bg-marino-claro text-marino" : "text-tinta hover:bg-hundido"
                  }`}
                >
                  {Number(d.slice(8))}
                  {n > 0 && <span className={`text-[0.72rem] leading-none font-semibold ${d === hoy ? "text-white/85" : "text-marino"}`}>{n}</span>}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-8">
        <Descargar tipo="agenda" formatos={["xlsx", "pdf", "csv", "ics"]}>
          Descargar agenda
        </Descargar>
      </div>
    </>
  );
}

function Lista({ filas, conFecha }: { filas: Fila[]; conFecha?: boolean }) {
  return (
    <ul className="tarjeta divide-y divide-linea overflow-hidden">
      {filas.map(({ e, cliente }) => {
        const z = enZona(e.inicio);
        const esReunion = e.tipo === "reunion";
        const titulo = esReunion ? (e.persona ?? e.titulo) : e.titulo;
        const hecha = Boolean(e.completadoEl);
        return (
          <li key={e.id} className="flex items-center gap-1 py-1 pr-1.5 pl-2">
            {esReunion ? (
              <span className="cifra w-[3.4rem] shrink-0 text-center text-[1.05rem] font-bold text-marino">{z.hora}</span>
            ) : (
              <span className="grid w-[3.4rem] shrink-0 place-items-center">
                <CasillaTarea id={e.id} hecha={hecha} titulo={titulo} />
              </span>
            )}
            <Editable forma={e.tipo as "reunion" | "tarea" | "recordatorio"} id={e.id} className="min-w-0 flex-1 py-2" etiqueta={`Editar ${titulo}`}>
              <span className={`flex items-center gap-1.5 font-bold ${hecha ? "text-tenue line-through" : ""}`}>
                {e.tipo === "recordatorio" && <Bell aria-label="Recordatorio" size={16} className="shrink-0 text-tenue" />}
                <span className="truncate">{titulo}</span>
              </span>
              <span className="block text-[0.93rem] text-tenue">
                {conFecha && <span className="font-semibold text-rojo">{fechaCorta(z.fecha)} </span>}
                {!esReunion && !e.sinHora && <span className="cifra">{z.hora} </span>}
                {esReunion && e.titulo && <span>{e.titulo} </span>}
                {e.lugar && (
                  <span className="inline-flex items-center gap-0.5">
                    <MapPin aria-hidden size={14} /> {e.lugar}{" "}
                  </span>
                )}
                {cliente && <span>Cliente: {cliente}</span>}
              </span>
            </Editable>
            {!hecha && <Reprogramar id={e.id} fecha={z.fecha} hora={e.sinHora ? null : z.hora} titulo={titulo} />}
          </li>
        );
      })}
    </ul>
  );
}

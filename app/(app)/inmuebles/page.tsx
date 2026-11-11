import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { Home, Plus } from "lucide-react";
import { db, inmuebles, archivos } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth";
import { ESTADOS_INMUEBLE, TIPOS_INMUEBLE, etiquetaDe } from "@/lib/entidades";
import { normalizar } from "@/lib/calculos";
import { plata } from "@/lib/dinero";
import { Titulo, Vacio } from "@/components/ui";
import { BotonNuevo, Descargar } from "@/components/Controles";
import { SelectorUrl } from "@/components/SelectorUrl";

export const metadata: Metadata = { title: "Inmuebles" };

const TONO_ESTADO: Record<string, string> = {
  disponible: "chip-verde", reservado: "chip-ambar", vendido: "chip-marino", alquilado: "chip-marino", pausado: "",
};

export default async function Inmuebles({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; tipo?: string; q?: string }>;
}) {
  const u = await exigirUsuario();
  const sp = await searchParams;
  const q = normalizar(sp.q ?? "");

  const todos = await db
    .select()
    .from(inmuebles)
    .where(and(eq(inmuebles.usuarioId, u.id), isNull(inmuebles.borradoEl)))
    .orderBy(asc(inmuebles.nombre));
  const lista = todos.filter(
    (i) =>
      (!sp.estado || i.estado === sp.estado) &&
      (!sp.tipo || i.tipo === sp.tipo) &&
      (!q || normalizar(`${i.nombre} ${i.direccion ?? ""} ${i.propietario ?? ""} ${i.observaciones ?? ""}`).includes(q)),
  );
  const fotos = lista.length
    ? await db
        .select({ id: archivos.id, inmuebleId: archivos.entidadId })
        .from(archivos)
        .where(and(eq(archivos.entidad, "inmueble"), eq(archivos.esFoto, true), inArray(archivos.entidadId, lista.map((i) => i.id))))
        .orderBy(asc(archivos.creadoEl))
    : [];
  const portada = new Map<string, string>();
  for (const f of fotos) if (!portada.has(f.inmuebleId)) portada.set(f.inmuebleId, f.id);
  const filtrando = Boolean(sp.estado || sp.tipo || q);

  return (
    <>
      <Titulo>Inmuebles</Titulo>
      {todos.length === 0 ? (
        <Vacio Icono={Home} titulo="Todavía no cargaste inmuebles" texto="Cargá cada propiedad con sus fotos y tené la ficha lista para compartir.">
          <BotonNuevo forma="inmueble">
            <Plus aria-hidden size={21} /> Nuevo inmueble
          </BotonNuevo>
        </Vacio>
      ) : (
        <>
          <form role="search" className="mb-2.5">
            {sp.estado && <input type="hidden" name="estado" value={sp.estado} />}
            {sp.tipo && <input type="hidden" name="tipo" value={sp.tipo} />}
            <label htmlFor="q" className="sr-only">Buscar inmueble</label>
            <input id="q" name="q" type="search" defaultValue={sp.q ?? ""} className="campo" placeholder="Buscar por nombre o dirección" autoComplete="off" />
          </form>
          <div className="mb-4 flex gap-2">
            <SelectorUrl parametro="estado" etiqueta="Filtrar por estado" todos="Todos los estados" opciones={ESTADOS_INMUEBLE} />
            <SelectorUrl
              parametro="tipo"
              etiqueta="Filtrar por tipo"
              todos="Todos los tipos"
              opciones={TIPOS_INMUEBLE.filter((t) => todos.some((i) => i.tipo === t.valor))}
            />
          </div>
          {filtrando && (
            <p className="mb-3 text-tenue">
              {lista.length} de {todos.length} —{" "}
              <Link href="/inmuebles" className="font-bold text-marino underline">Quitar filtros</Link>
            </p>
          )}

          {lista.length === 0 ? (
            <p className="tarjeta px-4 py-6 text-center text-tenue">Ningún inmueble coincide con esos filtros.</p>
          ) : (
            <ul className="space-y-3">
              {lista.map((i) => (
                <li key={i.id}>
                  <Link href={`/inmuebles/${i.id}`} className="tarjeta flex gap-3.5 overflow-hidden p-2.5 hover:bg-hundido">
                    <span className="grid size-[5.6rem] shrink-0 place-items-center overflow-hidden rounded-[14px] bg-hundido text-tenue">
                      {portada.has(i.id) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/archivos/${portada.get(i.id)}`} alt="" loading="lazy" className="size-full object-cover" />
                      ) : (
                        <Home aria-hidden size={30} strokeWidth={1.6} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 py-0.5">
                      <span className="block truncate text-[1.15rem] font-bold text-marino">{i.nombre}</span>
                      <span className="block truncate text-[0.93rem] text-tenue">{i.direccion || i.tipo}</span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className={`chip ${TONO_ESTADO[i.estado] ?? ""}`}>{etiquetaDe(ESTADOS_INMUEBLE, i.estado)}</span>
                        {i.precio && <span className="cifra font-bold">{plata(i.precio, i.moneda)}</span>}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <BotonNuevo forma="inmueble" className="boton boton-suave">
              <Plus aria-hidden size={20} /> Nuevo inmueble
            </BotonNuevo>
            <Descargar tipo="inmuebles">Descargar inventario</Descargar>
          </div>
        </>
      )}
    </>
  );
}

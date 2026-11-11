import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Paperclip, Pencil, Plus, Receipt, TriangleAlert } from "lucide-react";
import { db, obras, gastosObra, archivos } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth";
import { calcularObra, enMonedaDeObra } from "@/lib/calculos";
import { esId, CATEGORIAS_OBRA } from "@/lib/entidades";
import { fechaCorta, fechaNumerica, NOMBRES_MESES } from "@/lib/fechas";
import { plata, plataCentavos, textoTotales } from "@/lib/dinero";
import { Barrita, Seccion, Vacio } from "@/components/ui";
import { BotonNuevo, Descargar, Editable, GastoPagado } from "@/components/Controles";
import { SelectorUrl } from "@/components/SelectorUrl";

export const metadata: Metadata = { title: "Obra" };

export default async function Obra({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ categoria?: string; proveedor?: string }>;
}) {
  const u = await exigirUsuario();
  const { id } = await params;
  const filtro = await searchParams;
  if (!esId(id)) notFound();
  const [obra] = await db
    .select()
    .from(obras)
    .where(and(eq(obras.id, id), eq(obras.usuarioId, u.id), isNull(obras.borradoEl)))
    .limit(1);
  if (!obra) notFound();

  const gastos = await db
    .select()
    .from(gastosObra)
    .where(and(eq(gastosObra.obraId, id), eq(gastosObra.usuarioId, u.id), isNull(gastosObra.borradoEl)))
    .orderBy(desc(gastosObra.fecha), desc(gastosObra.creadoEl));
  const conAdjunto = gastos.length
    ? new Set(
        (
          await db
            .select({ id: archivos.entidadId, n: sql<number>`count(*)::int` })
            .from(archivos)
            .where(and(eq(archivos.entidad, "gasto"), inArray(archivos.entidadId, gastos.map((g) => g.id))))
            .groupBy(archivos.entidadId)
        ).map((a) => a.id),
      )
    : new Set<string>();

  const c = calcularObra(obra, gastos);
  const m = obra.moneda;
  const proveedores = [...new Set(gastos.map((g) => g.proveedor).filter(Boolean) as string[])].sort();
  const visibles = gastos.filter(
    (g) =>
      (!filtro.categoria || g.categoria === filtro.categoria) &&
      (!filtro.proveedor || g.proveedor === filtro.proveedor),
  );
  const filtrando = Boolean(filtro.categoria || filtro.proveedor);
  const totalVisible = visibles.reduce((s, g) => s + (enMonedaDeObra(g, m) ?? 0), 0);
  const maxMes = Math.max(1, ...c.porMes.map(([, v]) => v));
  const maxCat = Math.max(1, ...c.porCategoria.map(([, v]) => v));

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.9rem] leading-tight font-bold text-marino">{obra.nombre}</h1>
          {obra.direccion && <p className="mt-0.5 text-tenue">{obra.direccion}</p>}
        </div>
        <Editable forma="obra" id={obra.id} className="boton boton-suave boton-chico shrink-0" etiqueta="Editar obra">
          <Pencil aria-hidden size={18} /> Editar
        </Editable>
      </div>

      <section aria-label="Estado del presupuesto" className="tarjeta p-4">
        <dl className="grid grid-cols-3 gap-2">
          <div>
            <dt className="text-[0.88rem] text-tenue">Presupuesto</dt>
            <dd className="cifra text-[1.08rem] font-bold">{plataCentavos(c.presupuesto, m)}</dd>
          </div>
          <div>
            <dt className="text-[0.88rem] text-tenue">Gastado</dt>
            <dd className="cifra text-[1.08rem] font-bold">{plataCentavos(c.usado, m)}</dd>
          </div>
          <div>
            <dt className="text-[0.88rem] text-tenue">Disponible</dt>
            <dd className={`cifra text-[1.08rem] font-bold ${c.disponible < 0 ? "text-rojo" : "text-verde"}`}>
              {plataCentavos(c.disponible, m)}
            </dd>
          </div>
        </dl>
        <div className="mt-3.5">
          <Barrita porcentaje={c.porcentaje} excedida={c.excedida} />
        </div>
        <p className="mt-2 text-[0.93rem] text-tenue">
          {c.presupuesto > 0 ? `Usaste el ${c.porcentaje}% del presupuesto.` : "Esta obra no tiene presupuesto cargado."}
          {c.comprometido > 0 && (
            <>
              {" "}De lo gastado, <strong className="cifra text-ambar">{plataCentavos(c.comprometido, m)}</strong> todavía no se pagó.
            </>
          )}
        </p>
        {c.excedida && (
          <p role="status" className="mt-3 flex items-start gap-2 rounded-[14px] bg-rojo-claro px-3.5 py-2.5 font-semibold text-rojo">
            <TriangleAlert aria-hidden size={20} className="mt-0.5 shrink-0" />
            La obra pasó el presupuesto por {plataCentavos(-c.disponible, m)}.
          </p>
        )}
        {c.haySinConvertir && (
          <p className="mt-3 rounded-[14px] bg-ambar-claro px-3.5 py-2.5 text-[0.95rem] text-ambar">
            <strong>Aparte, sin sumar: {textoTotales(c.sinConvertir)}.</strong> Son gastos en otra moneda sin valor del dólar cargado. Editalos y completá el valor y su fecha para que entren en la cuenta.
          </p>
        )}
      </section>

      <BotonNuevo forma="gastoObra" inicial={{ obraId: obra.id }} className="boton mt-4 w-full">
        <Plus aria-hidden size={21} /> Agregar gasto
      </BotonNuevo>

      {gastos.length === 0 ? (
        <div className="mt-6">
          <Vacio Icono={Receipt} titulo="Sin gastos todavía" texto="Cada gasto que cargues descuenta del presupuesto de la obra." />
        </div>
      ) : (
        <>
          {c.porCategoria.length > 0 && (
            <Seccion titulo="En qué se fue la plata">
              <ul className="tarjeta space-y-3 p-4">
                {c.porCategoria.map(([cat, v]) => (
                  <li key={cat}>
                    <div className="flex justify-between gap-3">
                      <span className="font-semibold">{cat}</span>
                      <span className="cifra font-bold">{plataCentavos(v, m)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-hundido" aria-hidden>
                      <div className="h-full rounded-full bg-marino" style={{ width: `${Math.max((v / maxCat) * 100, 2)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Seccion>
          )}

          {c.porMes.length > 1 && (
            <Seccion titulo="Mes a mes">
              <ul className="tarjeta space-y-3 p-4">
                {c.porMes.map(([mes, v]) => (
                  <li key={mes}>
                    <div className="flex justify-between gap-3">
                      <span className="font-semibold first-letter:uppercase">
                        {NOMBRES_MESES[Number(mes.slice(5)) - 1]} {mes.slice(0, 4)}
                      </span>
                      <span className="cifra font-bold">{plataCentavos(v, m)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-hundido" aria-hidden>
                      <div className="h-full rounded-full bg-marino-2" style={{ width: `${Math.max((v / maxMes) * 100, 2)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Seccion>
          )}

          <Seccion titulo="Gastos">
            <div className="mb-3 flex gap-2">
              <SelectorUrl
                parametro="categoria"
                etiqueta="Filtrar por categoría"
                todos="Todas las categorías"
                opciones={CATEGORIAS_OBRA.filter((x) => gastos.some((g) => g.categoria === x.valor))}
              />
              {proveedores.length > 0 && (
                <SelectorUrl
                  parametro="proveedor"
                  etiqueta="Filtrar por proveedor"
                  todos="Todos los proveedores"
                  opciones={proveedores.map((p) => ({ valor: p, etiqueta: p }))}
                />
              )}
            </div>
            {filtrando && (
              <p className="mb-2 text-tenue">
                {visibles.length} {visibles.length === 1 ? "gasto" : "gastos"} — <strong className="cifra text-tinta">{plataCentavos(totalVisible, m)}</strong>
              </p>
            )}
            {visibles.length === 0 ? (
              <p className="tarjeta px-4 py-5 text-tenue">No hay gastos con ese filtro.</p>
            ) : (
              <ul className="tarjeta divide-y divide-linea overflow-hidden">
                {visibles.map((g) => {
                  const otraMoneda = g.moneda !== m;
                  return (
                    <li key={g.id} className="flex items-center gap-2 py-1.5 pr-2.5">
                      <Editable forma="gastoObra" id={g.id} className="min-w-0 flex-1 py-1.5 pl-4" etiqueta={`Editar ${g.concepto}`}>
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-bold">{g.concepto}</span>
                          {conAdjunto.has(g.id) && <Paperclip aria-label="Con comprobante" size={15} className="shrink-0 text-tenue" />}
                        </span>
                        <span className="block text-[0.93rem] text-tenue">
                          {fechaCorta(g.fecha)} — {g.categoria}
                          {g.proveedor ? ` — ${g.proveedor}` : ""}
                        </span>
                        <span className="cifra mt-0.5 block text-[1.08rem] font-bold text-marino">{plata(g.importe, g.moneda)}</span>
                        {!g.pagado && <span className="block text-[0.88rem] font-semibold text-ambar">Todavía sin pagar</span>}
                        {otraMoneda &&
                          (g.tipoCambio ? (
                            <span className="block text-[0.88rem] text-tenue">
                              Dólar a {plata(g.tipoCambio, "ARS")} del {fechaNumerica(g.tipoCambioFecha!)} = {plataCentavos(enMonedaDeObra(g, m)!, m)}
                            </span>
                          ) : (
                            <span className="block text-[0.88rem] font-semibold text-ambar">Sin convertir: no suma al presupuesto</span>
                          ))}
                      </Editable>
                      <GastoPagado id={g.id} pagado={g.pagado} concepto={g.concepto} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Seccion>

          <div className="mt-6">
            <Descargar tipo="obras" parametros={`&obra=${obra.id}`} />
          </div>
        </>
      )}
      {obra.notas && (
        <Seccion titulo="Notas">
          <p className="tarjeta p-4 whitespace-pre-wrap">{obra.notas}</p>
        </Seccion>
      )}
    </>
  );
}

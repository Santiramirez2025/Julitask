import { and, desc, eq, isNull } from "drizzle-orm";
import { CreditCard, Landmark, Repeat, Plus } from "lucide-react";
import { db, pagos } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth";
import { asegurarRecurrentes } from "@/lib/consultas";
import { estadoPago } from "@/lib/calculos";
import { fechaCorta, fechaRelativa, hoy as fechaHoy, mesYAnio, diasEntre } from "@/lib/fechas";
import { plata, sumarPorMoneda } from "@/lib/dinero";
import { Titulo, Vacio, Indicadores, Montos } from "./ui";
import { BotonNuevo, BotonPagar, Editable, Descargar } from "./Controles";

type Fila = typeof pagos.$inferSelect;

export async function PantallaPagos({ tipo, ver }: { tipo: "personal" | "impuesto"; ver?: string }) {
  const u = await exigirUsuario();
  await asegurarRecurrentes(u.id);
  const hoy = fechaHoy();
  const esImpuesto = tipo === "impuesto";
  const base = esImpuesto ? "/impuestos" : "/pagos";
  const forma = esImpuesto ? "impuesto" : "pago";

  const todos = await db
    .select()
    .from(pagos)
    .where(and(eq(pagos.usuarioId, u.id), eq(pagos.tipo, tipo), isNull(pagos.borradoEl)))
    .orderBy(desc(pagos.vence))
    .limit(1500);

  const porPagar = todos.filter((p) => estadoPago(p, hoy) === "por-pagar").reverse();
  const vencidos = todos.filter((p) => estadoPago(p, hoy) === "vencido").reverse();
  const pagados = todos
    .filter((p) => p.pagadoEl)
    .sort((a, b) => b.pagadoEl!.localeCompare(a.pagadoEl!));
  const pagadosMes = pagados.filter((p) => p.pagadoEl!.slice(0, 7) === hoy.slice(0, 7));

  const filtro = ver === "pagado" || ver === "vencido" || ver === "por-pagar" ? ver : null;
  const enlace = (v: string) => (filtro === v ? base : `${base}?ver=${v}`);

  const indicadores = [
    {
      href: enlace("por-pagar"), etiqueta: esImpuesto ? "Por vencer" : "Por pagar", cantidad: porPagar.length,
      totales: sumarPorMoneda(porPagar), tono: "ambar" as const, activo: filtro === "por-pagar",
    },
    {
      href: enlace("pagado"), etiqueta: esImpuesto ? "Al día" : "Pagado", cantidad: pagadosMes.length,
      totales: sumarPorMoneda(pagadosMes), tono: "verde" as const, activo: filtro === "pagado",
    },
    {
      href: enlace("vencido"), etiqueta: "Vencido", cantidad: vencidos.length,
      totales: sumarPorMoneda(vencidos), tono: "rojo" as const, activo: filtro === "vencido",
    },
  ];
  // En Impuestos el orden pedido es: Al día, Por vencer, Vencido.
  if (esImpuesto) indicadores.splice(0, 2, indicadores[1], indicadores[0]);

  const Icono = esImpuesto ? Landmark : CreditCard;
  const nuevo = esImpuesto ? "Agregar impuesto" : "Registrar pago";

  return (
    <>
      <Titulo>{esImpuesto ? "Impuestos" : "Pagos"}</Titulo>

      {todos.length === 0 ? (
        <Vacio
          Icono={Icono}
          titulo={esImpuesto ? "Todavía no cargaste impuestos" : "Todavía no cargaste pagos"}
          texto={
            esImpuesto
              ? "Cargá cada impuesto con su vencimiento y te aviso antes de que venza."
              : "Cargá lo que tenés que pagar y marcá cada cosa cuando la pagues."
          }
        >
          <BotonNuevo forma={forma}>
            <Plus aria-hidden size={21} /> {nuevo}
          </BotonNuevo>
        </Vacio>
      ) : (
        <>
          <Indicadores items={indicadores} />
          <BotonNuevo forma={forma} className="boton mb-6 w-full">
            <Plus aria-hidden size={21} /> {nuevo}
          </BotonNuevo>

          {(!filtro || filtro === "vencido") && (
            <Grupo titulo="Vencido" tono="rojo" filas={vencidos} hoy={hoy} forma={forma} vacio={filtro ? "No tenés nada vencido." : ""} />
          )}
          {(!filtro || filtro === "por-pagar") && (
            <Grupo
              titulo={esImpuesto ? "Por vencer" : "Por pagar"}
              filas={porPagar}
              hoy={hoy}
              forma={forma}
              vacio={esImpuesto ? "No tenés impuestos por vencer." : "No tenés pagos pendientes."}
            />
          )}
          {filtro === "pagado" && <Historial filas={pagados} forma={forma} />}

          <div className="mt-8 flex flex-wrap gap-3">
            <Descargar tipo={esImpuesto ? "impuestos" : "pagos"} />
            {esImpuesto && (
              <Descargar tipo="contador" formatos={["xlsx", "pdf"]}>
                Resumen para el contador
              </Descargar>
            )}
          </div>
          {esImpuesto && (
            <p className="mt-4 text-[0.9rem] text-tenue">
              Acá se registran los importes y vencimientos que vos cargás. La app no calcula impuestos: eso lo define tu contador.
            </p>
          )}
        </>
      )}
    </>
  );
}

function cuando(p: Fila, hoy: string) {
  const n = diasEntre(hoy, p.vence);
  if (n === 0) return "Vence hoy";
  if (n === 1) return "Vence mañana";
  if (n < 0) return `Venció ${fechaRelativa(p.vence, hoy).toLowerCase()}`;
  return `Vence ${n <= 6 ? `en ${n} días` : `el ${fechaCorta(p.vence)}`}`;
}

function Grupo({
  titulo, filas, hoy, forma, tono, vacio,
}: {
  titulo: string; filas: Fila[]; hoy: string; forma: "pago" | "impuesto"; tono?: "rojo"; vacio: string;
}) {
  if (!filas.length && !vacio) return null;
  return (
    <section className="mb-6">
      <h2 className={`mb-2 text-[1.1rem] font-bold ${tono === "rojo" ? "text-rojo" : "text-marino"}`}>{titulo}</h2>
      {!filas.length ? (
        <p className="tarjeta px-4 py-5 text-tenue">{vacio}</p>
      ) : (
        <ul className="tarjeta divide-y divide-linea overflow-hidden">
          {filas.map((p) => {
            const pronto = !tono && diasEntre(hoy, p.vence) <= 3;
            return (
              <li key={p.id} className="flex items-center gap-2 py-1.5 pr-2.5">
                <Editable forma={forma} id={p.id} className="min-w-0 flex-1 py-1.5 pl-4" etiqueta={`Editar ${p.concepto}`}>
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-bold">{p.concepto}</span>
                    {p.repite !== "no" && <Repeat aria-label="Se repite" size={15} className="shrink-0 text-tenue" />}
                  </span>
                  <span className={`block text-[0.93rem] ${tono === "rojo" ? "font-semibold text-rojo" : pronto ? "font-semibold text-ambar" : "text-tenue"}`}>
                    {cuando(p, hoy)}
                    {p.periodo ? ` — ${p.periodo}` : ""}
                  </span>
                  <span className="cifra mt-0.5 block text-[1.12rem] font-bold text-marino">{plata(p.importe, p.moneda)}</span>
                </Editable>
                <BotonPagar id={p.id} concepto={p.concepto} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Historial({ filas, forma }: { filas: Fila[]; forma: "pago" | "impuesto" }) {
  if (!filas.length) return <p className="tarjeta px-4 py-5 text-tenue">Todavía no marcaste nada como pagado.</p>;
  const meses = new Map<string, Fila[]>();
  for (const f of filas) {
    const k = f.pagadoEl!.slice(0, 7);
    meses.set(k, [...(meses.get(k) ?? []), f]);
  }
  return (
    <>
      {[...meses.entries()].map(([mes, lista]) => (
        <section key={mes} className="mb-6">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 className="text-[1.1rem] font-bold text-marino first-letter:uppercase">{mesYAnio(mes + "-01")}</h2>
            <span className="text-right font-bold text-verde">
              <Montos totales={sumarPorMoneda(lista)} />
            </span>
          </div>
          <ul className="tarjeta divide-y divide-linea overflow-hidden">
            {lista.map((p) => (
              <li key={p.id}>
                <Editable forma={forma} id={p.id} className="flex w-full items-center justify-between gap-3 px-4 py-3" etiqueta={`Editar ${p.concepto}`}>
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{p.concepto}</span>
                    <span className="block text-[0.93rem] text-tenue">
                      Pagado el {fechaCorta(p.pagadoEl!)}
                      {p.medioPago ? ` — ${p.medioPago}` : ""}
                    </span>
                  </span>
                  <span className="cifra shrink-0 font-bold text-marino">{plata(p.importe, p.moneda)}</span>
                </Editable>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

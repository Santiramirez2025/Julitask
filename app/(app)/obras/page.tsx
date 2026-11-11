import type { Metadata } from "next";
import Link from "next/link";
import { HardHat, Plus } from "lucide-react";
import { exigirUsuario } from "@/lib/auth";
import { obrasConTotales } from "@/lib/consultas";
import { plataCentavos } from "@/lib/dinero";
import { Titulo, Vacio, Barrita } from "@/components/ui";
import { BotonNuevo, Descargar } from "@/components/Controles";

export const metadata: Metadata = { title: "Obras" };

export default async function Obras() {
  const u = await exigirUsuario();
  const obras = await obrasConTotales(u.id);

  return (
    <>
      <Titulo>Obras</Titulo>
      {obras.length === 0 ? (
        <Vacio Icono={HardHat} titulo="Todavía no cargaste obras" texto="Creá una obra con su presupuesto y andá sumando los gastos.">
          <BotonNuevo forma="obra">
            <Plus aria-hidden size={21} /> Nueva obra
          </BotonNuevo>
        </Vacio>
      ) : (
        <>
          <BotonNuevo forma="gastoObra" className="boton mb-5 w-full">
            <Plus aria-hidden size={21} /> Agregar gasto de obra
          </BotonNuevo>
          <ul className="space-y-3">
            {obras.map((o) => (
              <li key={o.id}>
                <Link href={`/obras/${o.id}`} className="tarjeta block p-4 hover:bg-hundido">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-[1.25rem] leading-tight font-bold text-marino">{o.nombre}</h2>
                    {o.estado === "terminada" ? (
                      <span className="chip">Terminada</span>
                    ) : o.calc.excedida ? (
                      <span className="chip chip-rojo">Pasó el presupuesto</span>
                    ) : null}
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      ["Presupuesto", o.calc.presupuesto, "text-tinta"],
                      ["Gastado", o.calc.usado, "text-tinta"],
                      ["Disponible", o.calc.disponible, o.calc.disponible < 0 ? "text-rojo" : "text-verde"],
                    ].map(([t, v, color]) => (
                      <div key={t as string}>
                        <dt className="text-[0.82rem] text-tenue">{t}</dt>
                        <dd className={`cifra text-[0.98rem] font-bold ${color}`}>{plataCentavos(v as number, o.moneda)}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-3">
                    <Barrita porcentaje={o.calc.porcentaje} excedida={o.calc.excedida} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <BotonNuevo forma="obra" className="boton boton-suave">
              <Plus aria-hidden size={20} /> Nueva obra
            </BotonNuevo>
            <Descargar tipo="obras" />
          </div>
        </>
      )}
    </>
  );
}

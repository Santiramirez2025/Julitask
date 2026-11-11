import type { Metadata } from "next";
import { headers } from "next/headers";
import { desc, eq } from "drizzle-orm";
import { DatabaseBackup, LogOut } from "lucide-react";
import { db, registro } from "@/lib/db";
import { exigirUsuario, correoDisponible } from "@/lib/auth";
import { salir } from "@/lib/acciones/acceso";
import { enZona, fechaRelativa, hoy as fechaHoy } from "@/lib/fechas";
import { Titulo, Seccion } from "@/components/ui";
import { Copiar } from "@/components/Controles";
import { FormAvisos, FormClave, RegenerarCalendario } from "@/components/Ajustes";

export const metadata: Metadata = { title: "Ajustes" };

export default async function Ajustes() {
  const u = await exigirUsuario();
  const h = await headers();
  const base =
    process.env.APP_URL?.replace(/\/$/, "") || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const calendario = `${base}/api/calendario/${u.tokenCalendario}.ics`;
  const cambios = await db
    .select()
    .from(registro)
    .where(eq(registro.usuarioId, u.id))
    .orderBy(desc(registro.creadoEl))
    .limit(40);
  const hoy = fechaHoy();

  return (
    <>
      <Titulo detalle={u.email}>Ajustes</Titulo>

      <Seccion titulo="Qué avisos quiero recibir">
        <FormAvisos prefs={u.prefs} correoActivo={correoDisponible()} />
      </Seccion>

      <Seccion titulo="Ver mi agenda en el calendario del celular">
        <div className="tarjeta p-4">
          <p className="text-tenue">
            Copiá este enlace y agregalo en Google Calendar («Otros calendarios → Desde URL») o en el iPhone («Calendario → Agregar calendario suscrito»). Vas a ver tus reuniones, tareas y vencimientos, y el celular te avisa solo.
          </p>
          <p className="cifra mt-3 rounded-[12px] bg-hundido px-3 py-2.5 text-[0.85rem] break-all select-all">{calendario}</p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <Copiar texto={calendario}>Copiar enlace</Copiar>
            <RegenerarCalendario />
          </div>
          <p className="mt-3 text-[0.9rem] text-tenue">Quien tenga este enlace puede ver tu agenda. No lo compartas.</p>
        </div>
      </Seccion>

      <Seccion titulo="Mis datos">
        <div className="tarjeta p-4">
          <p className="text-tenue">
            Bajá una copia completa cuando quieras: un Excel con todo, las planillas por separado y los comprobantes y fotos originales.
          </p>
          <a href="/api/exportar/todo" download className="boton mt-3 w-full">
            <DatabaseBackup aria-hidden size={20} /> Exportar todos mis datos
          </a>
        </div>
      </Seccion>

      <Seccion titulo="Contraseña">
        <FormClave />
      </Seccion>

      <Seccion titulo="Últimos cambios">
        {cambios.length === 0 ? (
          <p className="tarjeta px-4 py-4 text-tenue">Todavía no hay cambios registrados.</p>
        ) : (
          <ul className="tarjeta divide-y divide-linea text-[0.95rem]">
            {cambios.map((c) => {
              const z = enZona(c.creadoEl);
              return (
                <li key={c.id} className="px-4 py-2.5">
                  <span className="font-semibold first-letter:uppercase">
                    {[c.accion, c.entidad].filter(Boolean).join(" ")}
                  </span>
                  {c.resumen && <span>: {c.resumen}</span>}
                  <span className="block text-[0.88rem] text-tenue">
                    {fechaRelativa(z.fecha, hoy)}, {z.hora}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Seccion>

      <form action={salir} className="mt-8">
        <button type="submit" className="boton boton-suave w-full">
          <LogOut aria-hidden size={20} /> Cerrar sesión
        </button>
      </form>
    </>
  );
}

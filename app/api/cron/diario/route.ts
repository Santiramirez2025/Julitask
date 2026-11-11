import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { db, usuarios, envios, recuperaciones } from "@/lib/db";
import { prefsCompletas, correoDisponible, type Usuario } from "@/lib/auth";
import { asegurarRecurrentes, datosHoy } from "@/lib/consultas";
import { enviarCorreo, plantilla, escaparHtml as esc } from "@/lib/correo";
import { diaSemana, enZona, fechaCorta, fechaLarga, hoy as fechaHoy, sumarDias } from "@/lib/fechas";
import { plata, plataCentavos, textoTotales } from "@/lib/dinero";
import { tablaPagos, tablaAgenda, tablaClientes, tablaInmuebles, tablasObras } from "@/lib/exportar/tablas";
import { aXLSX, nombreArchivo } from "@/lib/exportar/formatos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function autorizado(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secreto}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

const lista = (items: string[]) =>
  `<ul style="padding-left:20px;margin:6px 0 18px">${items.map((i) => `<li style="margin:4px 0">${i}</li>`).join("")}</ul>`;
const titulo = (t: string) => `<p style="margin:16px 0 0;font-weight:700;color:#14274A">${esc(t)}</p>`;

async function yaEnviado(uid: string, clave: string) {
  const [f] = await db.select({ id: envios.id }).from(envios)
    .where(and(eq(envios.usuarioId, uid), eq(envios.clave, clave))).limit(1);
  return Boolean(f);
}

async function correoDiario(u: Usuario, base: string) {
  const d = await datosHoy(u);
  const av = u.prefs.avisos;
  const bloques: string[] = [];
  if (d.reuniones.length)
    bloques.push(
      titulo("Reuniones") +
        lista(d.reuniones.map((r) => `${enZona(r.inicio).hora} — ${esc(r.persona ?? r.titulo)}${r.lugar ? `, ${esc(r.lugar)}` : ""}`)),
    );
  if (d.tareas.length) bloques.push(titulo("Tareas pendientes") + lista(d.tareas.slice(0, 12).map((t) => esc(t.titulo))));
  const pagosAviso = [...(av.pagos ? d.pagosPersonales : []), ...(av.impuestos ? d.impuestos : [])];
  if (pagosAviso.length)
    bloques.push(
      titulo("Pagos e impuestos") +
        lista(
          pagosAviso.slice(0, 15).map(
            (p) => `${esc(p.concepto)} — ${plata(p.importe, p.moneda)} — ${p.vence < d.hoy ? "<b>vencido</b> " : "vence "}${fechaCorta(p.vence)}`,
          ),
        ),
    );
  if (av.seguimientos && d.paraContactar.length)
    bloques.push(titulo("Clientes para contactar") + lista(d.paraContactar.slice(0, 12).map((c) => `${esc(c.nombre)}${c.interes ? ` — ${esc(c.interes)}` : ""}`)));
  if (av.obras && d.obrasExcedidas.length)
    bloques.push(
      titulo("Obras por encima del presupuesto") +
        lista(d.obrasExcedidas.map((o) => `${esc(o.nombre)} — ${plataCentavos(-o.calc.disponible, o.moneda)} de más`)),
    );
  if (!bloques.length) return false; // sin novedades no se manda nada
  return enviarCorreo({
    para: u.email,
    asunto: `Tu día: ${fechaLarga(d.hoy)}`,
    html: plantilla(
      `Buenos días, ${u.nombre.split(" ")[0]}`,
      bloques.join("") + `<p><a href="${base}" style="color:#14274A;font-weight:600">Abrir Julitask</a></p>`,
    ),
  });
}

async function correoSemanal(u: Usuario, base: string) {
  const d = await datosHoy({ ...u, prefs: { ...u.prefs, diasAnticipacion: 7 } });
  const pendientes = [...d.pagosPersonales, ...d.impuestos].sort((a, b) => a.vence.localeCompare(b.vence));
  const cuerpo =
    `<p>En lo que va del mes pagaste ${textoTotales(d.gastadoMes.personales)} entre gastos personales e impuestos y ${textoTotales(d.gastadoMes.obras)} en obras.</p>` +
    titulo("Vence en los próximos 7 días") +
    (pendientes.length
      ? lista(pendientes.slice(0, 20).map((p) => `${esc(p.concepto)} — ${plata(p.importe, p.moneda)} — ${p.vence < d.hoy ? "<b>vencido</b>" : fechaCorta(p.vence)}`))
      : "<p>Nada por vencer.</p>") +
    (d.obras.length
      ? titulo("Obras") + lista(d.obras.filter((o) => o.estado === "activa").map((o) => `${esc(o.nombre)} — ${o.calc.porcentaje}% del presupuesto usado`))
      : "") +
    (d.paraContactar.length ? titulo("Clientes para contactar") + lista(d.paraContactar.slice(0, 12).map((c) => esc(c.nombre))) : "") +
    `<p><a href="${base}" style="color:#14274A;font-weight:600">Abrir Julitask</a></p>`;

  let adjuntos;
  if (u.prefs.correo.copia) {
    const [tObras, tGastos] = await tablasObras(u.id);
    const xlsx = await aXLSX([
      await tablaPagos(u.id, "personal"), await tablaPagos(u.id, "impuesto"), await tablaAgenda(u.id),
      await tablaClientes(u.id), await tablaInmuebles(u.id), tObras, tGastos,
    ]);
    adjuntos = [{ nombre: nombreArchivo("copia-semanal", "xlsx"), contenido: xlsx }];
  }
  return enviarCorreo({
    para: u.email,
    asunto: `Resumen de la semana — ${fechaCorta(d.hoy)}`,
    html: plantilla("Resumen semanal", cuerpo),
    adjuntos,
  });
}

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const hoy = fechaHoy();
  const esLunes = diaSemana(hoy) === 0;
  const base = process.env.APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
  const informe = { usuarios: 0, recurrentesCreados: 0, diarios: 0, semanales: 0 };

  await db.delete(recuperaciones).where(lt(recuperaciones.expira, new Date(Date.now() - 86_400_000)));
  await db.delete(envios).where(lt(envios.creadoEl, new Date(Date.now() - 40 * 86_400_000)));

  for (const fila of await db.select().from(usuarios)) {
    informe.usuarios++;
    const u: Usuario = {
      id: fila.id, email: fila.email, nombre: fila.nombre, rol: fila.rol,
      prefs: prefsCompletas(fila.prefs), tokenCalendario: fila.tokenCalendario,
    };
    informe.recurrentesCreados += await asegurarRecurrentes(u.id);
    if (!correoDisponible()) continue;

    // La marca de "enviado" evita repetir el correo si el cron se dispara dos veces.
    if (u.prefs.correo.diario && !(await yaEnviado(u.id, `diario:${hoy}`))) {
      await db.insert(envios).values({ usuarioId: u.id, clave: `diario:${hoy}` });
      if (await correoDiario(u, base)) informe.diarios++;
    }
    const lunes = sumarDias(hoy, -diaSemana(hoy));
    if (esLunes && u.prefs.correo.semanal && !(await yaEnviado(u.id, `semanal:${lunes}`))) {
      await db.insert(envios).values({ usuarioId: u.id, clave: `semanal:${lunes}` });
      if (await correoSemanal(u, base)) informe.semanales++;
    }
  }
  return NextResponse.json({ ok: true, fecha: hoy, ...informe });
}

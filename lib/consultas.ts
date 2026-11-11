import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db, pagos, eventos, clientes, inmuebles, obras, gastosObra } from "./db";
import type { Usuario } from "./auth";
import { aInstante, hoy as fechaHoy, inicioMes, sumarDias, finMes } from "./fechas";
import { calcularObra, posiblesDuplicados, proximoVencimiento } from "./calculos";
import { sumarPorMoneda } from "./dinero";

/**
 * Pagos que se repiten: cuando el último de una serie ya se pagó o ya venció,
 * crea el siguiente. Así siempre hay un próximo vencimiento a la vista, y solo uno.
 */
export async function asegurarRecurrentes(uid: string) {
  return db.transaction(async (tx) => {
    // Un candado por usuario evita duplicados si dos pantallas cargan a la vez.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${uid}))`);
    const filas = await tx
      .select()
      .from(pagos)
      .where(and(eq(pagos.usuarioId, uid), isNotNull(pagos.serieId)))
      .orderBy(asc(pagos.vence), asc(pagos.creadoEl));
    if (!filas.length) return 0;

    const series = new Map<string, typeof filas>();
    for (const f of filas) series.set(f.serieId!, [...(series.get(f.serieId!) ?? []), f]);

    const hoy = fechaHoy();
    const nuevas: (typeof pagos.$inferInsert)[] = [];
    for (const serie of series.values()) {
      const primero = serie[0];
      const ultimo = serie[serie.length - 1];
      // Si el último fue borrado o ya no se repite, la serie quedó frenada a propósito.
      if (ultimo.borradoEl || ultimo.repite === "no") continue;
      let vence = ultimo.vence;
      let falta = Boolean(ultimo.pagadoEl) || vence < hoy;
      for (let i = 0; i < 24 && falta; i++) {
        const sig = proximoVencimiento(primero.vence, vence, ultimo.repite);
        if (!sig) break;
        vence = sig;
        falta = vence < hoy;
        nuevas.push({
          usuarioId: uid,
          tipo: ultimo.tipo,
          concepto: ultimo.concepto,
          categoria: ultimo.categoria,
          importe: ultimo.importe,
          moneda: ultimo.moneda,
          vence,
          medioPago: ultimo.medioPago,
          proveedor: ultimo.proveedor,
          repite: ultimo.repite,
          serieId: ultimo.serieId,
        });
      }
    }
    if (nuevas.length) await tx.insert(pagos).values(nuevas);
    return nuevas.length;
  });
}

export type OpcionesFormularios = {
  obras: { id: string; nombre: string; moneda: string }[];
  clientes: { id: string; nombre: string }[];
  inmuebles: { id: string; nombre: string }[];
};

export async function opcionesFormularios(uid: string): Promise<OpcionesFormularios> {
  const [o, c, i] = await Promise.all([
    db
      .select({ id: obras.id, nombre: obras.nombre, moneda: obras.moneda })
      .from(obras)
      .where(and(eq(obras.usuarioId, uid), isNull(obras.borradoEl)))
      .orderBy(asc(obras.estado), asc(obras.nombre)),
    db
      .select({ id: clientes.id, nombre: clientes.nombre })
      .from(clientes)
      .where(and(eq(clientes.usuarioId, uid), isNull(clientes.borradoEl)))
      .orderBy(asc(clientes.nombre)),
    db
      .select({ id: inmuebles.id, nombre: inmuebles.nombre })
      .from(inmuebles)
      .where(and(eq(inmuebles.usuarioId, uid), isNull(inmuebles.borradoEl)))
      .orderBy(asc(inmuebles.nombre)),
  ]);
  return { obras: o, clientes: c, inmuebles: i };
}

export async function obrasConTotales(uid: string) {
  const lista = await db
    .select()
    .from(obras)
    .where(and(eq(obras.usuarioId, uid), isNull(obras.borradoEl)))
    .orderBy(asc(obras.estado), asc(obras.nombre));
  if (!lista.length) return [];
  const gastos = await db
    .select()
    .from(gastosObra)
    .where(
      and(
        eq(gastosObra.usuarioId, uid),
        isNull(gastosObra.borradoEl),
        inArray(gastosObra.obraId, lista.map((o) => o.id)),
      ),
    );
  return lista.map((o) => ({
    ...o,
    calc: calcularObra(o, gastos.filter((g) => g.obraId === o.id)),
  }));
}

/** Todo lo que Julián necesita saber hoy. Lo usan Mi día, el asistente y el correo diario. */
export async function datosHoy(u: Usuario) {
  const hoy = fechaHoy();
  const dias = u.prefs.diasAnticipacion;
  const finDeHoy = aInstante(sumarDias(hoy, 1));
  const inicioDeHoy = aInstante(hoy);
  const horizonte = sumarDias(hoy, dias);
  const mesDesde = inicioMes(hoy);
  const mesHasta = finMes(hoy);
  const activos = (t: { usuarioId: PgColumn; borradoEl: PgColumn }) =>
    and(eq(t.usuarioId, u.id), isNull(t.borradoEl));

  const [agenda, pendientes, paraContactar, listaObras, pagadosMes, gastosMes, recientes, gastosRecientes] =
    await Promise.all([
      db
        .select()
        .from(eventos)
        .where(
          and(
            activos(eventos),
            or(
              // reuniones de hoy
              and(eq(eventos.tipo, "reunion"), gte(eventos.inicio, inicioDeHoy), lt(eventos.inicio, finDeHoy)),
              // tareas y recordatorios de hoy o atrasados, sin terminar
              and(ne(eventos.tipo, "reunion"), lt(eventos.inicio, finDeHoy), isNull(eventos.completadoEl)),
            ),
          ),
        )
        .orderBy(asc(eventos.inicio)),
      db
        .select()
        .from(pagos)
        .where(and(activos(pagos), isNull(pagos.pagadoEl), lte(pagos.vence, horizonte)))
        .orderBy(asc(pagos.vence)),
      db
        .select()
        .from(clientes)
        .where(
          and(activos(clientes), ne(clientes.estado, "cerrado"), lte(clientes.proximoSeguimiento, hoy)),
        )
        .orderBy(asc(clientes.proximoSeguimiento)),
      obrasConTotales(u.id),
      db
        .select({ importe: pagos.importe, moneda: pagos.moneda })
        .from(pagos)
        .where(and(activos(pagos), gte(pagos.pagadoEl, mesDesde), lte(pagos.pagadoEl, mesHasta))),
      db
        .select({ importe: gastosObra.importe, moneda: gastosObra.moneda })
        .from(gastosObra)
        .innerJoin(obras, eq(gastosObra.obraId, obras.id))
        .where(
          and(
            isNull(obras.borradoEl),
            activos(gastosObra),
            eq(gastosObra.pagado, true),
            gte(gastosObra.fecha, mesDesde),
            lte(gastosObra.fecha, mesHasta),
          ),
        ),
      db
        .select()
        .from(pagos)
        .where(and(activos(pagos), gte(pagos.vence, sumarDias(hoy, -45))))
        .orderBy(desc(pagos.vence))
        .limit(400),
      db
        .select({ g: gastosObra })
        .from(gastosObra)
        .innerJoin(obras, eq(gastosObra.obraId, obras.id))
        .where(and(isNull(obras.borradoEl), activos(gastosObra), gte(gastosObra.fecha, sumarDias(hoy, -45))))
        .limit(400),
    ]);

  const reuniones = agenda.filter((e) => e.tipo === "reunion");
  const tareas = agenda.filter((e) => e.tipo !== "reunion");
  const pagosPersonales = pendientes.filter((p) => p.tipo === "personal");
  const impuestos = pendientes.filter((p) => p.tipo === "impuesto");
  const vencidos = pendientes.filter((p) => p.vence < hoy);

  const duplicados = [
    ...posiblesDuplicados(
      recientes.map((p) => ({
        id: p.id, importe: p.importe, moneda: p.moneda, fecha: p.vence,
        texto: p.concepto, donde: p.tipo === "impuesto" ? "/impuestos" : "/pagos",
      })),
    ),
    ...posiblesDuplicados(
      gastosRecientes.map(({ g }) => ({
        id: g.id, importe: g.importe, moneda: g.moneda, fecha: g.fecha,
        texto: `${g.obraId} ${g.concepto} ${g.proveedor ?? ""}`, donde: `/obras/${g.obraId}`,
        concepto: g.concepto,
      })),
    ),
  ];

  return {
    hoy,
    reuniones,
    tareas,
    pagosPersonales,
    impuestos,
    vencidos,
    paraContactar,
    obras: listaObras,
    obrasExcedidas: listaObras.filter((o) => o.estado === "activa" && o.calc.excedida),
    duplicados,
    gastadoMes: {
      personales: sumarPorMoneda(pagadosMes),
      obras: sumarPorMoneda(gastosMes),
    },
  };
}

export type DatosHoy = Awaited<ReturnType<typeof datosHoy>>;

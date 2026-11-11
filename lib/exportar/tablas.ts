import "server-only";
import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db, pagos, eventos, clientes, inmuebles, obras, gastosObra, intereses, visitas } from "../db";
import { enZona, hoy as fechaHoy } from "../fechas";
import { estadoPago, calcularObra, enMonedaDeObra } from "../calculos";
import { ESTADOS_CLIENTE, ESTADOS_INMUEBLE, ESTADOS_OBRA, REPETICIONES, etiquetaDe } from "../entidades";
import { textoTotales, sumarPorMoneda, plataCentavos } from "../dinero";

export type Celda = string | number | null;
export type Columna = { titulo: string; ancho: number; tipo?: "texto" | "numero" | "fecha" };
export type Tabla = {
  /** Nombre corto, sirve de nombre de hoja y de archivo. */
  nombre: string;
  titulo: string;
  columnas: Columna[];
  filas: Celda[][];
  pie?: string[];
};

const ESTADO_PAGO = { pagado: "Pagado", vencido: "Vencido", "por-pagar": "Por pagar" };
const num = (v: string | null) => (v == null ? null : Number(v));

export async function tablaPagos(
  uid: string,
  tipo: "personal" | "impuesto",
  rango?: { desde: string; hasta: string },
): Promise<Tabla> {
  const hoy = fechaHoy();
  const filas = await db
    .select()
    .from(pagos)
    .where(
      and(
        eq(pagos.usuarioId, uid), eq(pagos.tipo, tipo), isNull(pagos.borradoEl),
        rango ? gte(pagos.vence, rango.desde) : undefined,
        rango ? lte(pagos.vence, rango.hasta) : undefined,
      ),
    )
    .orderBy(desc(pagos.vence));
  const pendientes = filas.filter((f) => !f.pagadoEl);
  const pagados = filas.filter((f) => f.pagadoEl);
  const esImpuesto = tipo === "impuesto";
  return {
    nombre: esImpuesto ? "Impuestos" : "Pagos",
    titulo: esImpuesto ? "Impuestos y vencimientos" : "Pagos personales",
    columnas: [
      { titulo: "Vence", ancho: 12, tipo: "fecha" },
      { titulo: esImpuesto ? "Impuesto" : "Concepto", ancho: 30 },
      { titulo: esImpuesto ? "Organismo" : "Categoría", ancho: 20 },
      ...(esImpuesto ? [{ titulo: "Período", ancho: 12 }] : [{ titulo: "A quién", ancho: 20 }]),
      { titulo: "Importe", ancho: 14, tipo: "numero" as const },
      { titulo: "Moneda", ancho: 8 },
      { titulo: "Estado", ancho: 11 },
      { titulo: "Pagado el", ancho: 12, tipo: "fecha" },
      { titulo: "Medio de pago", ancho: 16 },
      { titulo: "Se repite", ancho: 16 },
      { titulo: "Notas", ancho: 30 },
    ],
    filas: filas.map((f) => [
      f.vence, f.concepto, f.categoria, esImpuesto ? f.periodo : f.proveedor, num(f.importe), f.moneda,
      ESTADO_PAGO[estadoPago(f, hoy)], f.pagadoEl, f.medioPago,
      f.repite === "no" ? null : etiquetaDe(REPETICIONES, f.repite), f.notas,
    ]),
    pie: [
      `Pagado: ${textoTotales(sumarPorMoneda(pagados))}`,
      `Sin pagar: ${textoTotales(sumarPorMoneda(pendientes))}`,
    ],
  };
}

export async function tablaAgenda(uid: string): Promise<Tabla> {
  const filas = await db
    .select({ e: eventos, cliente: clientes.nombre })
    .from(eventos)
    .leftJoin(clientes, eq(eventos.clienteId, clientes.id))
    .where(and(eq(eventos.usuarioId, uid), isNull(eventos.borradoEl)))
    .orderBy(desc(eventos.inicio))
    .limit(5000);
  const TIPOS: Record<string, string> = { reunion: "Reunión", tarea: "Tarea", recordatorio: "Recordatorio" };
  return {
    nombre: "Agenda",
    titulo: "Agenda",
    columnas: [
      { titulo: "Día", ancho: 12, tipo: "fecha" },
      { titulo: "Hora", ancho: 7 },
      { titulo: "Tipo", ancho: 13 },
      { titulo: "Qué", ancho: 34 },
      { titulo: "Con quién", ancho: 22 },
      { titulo: "Lugar", ancho: 22 },
      { titulo: "Cliente", ancho: 22 },
      { titulo: "Estado", ancho: 11 },
      { titulo: "Notas", ancho: 30 },
    ],
    filas: filas.map(({ e, cliente }) => {
      const z = enZona(e.inicio);
      return [
        z.fecha, e.sinHora ? null : z.hora, TIPOS[e.tipo] ?? e.tipo,
        e.titulo || (e.persona ? `Reunión con ${e.persona}` : ""), e.persona, e.lugar, cliente,
        e.tipo === "reunion" ? null : e.completadoEl ? "Hecha" : "Pendiente", e.notas,
      ];
    }),
  };
}

export async function tablaClientes(uid: string): Promise<Tabla> {
  const filas = await db
    .select()
    .from(clientes)
    .where(and(eq(clientes.usuarioId, uid), isNull(clientes.borradoEl)))
    .orderBy(asc(clientes.nombre));
  const vinculos = filas.length
    ? await db
        .select({ clienteId: intereses.clienteId, nombre: inmuebles.nombre })
        .from(intereses)
        .innerJoin(inmuebles, eq(intereses.inmuebleId, inmuebles.id))
        .where(and(inArray(intereses.clienteId, filas.map((f) => f.id)), isNull(inmuebles.borradoEl)))
    : [];
  return {
    nombre: "Clientes",
    titulo: "Clientes",
    columnas: [
      { titulo: "Nombre", ancho: 26 },
      { titulo: "Etapa", ancho: 13 },
      { titulo: "Teléfono", ancho: 16 },
      { titulo: "Email", ancho: 26 },
      { titulo: "Qué busca", ancho: 30 },
      { titulo: "Presupuesto", ancho: 14, tipo: "numero" },
      { titulo: "Moneda", ancho: 8 },
      { titulo: "Última conversación", ancho: 14, tipo: "fecha" },
      { titulo: "Próximo seguimiento", ancho: 14, tipo: "fecha" },
      { titulo: "Inmuebles de interés", ancho: 30 },
      { titulo: "Notas", ancho: 30 },
    ],
    filas: filas.map((f) => [
      f.nombre, etiquetaDe(ESTADOS_CLIENTE, f.estado), f.whatsapp ?? f.telefono, f.email, f.interes,
      num(f.presupuesto), f.presupuesto ? f.presupuestoMoneda : null, f.ultimaConversacion,
      f.proximoSeguimiento,
      vinculos.filter((v) => v.clienteId === f.id).map((v) => v.nombre).join(", ") || null, f.notas,
    ]),
  };
}

export async function tablaInmuebles(uid: string): Promise<Tabla> {
  const filas = await db
    .select()
    .from(inmuebles)
    .where(and(eq(inmuebles.usuarioId, uid), isNull(inmuebles.borradoEl)))
    .orderBy(asc(inmuebles.nombre));
  const ids = filas.map((f) => f.id);
  const [vinculos, vis] = ids.length
    ? await Promise.all([
        db
          .select({ inmuebleId: intereses.inmuebleId, nombre: clientes.nombre })
          .from(intereses)
          .innerJoin(clientes, eq(intereses.clienteId, clientes.id))
          .where(and(inArray(intereses.inmuebleId, ids), isNull(clientes.borradoEl))),
        db
          .select({ inmuebleId: visitas.inmuebleId })
          .from(visitas)
          .where(and(inArray(visitas.inmuebleId, ids), isNull(visitas.borradoEl))),
      ])
    : [[], []];
  return {
    nombre: "Inmuebles",
    titulo: "Inventario de inmuebles",
    columnas: [
      { titulo: "Nombre o código", ancho: 24 },
      { titulo: "Tipo", ancho: 14 },
      { titulo: "Estado", ancho: 12 },
      { titulo: "Dirección", ancho: 30 },
      { titulo: "Precio", ancho: 14, tipo: "numero" },
      { titulo: "Moneda", ancho: 8 },
      { titulo: "Superficie m²", ancho: 12, tipo: "numero" },
      { titulo: "Propietario", ancho: 22 },
      { titulo: "Interesados", ancho: 28 },
      { titulo: "Visitas y consultas", ancho: 10, tipo: "numero" },
      { titulo: "Observaciones", ancho: 30 },
    ],
    filas: filas.map((f) => [
      f.nombre, f.tipo, etiquetaDe(ESTADOS_INMUEBLE, f.estado), f.direccion, num(f.precio),
      f.precio ? f.moneda : null, num(f.superficie), f.propietario,
      vinculos.filter((v) => v.inmuebleId === f.id).map((v) => v.nombre).join(", ") || null,
      vis.filter((v) => v.inmuebleId === f.id).length, f.observaciones,
    ]),
  };
}

/** Dos tablas: resumen por obra y detalle de gastos. Si se pasa obraId, solo esa obra. */
export async function tablasObras(uid: string, obraId?: string): Promise<Tabla[]> {
  const lista = await db
    .select()
    .from(obras)
    .where(
      and(eq(obras.usuarioId, uid), isNull(obras.borradoEl), obraId ? eq(obras.id, obraId) : undefined),
    )
    .orderBy(asc(obras.nombre));
  const gastos = lista.length
    ? await db
        .select()
        .from(gastosObra)
        .where(
          and(
            eq(gastosObra.usuarioId, uid), isNull(gastosObra.borradoEl),
            inArray(gastosObra.obraId, lista.map((o) => o.id)),
          ),
        )
        .orderBy(desc(gastosObra.fecha))
    : [];
  const porId = new Map(lista.map((o) => [o.id, o]));

  const resumen: Tabla = {
    nombre: "Obras",
    titulo: "Resumen de obras",
    columnas: [
      { titulo: "Obra", ancho: 26 },
      { titulo: "Estado", ancho: 11 },
      { titulo: "Moneda", ancho: 8 },
      { titulo: "Presupuesto", ancho: 15, tipo: "numero" },
      { titulo: "Pagado", ancho: 15, tipo: "numero" },
      { titulo: "Sin pagar", ancho: 15, tipo: "numero" },
      { titulo: "Disponible", ancho: 15, tipo: "numero" },
      { titulo: "% usado", ancho: 9, tipo: "numero" },
      { titulo: "Gastos sin convertir", ancho: 24 },
    ],
    filas: lista.map((o) => {
      const c = calcularObra(o, gastos.filter((g) => g.obraId === o.id));
      return [
        o.nombre, etiquetaDe(ESTADOS_OBRA, o.estado), o.moneda, c.presupuesto / 100, c.pagado / 100,
        c.comprometido / 100, c.disponible / 100, c.porcentaje,
        c.haySinConvertir ? textoTotales(c.sinConvertir) : null,
      ];
    }),
  };

  const detalle: Tabla = {
    nombre: "Gastos de obra",
    titulo: obraId && lista[0] ? `Gastos de la obra ${lista[0].nombre}` : "Gastos de obras",
    columnas: [
      { titulo: "Fecha", ancho: 12, tipo: "fecha" },
      { titulo: "Obra", ancho: 22 },
      { titulo: "Concepto", ancho: 28 },
      { titulo: "Categoría", ancho: 15 },
      { titulo: "Proveedor", ancho: 22 },
      { titulo: "Importe", ancho: 14, tipo: "numero" },
      { titulo: "Moneda", ancho: 8 },
      { titulo: "Estado", ancho: 12 },
      { titulo: "Dólar usado", ancho: 11, tipo: "numero" },
      { titulo: "Fecha del dólar", ancho: 12, tipo: "fecha" },
      { titulo: "En moneda de la obra", ancho: 16, tipo: "numero" },
    ],
    filas: gastos.map((g) => {
      const o = porId.get(g.obraId)!;
      const conv = enMonedaDeObra(g, o.moneda);
      return [
        g.fecha, o.nombre, g.concepto, g.categoria, g.proveedor, num(g.importe), g.moneda,
        g.pagado ? "Pagado" : "Sin pagar", num(g.tipoCambio), g.tipoCambioFecha,
        conv === null ? null : conv / 100,
      ];
    }),
    pie:
      obraId && lista[0]
        ? (() => {
            const c = calcularObra(lista[0], gastos);
            const m = lista[0].moneda;
            return [
              `Presupuesto: ${plataCentavos(c.presupuesto, m)}`,
              `Pagado: ${plataCentavos(c.pagado, m)} · Sin pagar: ${plataCentavos(c.comprometido, m)}`,
              `Disponible: ${plataCentavos(c.disponible, m)}`,
            ];
          })()
        : undefined,
  };
  return [resumen, detalle];
}

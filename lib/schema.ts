import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  numeric,
  date,
  timestamp,
  jsonb,
  index,
  primaryKey,
  customType,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

const id = () => uuid("id").primaryKey().defaultRandom();
const creadoEl = () =>
  timestamp("creado_el", { withTimezone: true }).notNull().defaultNow();
const borradoEl = () => timestamp("borrado_el", { withTimezone: true });
const dueno = () =>
  uuid("usuario_id")
    .notNull()
    .references(() => usuarios.id, { onDelete: "cascade" });
const importe = (nombre: string) => numeric(nombre, { precision: 14, scale: 2 });
const fecha = (nombre: string) => date(nombre, { mode: "string" });

export type Prefs = {
  diasAnticipacion: number;
  avisos: {
    impuestos: boolean;
    pagos: boolean;
    seguimientos: boolean;
    obras: boolean;
    duplicados: boolean;
  };
  correo: { diario: boolean; semanal: boolean; copia: boolean };
};

export const PREFS_INICIALES: Prefs = {
  diasAnticipacion: 5,
  avisos: {
    impuestos: true,
    pagos: true,
    seguimientos: true,
    obras: true,
    duplicados: true,
  },
  correo: { diario: true, semanal: true, copia: false },
};

export const usuarios = pgTable("usuarios", {
  id: id(),
  email: text("email").notNull().unique(),
  nombre: text("nombre").notNull(),
  claveHash: text("clave_hash").notNull(),
  // dueno | colaborador | contador — hoy solo se usa "dueno"
  rol: text("rol").notNull().default("dueno"),
  prefs: jsonb("prefs").$type<Prefs>().notNull().default(PREFS_INICIALES),
  tokenCalendario: text("token_calendario").notNull().unique(),
  versionSesion: integer("version_sesion").notNull().default(1),
  intentosFallidos: integer("intentos_fallidos").notNull().default(0),
  bloqueadoHasta: timestamp("bloqueado_hasta", { withTimezone: true }),
  creadoEl: creadoEl(),
});

export const recuperaciones = pgTable("recuperaciones", {
  id: id(),
  usuarioId: dueno(),
  tokenHash: text("token_hash").notNull().unique(),
  expira: timestamp("expira", { withTimezone: true }).notNull(),
  usadoEl: timestamp("usado_el", { withTimezone: true }),
});

// Pagos personales e impuestos comparten tabla: son obligaciones con vencimiento.
export const pagos = pgTable(
  "pagos",
  {
    id: id(),
    usuarioId: dueno(),
    tipo: text("tipo").notNull().default("personal"), // personal | impuesto
    concepto: text("concepto").notNull(),
    categoria: text("categoria").notNull(),
    importe: importe("importe").notNull(),
    moneda: text("moneda").notNull().default("ARS"),
    vence: fecha("vence").notNull(),
    pagadoEl: fecha("pagado_el"),
    medioPago: text("medio_pago"),
    proveedor: text("proveedor"),
    periodo: text("periodo"),
    notas: text("notas"),
    repite: text("repite").notNull().default("no"),
    serieId: uuid("serie_id"),
    borradoEl: borradoEl(),
    creadoEl: creadoEl(),
  },
  (t) => [
    index("pagos_usuario_vence").on(t.usuarioId, t.vence),
    index("pagos_serie").on(t.serieId),
  ],
);

export const clientes = pgTable(
  "clientes",
  {
    id: id(),
    usuarioId: dueno(),
    nombre: text("nombre").notNull(),
    telefono: text("telefono"),
    whatsapp: text("whatsapp"),
    email: text("email"),
    interes: text("interes"),
    presupuesto: importe("presupuesto"),
    presupuestoMoneda: text("presupuesto_moneda").notNull().default("USD"),
    estado: text("estado").notNull().default("nuevo"),
    ultimaConversacion: fecha("ultima_conversacion"),
    proximoSeguimiento: fecha("proximo_seguimiento"),
    notas: text("notas"),
    borradoEl: borradoEl(),
    creadoEl: creadoEl(),
  },
  (t) => [index("clientes_usuario").on(t.usuarioId)],
);

export const eventos = pgTable(
  "eventos",
  {
    id: id(),
    usuarioId: dueno(),
    tipo: text("tipo").notNull(), // reunion | tarea | recordatorio
    titulo: text("titulo").notNull(),
    inicio: timestamp("inicio", { withTimezone: true }).notNull(),
    sinHora: boolean("sin_hora").notNull().default(false),
    duracionMin: integer("duracion_min").notNull().default(60),
    persona: text("persona"),
    lugar: text("lugar"),
    notas: text("notas"),
    clienteId: uuid("cliente_id").references(() => clientes.id, {
      onDelete: "set null",
    }),
    completadoEl: timestamp("completado_el", { withTimezone: true }),
    borradoEl: borradoEl(),
    creadoEl: creadoEl(),
  },
  (t) => [index("eventos_usuario_inicio").on(t.usuarioId, t.inicio)],
);

export const inmuebles = pgTable(
  "inmuebles",
  {
    id: id(),
    usuarioId: dueno(),
    nombre: text("nombre").notNull(),
    direccion: text("direccion"),
    tipo: text("tipo").notNull().default("Casa"),
    precio: importe("precio"),
    moneda: text("moneda").notNull().default("USD"),
    superficie: numeric("superficie", { precision: 12, scale: 2 }),
    propietario: text("propietario"),
    estado: text("estado").notNull().default("disponible"),
    observaciones: text("observaciones"),
    borradoEl: borradoEl(),
    creadoEl: creadoEl(),
  },
  (t) => [index("inmuebles_usuario").on(t.usuarioId)],
);

export const intereses = pgTable(
  "intereses",
  {
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    inmuebleId: uuid("inmueble_id")
      .notNull()
      .references(() => inmuebles.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.clienteId, t.inmuebleId] })],
);

export const visitas = pgTable(
  "visitas",
  {
    id: id(),
    usuarioId: dueno(),
    inmuebleId: uuid("inmueble_id")
      .notNull()
      .references(() => inmuebles.id, { onDelete: "cascade" }),
    clienteId: uuid("cliente_id").references(() => clientes.id, {
      onDelete: "set null",
    }),
    tipo: text("tipo").notNull().default("visita"), // visita | consulta
    fecha: fecha("fecha").notNull(),
    notas: text("notas"),
    borradoEl: borradoEl(),
    creadoEl: creadoEl(),
  },
  (t) => [index("visitas_inmueble").on(t.inmuebleId)],
);

export const obras = pgTable(
  "obras",
  {
    id: id(),
    usuarioId: dueno(),
    nombre: text("nombre").notNull(),
    direccion: text("direccion"),
    presupuesto: importe("presupuesto").notNull().default("0"),
    moneda: text("moneda").notNull().default("ARS"),
    estado: text("estado").notNull().default("activa"),
    notas: text("notas"),
    borradoEl: borradoEl(),
    creadoEl: creadoEl(),
  },
  (t) => [index("obras_usuario").on(t.usuarioId)],
);

export const gastosObra = pgTable(
  "gastos_obra",
  {
    id: id(),
    usuarioId: dueno(),
    obraId: uuid("obra_id")
      .notNull()
      .references(() => obras.id, { onDelete: "cascade" }),
    fecha: fecha("fecha").notNull(),
    concepto: text("concepto").notNull(),
    proveedor: text("proveedor"),
    importe: importe("importe").notNull(),
    moneda: text("moneda").notNull().default("ARS"),
    categoria: text("categoria").notNull().default("Materiales"),
    pagado: boolean("pagado").notNull().default(true),
    // Conversión explícita a la moneda de la obra: valor de 1 USD en ARS y su fecha.
    tipoCambio: numeric("tipo_cambio", { precision: 14, scale: 4 }),
    tipoCambioFecha: fecha("tipo_cambio_fecha"),
    borradoEl: borradoEl(),
    creadoEl: creadoEl(),
  },
  (t) => [index("gastos_obra_obra").on(t.obraId, t.fecha)],
);

export const archivos = pgTable(
  "archivos",
  {
    id: id(),
    usuarioId: dueno(),
    entidad: text("entidad").notNull(), // pago | gasto | cliente | inmueble
    entidadId: uuid("entidad_id").notNull(),
    nombre: text("nombre").notNull(),
    mime: text("mime").notNull(),
    tamano: integer("tamano").notNull(),
    esFoto: boolean("es_foto").notNull().default(false),
    datos: bytea("datos").notNull(),
    creadoEl: creadoEl(),
  },
  (t) => [index("archivos_entidad").on(t.entidad, t.entidadId)],
);

export const registro = pgTable(
  "registro",
  {
    id: id(),
    usuarioId: dueno(),
    accion: text("accion").notNull(),
    entidad: text("entidad").notNull(),
    entidadId: uuid("entidad_id"),
    resumen: text("resumen").notNull(),
    creadoEl: creadoEl(),
  },
  (t) => [index("registro_usuario").on(t.usuarioId, t.creadoEl)],
);

export const envios = pgTable(
  "envios",
  {
    id: id(),
    usuarioId: dueno(),
    clave: text("clave").notNull(), // p. ej. diario:2026-11-11 — evita correos repetidos
    creadoEl: creadoEl(),
  },
  (t) => [index("envios_clave").on(t.usuarioId, t.clave)],
);

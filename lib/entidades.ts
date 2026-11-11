// Definición única de cada formulario: la usan la pantalla (para dibujarlo)
// y el servidor (para validar). Así no hay dos listas de campos que mantener.

import { esFecha } from "./fechas";
import { leerImporte } from "./dinero";

export type TipoCampo =
  | "texto"
  | "notas"
  | "importe" // incluye selector de moneda (campoMoneda)
  | "fecha"
  | "hora"
  | "opciones"
  | "telefono"
  | "email"
  | "numero"
  | "si-no"
  | "obra"
  | "cliente"
  | "inmueble";

export type Opcion = { valor: string; etiqueta: string };

export type Campo = {
  nombre: string;
  etiqueta: string;
  tipo: TipoCampo;
  requerido?: boolean;
  /** Va dentro de "Más detalles" para que el formulario abra corto. */
  detalle?: boolean;
  opciones?: readonly Opcion[];
  campoMoneda?: string;
  inicial?: string | "hoy";
  ayuda?: string;
  ejemplo?: string;
};

export type Forma =
  | "pago"
  | "impuesto"
  | "tarea"
  | "reunion"
  | "recordatorio"
  | "cliente"
  | "inmueble"
  | "obra"
  | "gastoObra"
  | "visita";

const ops = (...v: string[]): Opcion[] => v.map((x) => ({ valor: x, etiqueta: x }));

export const CATEGORIAS_PAGO = ops(
  "Vivienda", "Servicios", "Vehículos", "Tarjetas", "Salud", "Suscripciones", "Otros",
);
export const CATEGORIAS_IMPUESTO = ops(
  "ARCA", "Rentas Córdoba", "Tasas municipales", "Impuestos inmobiliarios", "Automotores",
  "Otras obligaciones",
);
export const CATEGORIAS_OBRA = ops(
  "Materiales", "Mano de obra", "Transporte", "Honorarios", "Equipamiento", "Imprevistos", "Otros",
);
export const MEDIOS_PAGO = ops(
  "Transferencia", "Efectivo", "Débito", "Crédito", "Débito automático",
);
export const REPETICIONES: Opcion[] = [
  { valor: "no", etiqueta: "No se repite" },
  { valor: "mensual", etiqueta: "Todos los meses" },
  { valor: "bimestral", etiqueta: "Cada 2 meses" },
  { valor: "trimestral", etiqueta: "Cada 3 meses" },
  { valor: "anual", etiqueta: "Una vez por año" },
];
export const MESES_REPETICION: Record<string, number> = {
  mensual: 1,
  bimestral: 2,
  trimestral: 3,
  anual: 12,
};
export const ESTADOS_CLIENTE: Opcion[] = [
  { valor: "nuevo", etiqueta: "Nuevo" },
  { valor: "contactado", etiqueta: "Contactado" },
  { valor: "visito", etiqueta: "Visitó" },
  { valor: "negociacion", etiqueta: "Negociación" },
  { valor: "cerrado", etiqueta: "Cerrado" },
];
export const ESTADOS_INMUEBLE: Opcion[] = [
  { valor: "disponible", etiqueta: "Disponible" },
  { valor: "reservado", etiqueta: "Reservado" },
  { valor: "vendido", etiqueta: "Vendido" },
  { valor: "alquilado", etiqueta: "Alquilado" },
  { valor: "pausado", etiqueta: "Pausado" },
];
export const TIPOS_INMUEBLE = ops(
  "Casa", "Departamento", "Lote", "Local", "Oficina", "Campo", "Cochera", "Otro",
);
export const ESTADOS_OBRA: Opcion[] = [
  { valor: "activa", etiqueta: "En curso" },
  { valor: "terminada", etiqueta: "Terminada" },
];
const DURACIONES: Opcion[] = [
  { valor: "30", etiqueta: "30 minutos" },
  { valor: "60", etiqueta: "1 hora" },
  { valor: "90", etiqueta: "1 hora y media" },
  { valor: "120", etiqueta: "2 horas" },
];
const MONEDA_OCULTA = { tipo: "opciones" as const, opciones: ops("ARS", "USD") };

export function etiquetaDe(opciones: readonly Opcion[], valor: string | null | undefined) {
  return opciones.find((o) => o.valor === valor)?.etiqueta ?? valor ?? "";
}

export type DefForma = {
  titulo: string; // "Nuevo gasto"
  tituloEditar: string;
  guardar: string; // texto del botón
  guardado: string; // aviso al terminar
  campos: Campo[];
  adjuntos?: "pago" | "gasto";
};

export const FORMAS: Record<Forma, DefForma> = {
  pago: {
    titulo: "Nuevo gasto",
    tituloEditar: "Editar gasto",
    guardar: "Guardar gasto",
    guardado: "Gasto guardado",
    adjuntos: "pago",
    campos: [
      { nombre: "concepto", etiqueta: "¿Qué es?", tipo: "texto", requerido: true, ejemplo: "Luz, expensas, seguro…" },
      { nombre: "importe", etiqueta: "Importe", tipo: "importe", campoMoneda: "moneda", requerido: true },
      { nombre: "moneda", etiqueta: "Moneda", ...MONEDA_OCULTA, inicial: "ARS" },
      { nombre: "vence", etiqueta: "Vence", tipo: "fecha", requerido: true, inicial: "hoy" },
      { nombre: "categoria", etiqueta: "Categoría", tipo: "opciones", opciones: CATEGORIAS_PAGO, inicial: "Otros" },
      { nombre: "repite", etiqueta: "¿Se repite?", tipo: "opciones", opciones: REPETICIONES, inicial: "no", detalle: true },
      { nombre: "proveedor", etiqueta: "A quién se paga", tipo: "texto", detalle: true },
      { nombre: "medioPago", etiqueta: "Medio de pago", tipo: "opciones", opciones: [{ valor: "", etiqueta: "Sin definir" }, ...MEDIOS_PAGO], detalle: true },
      { nombre: "notas", etiqueta: "Notas", tipo: "notas", detalle: true },
    ],
  },
  impuesto: {
    titulo: "Nuevo impuesto",
    tituloEditar: "Editar impuesto",
    guardar: "Guardar impuesto",
    guardado: "Impuesto guardado",
    adjuntos: "pago",
    campos: [
      { nombre: "concepto", etiqueta: "¿Qué impuesto es?", tipo: "texto", requerido: true, ejemplo: "Monotributo, inmobiliario, patente…" },
      { nombre: "importe", etiqueta: "Importe", tipo: "importe", campoMoneda: "moneda", requerido: true },
      { nombre: "moneda", etiqueta: "Moneda", ...MONEDA_OCULTA, inicial: "ARS" },
      { nombre: "vence", etiqueta: "Vence", tipo: "fecha", requerido: true, inicial: "hoy" },
      { nombre: "categoria", etiqueta: "Organismo", tipo: "opciones", opciones: CATEGORIAS_IMPUESTO, inicial: "ARCA" },
      { nombre: "periodo", etiqueta: "Período", tipo: "texto", detalle: true, ejemplo: "11/2026, cuota 5…" },
      { nombre: "repite", etiqueta: "¿Se repite?", tipo: "opciones", opciones: REPETICIONES, inicial: "no", detalle: true },
      { nombre: "notas", etiqueta: "Notas", tipo: "notas", detalle: true },
    ],
  },
  tarea: {
    titulo: "Nueva tarea",
    tituloEditar: "Editar tarea",
    guardar: "Guardar tarea",
    guardado: "Tarea guardada",
    campos: [
      { nombre: "titulo", etiqueta: "¿Qué hay que hacer?", tipo: "texto", requerido: true },
      { nombre: "fecha", etiqueta: "¿Cuándo?", tipo: "fecha", requerido: true, inicial: "hoy" },
      { nombre: "hora", etiqueta: "Hora", tipo: "hora", detalle: true },
      { nombre: "clienteId", etiqueta: "Cliente", tipo: "cliente", detalle: true },
      { nombre: "notas", etiqueta: "Notas", tipo: "notas", detalle: true },
    ],
  },
  reunion: {
    titulo: "Nueva reunión",
    tituloEditar: "Editar reunión",
    guardar: "Guardar reunión",
    guardado: "Reunión guardada",
    campos: [
      { nombre: "persona", etiqueta: "¿Con quién?", tipo: "texto", requerido: true },
      { nombre: "fecha", etiqueta: "Día", tipo: "fecha", requerido: true, inicial: "hoy" },
      { nombre: "hora", etiqueta: "Hora", tipo: "hora", requerido: true, inicial: "10:00" },
      { nombre: "lugar", etiqueta: "Lugar", tipo: "texto" },
      { nombre: "titulo", etiqueta: "Motivo", tipo: "texto", detalle: true },
      { nombre: "duracionMin", etiqueta: "Duración", tipo: "opciones", opciones: DURACIONES, inicial: "60", detalle: true },
      { nombre: "clienteId", etiqueta: "Cliente", tipo: "cliente", detalle: true },
      { nombre: "notas", etiqueta: "Notas", tipo: "notas", detalle: true },
    ],
  },
  recordatorio: {
    titulo: "Nuevo recordatorio",
    tituloEditar: "Editar recordatorio",
    guardar: "Guardar recordatorio",
    guardado: "Recordatorio guardado",
    campos: [
      { nombre: "titulo", etiqueta: "¿Qué querés recordar?", tipo: "texto", requerido: true },
      { nombre: "fecha", etiqueta: "Día", tipo: "fecha", requerido: true, inicial: "hoy" },
      { nombre: "hora", etiqueta: "Hora", tipo: "hora", detalle: true },
      { nombre: "notas", etiqueta: "Notas", tipo: "notas", detalle: true },
    ],
  },
  cliente: {
    titulo: "Nuevo cliente",
    tituloEditar: "Editar cliente",
    guardar: "Guardar cliente",
    guardado: "Cliente guardado",
    campos: [
      { nombre: "nombre", etiqueta: "Nombre", tipo: "texto", requerido: true },
      { nombre: "telefono", etiqueta: "Teléfono", tipo: "telefono", ayuda: "Con característica, sin 0 ni 15. Sirve para WhatsApp." },
      { nombre: "interes", etiqueta: "¿Qué busca?", tipo: "texto", ejemplo: "Casa 3 dormitorios, lote para invertir…" },
      { nombre: "proximoSeguimiento", etiqueta: "Volver a contactar el", tipo: "fecha", detalle: true },
      { nombre: "presupuesto", etiqueta: "Presupuesto", tipo: "importe", campoMoneda: "presupuestoMoneda", detalle: true },
      { nombre: "presupuestoMoneda", etiqueta: "Moneda", ...MONEDA_OCULTA, inicial: "USD" },
      { nombre: "estado", etiqueta: "Etapa", tipo: "opciones", opciones: ESTADOS_CLIENTE, inicial: "nuevo", detalle: true },
      { nombre: "email", etiqueta: "Email", tipo: "email", detalle: true },
      { nombre: "whatsapp", etiqueta: "WhatsApp (si es otro número)", tipo: "telefono", detalle: true },
      { nombre: "ultimaConversacion", etiqueta: "Última conversación", tipo: "fecha", detalle: true },
      { nombre: "notas", etiqueta: "Notas", tipo: "notas", detalle: true },
    ],
  },
  inmueble: {
    titulo: "Nuevo inmueble",
    tituloEditar: "Editar inmueble",
    guardar: "Guardar inmueble",
    guardado: "Inmueble guardado",
    campos: [
      { nombre: "nombre", etiqueta: "Nombre o código", tipo: "texto", requerido: true, ejemplo: "Casa Palermo, Lote 14…" },
      { nombre: "direccion", etiqueta: "Dirección", tipo: "texto" },
      { nombre: "tipo", etiqueta: "Tipo", tipo: "opciones", opciones: TIPOS_INMUEBLE, inicial: "Casa" },
      { nombre: "precio", etiqueta: "Precio", tipo: "importe", campoMoneda: "moneda" },
      { nombre: "moneda", etiqueta: "Moneda", ...MONEDA_OCULTA, inicial: "USD" },
      { nombre: "estado", etiqueta: "Estado", tipo: "opciones", opciones: ESTADOS_INMUEBLE, inicial: "disponible", detalle: true },
      { nombre: "superficie", etiqueta: "Superficie (m²)", tipo: "numero", detalle: true },
      { nombre: "propietario", etiqueta: "Propietario", tipo: "texto", detalle: true },
      { nombre: "observaciones", etiqueta: "Observaciones", tipo: "notas", detalle: true },
    ],
  },
  obra: {
    titulo: "Nueva obra",
    tituloEditar: "Editar obra",
    guardar: "Guardar obra",
    guardado: "Obra guardada",
    campos: [
      { nombre: "nombre", etiqueta: "Nombre de la obra", tipo: "texto", requerido: true, ejemplo: "Villa Nueva, Centro…" },
      { nombre: "presupuesto", etiqueta: "Presupuesto", tipo: "importe", campoMoneda: "moneda", requerido: true },
      { nombre: "moneda", etiqueta: "Moneda", ...MONEDA_OCULTA, inicial: "ARS" },
      { nombre: "direccion", etiqueta: "Dirección", tipo: "texto", detalle: true },
      { nombre: "estado", etiqueta: "Estado", tipo: "opciones", opciones: ESTADOS_OBRA, inicial: "activa", detalle: true },
      { nombre: "notas", etiqueta: "Notas", tipo: "notas", detalle: true },
    ],
  },
  gastoObra: {
    titulo: "Nuevo gasto de obra",
    tituloEditar: "Editar gasto de obra",
    guardar: "Guardar gasto",
    guardado: "Gasto de obra guardado",
    adjuntos: "gasto",
    campos: [
      { nombre: "obraId", etiqueta: "Obra", tipo: "obra", requerido: true },
      { nombre: "concepto", etiqueta: "¿En qué se gastó?", tipo: "texto", requerido: true, ejemplo: "Cemento, electricista…" },
      { nombre: "importe", etiqueta: "Importe", tipo: "importe", campoMoneda: "moneda", requerido: true },
      { nombre: "moneda", etiqueta: "Moneda", ...MONEDA_OCULTA, inicial: "ARS" },
      { nombre: "categoria", etiqueta: "Categoría", tipo: "opciones", opciones: CATEGORIAS_OBRA, inicial: "Materiales" },
      { nombre: "pagado", etiqueta: "Ya está pagado", tipo: "si-no", inicial: "si", ayuda: "Desmarcalo si es un compromiso que todavía no pagaste." },
      { nombre: "fecha", etiqueta: "Fecha", tipo: "fecha", requerido: true, inicial: "hoy", detalle: true },
      { nombre: "proveedor", etiqueta: "Proveedor", tipo: "texto", detalle: true },
      { nombre: "tipoCambio", etiqueta: "Valor del dólar usado", tipo: "numero", detalle: true, ayuda: "Solo si la moneda del gasto es distinta a la de la obra. Sin este dato, el gasto se muestra aparte y no se suma al presupuesto." },
      { nombre: "tipoCambioFecha", etiqueta: "Fecha de ese valor", tipo: "fecha", detalle: true },
    ],
  },
  visita: {
    titulo: "Registrar visita o consulta",
    tituloEditar: "Editar visita",
    guardar: "Guardar",
    guardado: "Registro guardado",
    campos: [
      { nombre: "inmuebleId", etiqueta: "Inmueble", tipo: "inmueble", requerido: true },
      { nombre: "tipo", etiqueta: "¿Qué fue?", tipo: "opciones", opciones: [{ valor: "visita", etiqueta: "Visita" }, { valor: "consulta", etiqueta: "Consulta" }], inicial: "visita" },
      { nombre: "fecha", etiqueta: "Fecha", tipo: "fecha", requerido: true, inicial: "hoy" },
      { nombre: "clienteId", etiqueta: "Cliente", tipo: "cliente" },
      { nombre: "notas", etiqueta: "Notas", tipo: "notas" },
    ],
  },
};

export const ES_FORMA = (v: unknown): v is Forma =>
  typeof v === "string" && Object.prototype.hasOwnProperty.call(FORMAS, v);

export type Valor = string | number | boolean | null;
export type Validacion =
  | { ok: true; valores: Record<string, Valor> }
  | { ok: false; errores: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const esId = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

const LARGO_MAX = { texto: 200, notas: 4000 };

/** Valida en el servidor los datos crudos (texto) de un formulario. */
export function validar(forma: Forma, crudo: Record<string, unknown>): Validacion {
  const errores: Record<string, string> = {};
  const valores: Record<string, Valor> = {};

  for (const c of FORMAS[forma].campos) {
    const bruto = crudo[c.nombre];
    const s = typeof bruto === "string" ? bruto.trim() : bruto == null ? "" : String(bruto).trim();

    if (c.tipo === "si-no") {
      valores[c.nombre] = s === "si" || s === "true";
      continue;
    }
    if (s === "") {
      if (c.requerido) errores[c.nombre] = "Falta completar este dato.";
      valores[c.nombre] = null;
      continue;
    }
    switch (c.tipo) {
      case "texto":
      case "telefono":
        if (s.length > LARGO_MAX.texto) errores[c.nombre] = "Es demasiado largo.";
        valores[c.nombre] = s;
        break;
      case "notas":
        if (s.length > LARGO_MAX.notas) errores[c.nombre] = "Es demasiado largo.";
        valores[c.nombre] = s;
        break;
      case "email":
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) || s.length > 200)
          errores[c.nombre] = "Ese email no parece válido.";
        valores[c.nombre] = s.toLowerCase();
        break;
      case "importe": {
        const n = leerImporte(s);
        if (n === null || n < 0 || n > 999_999_999_999)
          errores[c.nombre] = "Escribí solo el número. Ejemplo: 85.000";
        else if (c.requerido && n === 0) errores[c.nombre] = "El importe no puede ser cero.";
        valores[c.nombre] = n === null ? null : n.toFixed(2);
        break;
      }
      case "numero": {
        const n = leerImporte(s);
        if (n === null || n <= 0 || n > 999_999_999)
          errores[c.nombre] = "Escribí solo el número.";
        valores[c.nombre] = n === null ? null : String(n);
        break;
      }
      case "fecha":
        if (!esFecha(s)) errores[c.nombre] = "Esa fecha no es válida.";
        valores[c.nombre] = s;
        break;
      case "hora":
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) errores[c.nombre] = "Esa hora no es válida.";
        valores[c.nombre] = s;
        break;
      case "opciones":
        if (!c.opciones?.some((o) => o.valor === s)) errores[c.nombre] = "Elegí una opción de la lista.";
        valores[c.nombre] = s;
        break;
      case "obra":
      case "cliente":
      case "inmueble":
        if (!esId(s)) errores[c.nombre] = "Elegí una opción de la lista.";
        valores[c.nombre] = s;
        break;
    }
  }

  if (forma === "gastoObra") {
    if (valores.tipoCambio && !valores.tipoCambioFecha)
      errores.tipoCambioFecha = "Indicá de qué fecha es ese valor del dólar.";
    if (!valores.tipoCambio) valores.tipoCambioFecha = null;
  }

  return Object.keys(errores).length ? { ok: false, errores } : { ok: true, valores };
}

/** Normaliza un teléfono argentino para abrir WhatsApp (wa.me). */
export function numeroWhatsApp(telefono: string | null | undefined) {
  if (!telefono) return null;
  let n = telefono.replace(/\D/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.startsWith("54")) {
    n = n.slice(2);
    if (n.startsWith("9")) n = n.slice(1);
  }
  if (n.startsWith("0")) n = n.slice(1);
  if (n.length < 8) return null;
  if (n.length === 10) return `549${n}`;
  // Formatos con 15 intercalado (ej. 353 15 4222575) u otros países: se deja como está.
  return n.length > 10 ? n : `549${n}`;
}

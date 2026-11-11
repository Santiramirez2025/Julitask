// Todas las fechas "de calendario" (vencimientos, seguimientos) son texto AAAA-MM-DD.
// Los horarios (reuniones) se guardan en UTC y se muestran en la zona de la app.

export const ZONA = process.env.NEXT_PUBLIC_ZONA_HORARIA || "America/Argentina/Cordoba";

const partes = new Intl.DateTimeFormat("en-CA", {
  timeZone: ZONA,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function descomponer(d: Date) {
  const p: Record<string, string> = {};
  for (const x of partes.formatToParts(d)) p[x.type] = x.value;
  return p;
}

/** Fecha y hora locales de un instante. */
export function enZona(d: Date) {
  const p = descomponer(d);
  return {
    fecha: `${p.year}-${p.month}-${p.day}`,
    hora: `${p.hour}:${p.minute}`,
  };
}

export function hoy(ahora = new Date()) {
  return enZona(ahora).fecha;
}

function desfaseMs(d: Date) {
  const p = descomponer(d);
  const comoUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return comoUTC - Math.floor(d.getTime() / 1000) * 1000;
}

/** Convierte fecha local (AAAA-MM-DD) + hora (HH:MM) en un instante UTC. */
export function aInstante(fecha: string, hora = "00:00") {
  const [a, m, d] = fecha.split("-").map(Number);
  const [h, mi] = hora.split(":").map(Number);
  const supuesto = Date.UTC(a, m - 1, d, h, mi);
  const primero = supuesto - desfaseMs(new Date(supuesto));
  // Segunda pasada por si el desfase cambia justo ese día.
  return new Date(supuesto - desfaseMs(new Date(primero)));
}

function utc(fecha: string) {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function sumarDias(fecha: string, n: number) {
  const d = utc(fecha);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/** Suma meses respetando fin de mes: 31/01 + 1 mes = 28/02. */
export function sumarMeses(fecha: string, n: number) {
  const [a, m, d] = fecha.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  const anio = Math.floor(total / 12);
  const mes = total % 12;
  const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(anio, mes, Math.min(d, ultimo))));
}

export function diasEntre(desde: string, hasta: string) {
  return Math.round((utc(hasta).getTime() - utc(desde).getTime()) / 86_400_000);
}

/** 0 = lunes … 6 = domingo */
export function diaSemana(fecha: string) {
  return (utc(fecha).getUTCDay() + 6) % 7;
}

export function inicioSemana(fecha: string) {
  return sumarDias(fecha, -diaSemana(fecha));
}

export function inicioMes(fecha: string) {
  return fecha.slice(0, 8) + "01";
}

export function finMes(fecha: string) {
  return sumarDias(sumarMeses(inicioMes(fecha), 1), -1);
}

export function esFecha(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = utc(v);
  return !isNaN(d.getTime()) && iso(d) === v;
}

const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const DIAS_CORTOS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export const NOMBRES_DIAS = DIAS;
export const NOMBRES_DIAS_CORTOS = DIAS_CORTOS;
export const NOMBRES_MESES = MESES;

/** "mié 11 nov" */
export function fechaCorta(fecha: string) {
  const [, m, d] = fecha.split("-").map(Number);
  return `${DIAS_CORTOS[diaSemana(fecha)]} ${d} ${MESES[m - 1].slice(0, 3)}`;
}

/** "miércoles 11 de noviembre" */
export function fechaLarga(fecha: string) {
  const [, m, d] = fecha.split("-").map(Number);
  return `${DIAS[diaSemana(fecha)]} ${d} de ${MESES[m - 1]}`;
}

/** "11/11/2026" */
export function fechaNumerica(fecha: string) {
  const [a, m, d] = fecha.split("-");
  return `${d}/${m}/${a}`;
}

export function mesYAnio(fecha: string) {
  const [a, m] = fecha.split("-").map(Number);
  return `${MESES[m - 1]} ${a}`;
}

/** "Hoy", "Mañana", "Ayer", "en 5 días", "hace 3 días" o la fecha corta. */
export function fechaRelativa(fecha: string, ref = hoy()) {
  const n = diasEntre(ref, fecha);
  if (n === 0) return "Hoy";
  if (n === 1) return "Mañana";
  if (n === -1) return "Ayer";
  if (n > 1 && n <= 6) return `En ${n} días`;
  if (n < -1 && n >= -30) return `Hace ${-n} días`;
  return fechaCorta(fecha);
}

export function saludo(ahora = new Date()) {
  const h = Number(enZona(ahora).hora.slice(0, 2));
  if (h >= 5 && h < 13) return "Buenos días";
  if (h >= 13 && h < 20) return "Buenas tardes";
  return "Buenas noches";
}

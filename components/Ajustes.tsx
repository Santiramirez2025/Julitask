"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useApp } from "./Proveedor";
import { guardarPrefs, cambiarClave, regenerarCalendario } from "@/lib/acciones/datos";
import type { Prefs } from "@/lib/schema";

function Interruptor({
  etiqueta,
  detalle,
  activo,
  deshabilitado,
  alCambiar,
}: {
  etiqueta: string;
  detalle?: string;
  activo: boolean;
  deshabilitado?: boolean;
  alCambiar: (v: boolean) => void;
}) {
  return (
    <label className={`flex min-h-[3.4rem] items-center justify-between gap-4 px-4 py-2.5 ${deshabilitado ? "opacity-60" : "cursor-pointer"}`}>
      <span>
        <span className="block font-semibold">{etiqueta}</span>
        {detalle && <span className="block text-[0.9rem] text-tenue">{detalle}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={activo}
        disabled={deshabilitado}
        onChange={(e) => alCambiar(e.target.checked)}
      />
      <span
        aria-hidden
        className={`relative h-8 w-[3.4rem] shrink-0 rounded-full transition-colors peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-marino-2 ${activo ? "bg-verde" : "bg-[#8b929c]"}`}
      >
        <span className={`absolute top-1 size-6 rounded-full bg-white transition-[left] ${activo ? "left-[1.65rem]" : "left-1"}`} />
      </span>
    </label>
  );
}

export function FormAvisos({ prefs: iniciales, correoActivo }: { prefs: Prefs; correoActivo: boolean }) {
  const app = useApp();
  const [prefs, setPrefs] = useState(iniciales);
  const [, iniciar] = useTransition();

  // Cada cambio se guarda solo: no hay botón "Guardar" que olvidarse de tocar.
  const aplicar = (nuevas: Prefs) => {
    const antes = prefs;
    setPrefs(nuevas);
    iniciar(async () => {
      const r = await guardarPrefs(nuevas);
      if (!r.ok) {
        setPrefs(antes);
        app.avisar(r.error ?? "No se pudo guardar.", { error: true });
      }
    });
  };
  const aviso = (k: keyof Prefs["avisos"]) => (v: boolean) => aplicar({ ...prefs, avisos: { ...prefs.avisos, [k]: v } });
  const correo = (k: keyof Prefs["correo"]) => (v: boolean) => aplicar({ ...prefs, correo: { ...prefs.correo, [k]: v } });

  return (
    <>
      <div className="tarjeta divide-y divide-linea">
        <Interruptor etiqueta="Impuestos por vencer" activo={prefs.avisos.impuestos} alCambiar={aviso("impuestos")} />
        <Interruptor etiqueta="Pagos por vencer y vencidos" activo={prefs.avisos.pagos} alCambiar={aviso("pagos")} />
        <Interruptor etiqueta="Clientes para contactar" activo={prefs.avisos.seguimientos} alCambiar={aviso("seguimientos")} />
        <Interruptor etiqueta="Obras que pasan el presupuesto" activo={prefs.avisos.obras} alCambiar={aviso("obras")} />
        <Interruptor etiqueta="Gastos que parecen repetidos" activo={prefs.avisos.duplicados} alCambiar={aviso("duplicados")} />
        <label className="flex min-h-[3.4rem] items-center justify-between gap-4 px-4 py-2.5">
          <span className="font-semibold">Avisarme con anticipación de</span>
          <select
            className="campo w-auto min-w-[7.5rem]"
            value={prefs.diasAnticipacion}
            onChange={(e) => aplicar({ ...prefs, diasAnticipacion: Number(e.target.value) })}
          >
            {[1, 2, 3, 5, 7, 10, 15].map((n) => (
              <option key={n} value={n}>{n === 1 ? "1 día" : `${n} días`}</option>
            ))}
          </select>
        </label>
      </div>

      <h3 className="mt-5 mb-2 font-bold text-marino">Por correo</h3>
      {!correoActivo && (
        <p className="mb-2 rounded-[14px] bg-ambar-claro px-3.5 py-2.5 text-[0.95rem] text-ambar">
          El envío de correos todavía no está activado. Los avisos se ven igual dentro de la app.
        </p>
      )}
      <div className="tarjeta divide-y divide-linea">
        <Interruptor etiqueta="Resumen cada mañana" detalle="Solo si hay algo para hacer ese día." activo={prefs.correo.diario} deshabilitado={!correoActivo} alCambiar={correo("diario")} />
        <Interruptor etiqueta="Resumen de la semana" detalle="Los lunes." activo={prefs.correo.semanal} deshabilitado={!correoActivo} alCambiar={correo("semanal")} />
        <Interruptor etiqueta="Copia de mis datos" detalle="Un Excel con todo, adjunto al resumen del lunes." activo={prefs.correo.copia} deshabilitado={!correoActivo} alCambiar={correo("copia")} />
      </div>
    </>
  );
}

export function FormClave() {
  const app = useApp();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [error, setError] = useState("");
  const [pendiente, iniciar] = useTransition();
  return (
    <form
      className="tarjeta space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        iniciar(async () => {
          const r = await cambiarClave(actual, nueva);
          if (r.ok) {
            setActual("");
            setNueva("");
            app.avisar(r.mensaje);
          } else setError(r.error ?? "No se pudo cambiar.");
        });
      }}
    >
      <div>
        <label htmlFor="clave-actual" className="mb-1.5 block font-bold">Contraseña actual</label>
        <input id="clave-actual" type="password" autoComplete="current-password" className="campo" value={actual} onChange={(e) => setActual(e.target.value)} />
      </div>
      <div>
        <label htmlFor="clave-nueva" className="mb-1.5 block font-bold">Contraseña nueva</label>
        <input id="clave-nueva" type="password" autoComplete="new-password" className="campo" aria-describedby="clave-ayuda" value={nueva} onChange={(e) => setNueva(e.target.value)} />
        <p id="clave-ayuda" className="mt-1.5 text-[0.9rem] text-tenue">Al menos 10 caracteres. Las otras sesiones abiertas se cierran.</p>
      </div>
      {error && <p role="alert" className="font-semibold text-rojo">{error}</p>}
      <button type="submit" disabled={pendiente || !actual || !nueva} className="boton">
        {pendiente ? "Cambiando…" : "Cambiar contraseña"}
      </button>
    </form>
  );
}

export function RegenerarCalendario() {
  const app = useApp();
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      className="boton boton-suave boton-chico"
      onClick={async () => {
        if (!(await app.confirmar("El enlace actual deja de funcionar y vas a tener que volver a agregar el calendario. ¿Generar uno nuevo?", "Sí, generar")))
          return;
        iniciar(async () => {
          const r = await regenerarCalendario();
          app.avisar(r.ok ? r.mensaje : (r.error ?? "No se pudo generar."), { error: !r.ok });
        });
      }}
    >
      <RefreshCw aria-hidden size={17} /> Generar enlace nuevo
    </button>
  );
}

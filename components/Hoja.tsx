"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Panel que sube desde abajo. Usa <dialog>, así el navegador se encarga del foco,
 * de la tecla Escape y de que el lector de pantalla no lea lo que queda detrás.
 */
export function Hoja({
  abierta,
  alCerrar,
  titulo,
  children,
  pie,
}: {
  abierta: boolean;
  alCerrar: () => void;
  titulo: string;
  children: ReactNode;
  pie?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierta && !d.open) d.showModal();
    if (!abierta && d.open) d.close();
  }, [abierta]);

  return (
    <dialog
      ref={ref}
      className="hoja"
      aria-label={titulo}
      onClose={alCerrar}
      onCancel={(e) => {
        e.preventDefault();
        alCerrar();
      }}
      onClick={(e) => {
        if (e.target === ref.current) alCerrar();
      }}
    >
      {abierta && (
        <>
          <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-2">
            <h2 className="text-[1.35rem] font-bold text-marino">{titulo}</h2>
            <button
              type="button"
              onClick={alCerrar}
              aria-label="Cerrar"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-hundido text-tinta hover:bg-linea"
            >
              <X aria-hidden size={22} />
            </button>
          </div>
          <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-2 pb-5">{children}</div>
          {pie && (
            <div className="border-t border-linea bg-papel px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {pie}
            </div>
          )}
        </>
      )}
    </dialog>
  );
}

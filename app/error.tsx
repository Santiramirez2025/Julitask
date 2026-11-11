"use client";

import { useEffect } from "react";

export default function ErrorGeneral({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <h1 className="text-[1.9rem] leading-tight font-bold text-marino">Algo falló al cargar</h1>
      <p className="mt-2 text-tenue">Tus datos están guardados. Probá de nuevo; si sigue pasando, revisá tu conexión.</p>
      {error.digest && <p className="mt-2 text-[0.85rem] text-tenue">Código: {error.digest}</p>}
      <button type="button" onClick={reset} className="boton mt-6">Probar de nuevo</button>
    </main>
  );
}

"use client";

import { useActionState } from "react";
import Link from "next/link";
import { entrar, pedirRecuperacion, restablecer, type EstadoAcceso } from "@/lib/acciones/acceso";

function Mensajes({ estado }: { estado: EstadoAcceso }) {
  return (
    <>
      {estado?.error && (
        <p role="alert" className="rounded-[14px] bg-rojo-claro px-3.5 py-2.5 font-semibold text-rojo">{estado.error}</p>
      )}
      {estado?.aviso && (
        <p role="status" className="rounded-[14px] bg-verde-claro px-3.5 py-2.5 font-semibold text-verde">{estado.aviso}</p>
      )}
    </>
  );
}

export function FormEntrar() {
  const [estado, accion, pendiente] = useActionState(entrar, undefined);
  return (
    <form action={accion} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block font-bold">Email</label>
        <input id="email" name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" required className="campo" />
      </div>
      <div>
        <label htmlFor="clave" className="mb-1.5 block font-bold">Contraseña</label>
        <input id="clave" name="clave" type="password" autoComplete="current-password" required className="campo" />
      </div>
      <Mensajes estado={estado} />
      <button type="submit" disabled={pendiente} className="boton w-full">
        {pendiente ? "Entrando…" : "Entrar"}
      </button>
      <p className="text-center">
        <Link href="/recuperar" className="inline-flex min-h-11 items-center font-bold text-marino underline">
          Olvidé mi contraseña
        </Link>
      </p>
    </form>
  );
}

export function FormRecuperar() {
  const [estado, accion, pendiente] = useActionState(pedirRecuperacion, undefined);
  return (
    <form action={accion} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block font-bold">Tu email</label>
        <input id="email" name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" required className="campo" />
      </div>
      <Mensajes estado={estado} />
      <button type="submit" disabled={pendiente} className="boton w-full">
        {pendiente ? "Enviando…" : "Mandarme el enlace"}
      </button>
      <p className="text-center">
        <Link href="/entrar" className="inline-flex min-h-11 items-center font-bold text-marino underline">Volver a entrar</Link>
      </p>
    </form>
  );
}

export function FormRestablecer({ token }: { token: string }) {
  const [estado, accion, pendiente] = useActionState(restablecer, undefined);
  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="clave" className="mb-1.5 block font-bold">Contraseña nueva</label>
        <input id="clave" name="clave" type="password" autoComplete="new-password" required minLength={10} aria-describedby="ayuda" className="campo" />
        <p id="ayuda" className="mt-1.5 text-[0.9rem] text-tenue">Al menos 10 caracteres.</p>
      </div>
      <Mensajes estado={estado} />
      <button type="submit" disabled={pendiente} className="boton w-full">
        {pendiente ? "Guardando…" : "Guardar y entrar"}
      </button>
    </form>
  );
}

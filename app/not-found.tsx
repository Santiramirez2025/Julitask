import Link from "next/link";

export default function NoEncontrado() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <h1 className="text-[1.9rem] leading-tight font-bold text-marino">Esto no existe o se borró</h1>
      <p className="mt-2 text-tenue">Puede que el enlace esté viejo.</p>
      <Link href="/" className="boton mt-6">Ir al inicio</Link>
    </main>
  );
}

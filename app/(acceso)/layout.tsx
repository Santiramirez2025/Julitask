export default function AccesoLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <p className="mb-8 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/iconos/icono-192.png" alt="" width={52} height={52} className="rounded-[14px]" />
        <span className="text-[1.5rem] font-bold text-marino">Julitask</span>
      </p>
      {children}
    </main>
  );
}

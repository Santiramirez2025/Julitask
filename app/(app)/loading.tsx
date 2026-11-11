export default function Cargando() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="space-y-4 pt-2">
      <div className="h-9 w-1/2 animate-pulse rounded-xl bg-hundido" />
      <div className="h-28 animate-pulse rounded-[22px] bg-hundido" />
      <div className="h-20 animate-pulse rounded-[22px] bg-hundido" />
      <div className="h-20 animate-pulse rounded-[22px] bg-hundido" />
    </div>
  );
}

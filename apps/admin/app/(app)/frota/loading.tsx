/** Esqueleto da frota. Com 250 aparelhos a lista não chega instantânea. */
function Bloco({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-2 ${className}`} />;
}

export default function CarregandoFrota() {
  return (
    <div className="mx-auto max-w-6xl">
      <Bloco className="h-7 w-40" />
      <Bloco className="mt-4 h-9 w-64" />
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <Bloco className="h-24" />
        <Bloco className="h-24" />
        <Bloco className="h-24" />
        <Bloco className="h-24" />
      </div>
      <Bloco className="mt-6 h-64" />
    </div>
  );
}

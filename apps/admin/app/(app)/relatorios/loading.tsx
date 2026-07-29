/**
 * Esqueleto enquanto o relatório é montado.
 *
 * O relatório é a tela mais pesada do painel: uma função no banco que cruza
 * quatro visões, mais as listas dos filtros. Sem isto, clicar "Relatórios" ou
 * trocar o período congelava a tela anterior por segundos, sem sinal nenhum — e
 * numa demonstração a pessoa clica de novo achando que não pegou.
 */
function Bloco({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-2 ${className}`} />;
}

export default function CarregandoRelatorios() {
  return (
    <div className="mx-auto max-w-6xl">
      <Bloco className="h-7 w-40" />
      <Bloco className="mt-2 h-4 w-64" />

      <div className="mt-6 flex gap-3">
        <Bloco className="h-9 flex-1" />
        <Bloco className="h-9 flex-1" />
        <Bloco className="h-9 flex-1" />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Bloco className="h-28" />
        <Bloco className="h-28" />
        <Bloco className="h-28" />
        <Bloco className="h-28" />
      </div>

      <Bloco className="mt-8 h-6 w-28" />
      <Bloco className="mt-3 h-40" />
      <Bloco className="mt-8 h-6 w-28" />
      <Bloco className="mt-3 h-40" />
    </div>
  );
}

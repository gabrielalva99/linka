/**
 * Esqueleto da visão geral.
 *
 * O DEFEITO QUE ISTO CONSERTA. Esta é a tela que mais consulta o banco (dez
 * consultas, mais os alertas de toda a frota) e era a única das pesadas SEM
 * esqueleto — Dispositivos e Relatórios já tinham. Sem ele, o Next segura a
 * tela anterior inteira, sem mexer um pixel, até a nova ficar pronta no
 * servidor. O relato do Gabriel foi literal: "clico em Visão geral e nada
 * acontece". Não era o clique falhando nem o link errado; era a tela mais
 * pesada do painel sem nenhum sinal de que estava vindo, enquanto as outras
 * respondiam na hora e faziam parecer que só esta estava quebrada.
 *
 * Espelha o formato real da tela — três cartões de contagem e os blocos por
 * loja — para o conteúdo entrar no lugar onde o esqueleto já estava, em vez de
 * a página saltar quando chega.
 */
function Bloco({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-2 ${className}`} />;
}

export default function CarregandoVisaoGeral() {
  return (
    <div className="mx-auto max-w-4xl">
      <Bloco className="h-7 w-56" />

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Bloco className="h-24" />
        <Bloco className="h-24" />
        <Bloco className="h-24" />
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <Bloco className="h-40" />
        <Bloco className="h-32" />
      </div>

      <Bloco className="mt-6 h-28" />
    </div>
  );
}

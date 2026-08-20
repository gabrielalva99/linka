import Link from "next/link";
import { redirect } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { getSessionContext } from "@/lib/auth";
import { ROLE_LABELS } from "@linka/shared";
import { LinkaLogo } from "../linka-logo";
import { NavLink } from "./nav-link";
import { TenantSwitcher } from "./tenant-switcher";
import { MenuMobile } from "./menu-mobile";
import { getActiveTenant, listTenants } from "@/lib/tenant";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  const [clientes, ativo] = await Promise.all([listTenants(), getActiveTenant()]);

  const t = getMessages();
  const roleLabel = ctx.isSuperadmin
    ? ROLE_LABELS.superadmin
    : (ROLE_LABELS[ctx.memberships[0]?.role ?? "client"] ?? "—");

  const nav = [
    { label: t.nav.dashboard, href: "/" },
    { label: t.nav.fleet, href: "/dispositivos" },
    { label: t.nav.campaigns, href: "/campanhas" },
    { label: t.nav.reports, href: "/relatorios" },
    { label: t.nav.library, href: "/biblioteca" },
    { label: t.nav.chains, href: "/redes" },
    { label: t.nav.stores, href: "/lojas" },
  ];
  // Acesso só aparece para quem pode conceder acesso. Menu com item que leva a
  // uma tela recusada é pior do que menu sem o item.
  const ehAgencia = ctx?.memberships.some((m) => m.role === "agency") ?? false;
  if (ctx?.isSuperadmin || ehAgencia) {
    nav.push({ label: t.nav.users, href: "/usuarios" });
  }
  // A lista de clientes é da plataforma. Para quem é de uma marca, esta tela não
  // deveria existir nem como ideia — ele tem um cliente, e é o dele.
  if (ctx?.isSuperadmin) {
    nav.push({ label: "Clientes", href: "/clientes" });
  }

  return (
    <div className="flex min-h-full flex-1">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface p-4 sm:flex">
        {/* Logotipo da marca no lugar do texto. Largura fixa e altura
            automática: o arquivo é o mesmo entregue pelo design, sem recorte. */}
        {/* O logotipo LEVA para a visao geral. E onde a pessoa tenta clicar
            antes de procurar o item no menu, e ate agora nao acontecia nada. */}
        <Link href="/" className="mb-8 block" aria-label="Visao geral">
          <LinkaLogo className="h-5 w-auto" />
        </Link>
        <nav className="flex flex-col gap-1">
          {nav.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* `relative` ancora o menu de celular, que abre logo abaixo desta
            barra. */}
        <header className="relative flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <MenuMobile itens={nav} />
            {/* Em tela estreita o logotipo assume o papel do menu lateral, que
                nao existe nessa largura: e o caminho curto de volta ao inicio. */}
            <Link href="/" className="sm:hidden" aria-label="Visao geral">
              <LinkaLogo className="h-5 w-auto" />
            </Link>
            {/* Papel e e-mail saem em tela estreita: sao identificacao, nao
                navegacao, e ocupavam o espaco de quem precisa se mover. */}
            <span className="hidden text-sm text-muted sm:inline">{roleLabel}</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Em qual cliente estamos. Só existe para quem opera a plataforma e
                enxerga mais de um — para o usuário de uma marca não há escolha a
                fazer, e o seletor só criaria a impressão de que há. */}
            {clientes.length > 1 && (
              <TenantSwitcher clientes={clientes} atual={ativo?.id ?? null} />
            )}
            <span className="hidden text-sm sm:inline">{ctx.email}</span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:bg-surface-2"
              >
                {t.dashboard.signout}
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}

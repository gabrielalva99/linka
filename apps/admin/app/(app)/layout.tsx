import Image from "next/image";
import { redirect } from "next/navigation";
import { getMessages } from "@/lib/i18n";
import { getSessionContext } from "@/lib/auth";
import { ROLE_LABELS } from "@linka/shared";
import { NavLink } from "./nav-link";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  const t = getMessages();
  const roleLabel = ctx.isSuperadmin
    ? ROLE_LABELS.superadmin
    : (ROLE_LABELS[ctx.memberships[0]?.role ?? "client"] ?? "—");

  const nav = [
    { label: t.nav.dashboard, href: "/" },
    { label: t.nav.fleet, href: "/frota" },
    { label: t.nav.campaigns, href: "/campanhas" },
    { label: t.nav.library, href: "/biblioteca" },
    { label: t.nav.chains, href: "/redes" },
    { label: t.nav.stores, href: "/lojas" },
  ];

  return (
    <div className="flex min-h-full flex-1">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface p-4 sm:flex">
        {/* Logotipo da marca no lugar do texto. Largura fixa e altura
            automática: o arquivo é o mesmo entregue pelo design, sem recorte. */}
        <div className="mb-8">
          <Image
            src="/linka-logo.png"
            alt={t.app.name}
            width={1645}
            height={531}
            priority
            className="h-6 w-auto"
          />
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map((item) => (
            <NavLink key={item.href} href={item.href} label={item.label} />
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line px-6 py-3">
          <span className="text-sm text-muted">{roleLabel}</span>
          <div className="flex items-center gap-3">
            <span className="text-sm">{ctx.email}</span>
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

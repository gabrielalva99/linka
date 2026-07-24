import { getMessages } from "@/lib/i18n";
import { getSessionContext } from "@/lib/auth";
import { ROLE_LABELS } from "@linka/shared";

export default async function DashboardPage() {
  const ctx = await getSessionContext();
  const t = getMessages();

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-semibold">
        {t.dashboard.welcome}
        {ctx?.fullName ? `, ${ctx.fullName}` : ""}
      </h1>

      {ctx?.isSuperadmin ? (
        <p className="mt-2 text-sm text-muted">{t.dashboard.superadminNote}</p>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-sm font-medium text-muted">{t.dashboard.role}</h2>
          <p className="mt-1 text-lg">
            {ctx?.isSuperadmin
              ? ROLE_LABELS.superadmin
              : (ROLE_LABELS[ctx?.memberships[0]?.role ?? "client"] ?? "—")}
          </p>
        </section>

        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-sm font-medium text-muted">{t.dashboard.tenants}</h2>
          {ctx && ctx.memberships.length > 0 ? (
            <ul className="mt-1 flex flex-col gap-1">
              {ctx.memberships.map((m) => (
                <li key={m.tenant_id} className="text-lg">
                  {m.tenant_name ?? m.tenant_id}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted">
              {ctx?.isSuperadmin ? "—" : t.dashboard.noTenants}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { getActiveTenant } from "@/lib/tenant";
import { getMessages } from "@/lib/i18n";
import { ROLE_LABELS, type UserRole } from "@linka/shared";
import { InviteForm } from "./invite-form";
import { RevokeButton } from "./revoke-button";

type Row = {
  user_id: string;
  role: Exclude<UserRole, "superadmin">;
  profiles: { full_name: string | null; email: string | null } | null;
};

/**
 * Quem tem acesso ao painel, e com que alcance.
 *
 * A tela é restrita a quem pode conceder acesso. Não é para esconder
 * informação: é que uma tela cheia de botões que o banco vai recusar ensina a
 * pessoa a desconfiar do painel.
 */
export default async function UsuariosPage() {
  const ctx = await getSessionContext();
  const tenant = await getActiveTenant();
  const t = getMessages();

  const ehAgencia = ctx?.memberships.some((m) => m.role === "agency") ?? false;
  const podeConvidar = (ctx?.isSuperadmin ?? false) || ehAgencia;
  if (!podeConvidar) redirect("/");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, role, profiles(full_name, email)")
    .eq("tenant_id", tenant?.id ?? "");

  const membros = (data ?? []) as unknown as Row[];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold">{t.users.title}</h1>
      <p className="mt-1 text-sm text-muted">
        {t.users.subtitle.replace("{cliente}", tenant?.name ?? "")}
      </p>

      <h2 className="mt-8 text-sm font-medium text-muted">{t.users.inviteTitle}</h2>
      <InviteForm podeConcederAgencia={ctx?.isSuperadmin ?? false} />

      <h2 className="mt-8 text-sm font-medium text-muted">{t.users.current}</h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-line">
        {error ? (
          <p className="bg-surface px-4 py-6 text-center text-sm text-warning">
            {t.users.readFailed}
          </p>
        ) : membros.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">{t.users.person}</th>
                <th className="px-4 py-2 font-medium">{t.users.access}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {membros.map((m) => (
                <tr key={m.user_id} className="bg-surface">
                  <td className="px-4 py-3">
                    <span className="block font-medium">
                      {m.profiles?.full_name ?? m.profiles?.email ?? m.user_id}
                    </span>
                    {m.profiles?.full_name && m.profiles?.email && (
                      <span className="block text-xs text-muted">{m.profiles.email}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{ROLE_LABELS[m.role]}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {/* Ninguém tira o próprio acesso e fica de fora do painel. */}
                    {m.user_id !== ctx?.userId && (
                      <RevokeButton
                        userId={m.user_id}
                        tenantId={tenant?.id ?? ""}
                        nome={m.profiles?.full_name ?? m.profiles?.email ?? ""}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="bg-surface px-4 py-6 text-center text-sm text-muted">
            {t.users.empty}
          </p>
        )}
      </div>

      <p className="mt-4 text-xs text-muted">{t.users.roleHint}</p>
    </div>
  );
}

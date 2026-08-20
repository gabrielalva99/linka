import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { UserRole } from "@linka/shared";

export type TenantMembership = {
  tenant_id: string;
  role: Exclude<UserRole, "superadmin">;
  tenant_name: string | null;
};

export type SessionContext = {
  userId: string;
  email: string | null;
  fullName: string | null;
  isSuperadmin: boolean;
  memberships: TenantMembership[];
};

/**
 * Contexto do usuário logado (servidor). Retorna null se não houver sessão.
 * Lê perfil (is_superadmin) e vínculos com tenants — respeitando RLS.
 *
 * `cache` DEDUPLICA POR REQUISIÇÃO. Esta função faz três idas em sequência
 * (validar a sessão, ler o perfil, ler os vínculos) e era chamada pelo menos
 * duas vezes para desenhar uma tela — uma no layout, outra na página, mais as
 * checagens de permissão. Seis viagens ao banco para responder a mesma
 * pergunta, uma esperando a outra. Com o cache, a primeira paga e as demais
 * pegam o resultado pronto; a memória dura só o tempo desta requisição, então
 * nenhuma tela chega a ver dado de outro usuário.
 */
export const getSessionContext = cache(async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, is_superadmin")
    .eq("id", user.id)
    .single();

  const { data: memberships } = await supabase
    .from("memberships")
    .select("tenant_id, role, tenants(name)");

  return {
    userId: user.id,
    email: profile?.email ?? user.email ?? null,
    fullName: profile?.full_name ?? null,
    isSuperadmin: profile?.is_superadmin ?? false,
    memberships: (memberships ?? []).map((m) => {
      // PostgREST pode devolver o relacionamento como objeto ou lista; normalizamos.
      const rel = m.tenants as unknown;
      const tenant = Array.isArray(rel)
        ? ((rel[0] ?? null) as { name: string | null } | null)
        : (rel as { name: string | null } | null);
      return {
        tenant_id: m.tenant_id as string,
        role: m.role as Exclude<UserRole, "superadmin">,
        tenant_name: tenant?.name ?? null,
      };
    }),
  };
});

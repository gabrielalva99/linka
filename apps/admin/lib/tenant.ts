import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ActiveTenant = { id: string; name: string; slug: string };

/**
 * Tenant sobre o qual as telas de cadastro operam.
 * Hoje há um único tenant (Motorola); com RLS, superadmin enxerga todos e membros
 * enxergam o(s) seu(s). Quando houver mais de um, entra um seletor de tenant aqui.
 */
export async function getActiveTenant(): Promise<ActiveTenant | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("tenants")
    .select("id, name, slug")
    .order("created_at", { ascending: true })
    .limit(1);
  return data?.[0] ?? null;
}

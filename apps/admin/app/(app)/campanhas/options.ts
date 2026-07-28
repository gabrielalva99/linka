import { createSupabaseServerClient } from "@/lib/supabase/server";
import { porCliente, tenantFilter } from "@/lib/tenant";

/**
 * Listas usadas pelo formulário de campanha (criar e editar pedem as mesmas).
 *
 * Recortadas pelo cliente ativo: uma campanha da Motorola não pode oferecer as
 * lojas da marca seguinte na lista de alvos — o erro aqui não seria só feio,
 * seria conteúdo de uma marca indo para a vitrine de outra.
 */
export async function loadCampaignOptions() {
  const supabase = await createSupabaseServerClient();
  const filtro = await tenantFilter();
  const [{ data: media }, { data: chains }, { data: stores }, { data: devices }] =
    await Promise.all([
      porCliente(supabase.from("media_assets").select("id, name"), filtro).order(
        "created_at",
        { ascending: false },
      ),
      porCliente(supabase.from("retail_chains").select("id, name"), filtro).order("name"),
      porCliente(supabase.from("stores").select("id, name, code"), filtro).order("name"),
      porCliente(supabase.from("devices").select("id, name, code"), filtro).order("code"),
    ]);

  return {
    media: (media ?? []).map((m) => ({
      id: m.id as string,
      label: m.name as string,
    })),
    chains: (chains ?? []).map((c) => ({
      id: c.id as string,
      label: c.name as string,
    })),
    stores: (stores ?? []).map((s) => ({
      id: s.id as string,
      label: s.code ? `${s.name} · ${s.code}` : (s.name as string),
    })),
    devices: (devices ?? []).map((d) => ({
      id: d.id as string,
      label: d.code ? `${d.code} · ${d.name}` : (d.name as string),
    })),
  };
}

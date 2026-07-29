"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { ehOperadorDaPlataforma } from "@/lib/perms";
import { TENANT_COOKIE } from "@/lib/tenant";
import { logAction } from "@/lib/audit";

export type CreateTenantState = { status: "idle" | "ok" | "dup" | "denied" | "error" };

/**
 * Endereço interno do cliente. Sai do nome, sem acento e sem espaço.
 * Não é decorativo: é o que aparece em caminho de arquivo e em log.
 */
function slugify(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/**
 * Código que o técnico digita no aparelho para dizer de qual cliente ele é.
 *
 * Sem O, I, 0 e 1: quem lê isso lê de um papel numa loja, e "0" contra "O" num
 * código errado significa aparelho entrando na conta da marca errada.
 */
function novoCodigo(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let saida = "";
  for (let i = 0; i < 8; i++) {
    saida += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  }
  return saida;
}

export async function createTenant(
  _prev: CreateTenantState,
  formData: FormData,
): Promise<CreateTenantState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { status: "error" };

  // Criar cliente é ato da plataforma, nunca de agência: um cliente novo é um
  // contrato novo, e quem opera a conta de uma marca não abre a conta de outra.
  if (!ehOperadorDaPlataforma(await getSessionContext())) return { status: "denied" };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tenants")
    .insert({ name, slug: slugify(name), enrollment_code: novoCodigo() })
    .select("id")
    .single();

  if (error) return { status: error.code === "23505" ? "dup" : "error" };

  await logAction("tenant.create", "tenant", data.id, { name });
  revalidatePath("/clientes");
  return { status: "ok" };
}

/**
 * Encontra um endereço interno livre, ignorando o próprio cliente.
 *
 * O sufixo numérico existe para o caso de duas marcas com o mesmo nome: a
 * segunda vira "motorola-2" em vez de a operação toda travar num erro de
 * duplicidade que a pessoa não tem como resolver pela tela.
 */
async function slugLivre(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  base: string,
  proprioId: string,
): Promise<string> {
  let tentativa = base;
  for (let n = 2; n < 50; n++) {
    const { data } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", tentativa)
      .maybeSingle();
    if (!data || data.id === proprioId) return tentativa;
    tentativa = `${base}-${n}`;
  }
  return `${base}-${Date.now()}`;
}

export async function renameTenant(id: string, name: string) {
  const limpo = name.trim();
  if (!limpo) return { ok: false as const, error: "Digite um nome." };
  if (!ehOperadorDaPlataforma(await getSessionContext())) {
    return { ok: false as const, error: "Sem permissão." };
  }

  const supabase = await createSupabaseServerClient();
  // O endereço interno ACOMPANHA o nome, e isso é uma correção.
  //
  // Antes ele ficava congelado, com a justificativa de que estaria em caminho de
  // arquivo e em registro antigo. Fui verificar: hoje o slug só aparece embaixo do
  // nome nesta lista — nem o Storage nem as Edge Functions o usam. E congelado ele
  // quebrava o caminho mais óbvio de todos: renomear "Motorola" para "Teste" e
  // depois abrir a Motorola de verdade. O slug `motorola` continuava preso ao
  // cliente de teste e a criação do novo respondia "cliente já existe" — para um
  // nome que não existia.
  //
  // Se algum dia o slug entrar em caminho de arquivo, isto volta a ser errado e
  // precisa de renomeação de pasta junto.
  const slug = await slugLivre(supabase, slugify(limpo), id);
  const { error } = await supabase
    .from("tenants")
    .update({ name: limpo, slug })
    .eq("id", id);
  if (error) return { ok: false as const, error: "Não consegui renomear." };

  await logAction("tenant.rename", "tenant", id, { name: limpo });
  revalidatePath("/clientes");
  return { ok: true as const };
}

/**
 * Gera um código de inscrição novo.
 *
 * Serve para quando o código vazou — folha esquecida na loja, foto num grupo de
 * WhatsApp. Aparelho já provisionado não é afetado: ele guarda o token dele, e o
 * código só vale no momento da entrada.
 */
export async function resetEnrollmentCode(id: string) {
  if (!ehOperadorDaPlataforma(await getSessionContext())) {
    return { ok: false as const, error: "Sem permissão." };
  }
  const supabase = await createSupabaseServerClient();
  const codigo = novoCodigo();
  const { error } = await supabase
    .from("tenants")
    .update({ enrollment_code: codigo })
    .eq("id", id);
  if (error) return { ok: false as const, error: "Não consegui trocar o código." };

  await logAction("tenant.reset_code", "tenant", id);
  revalidatePath("/clientes");
  return { ok: true as const, codigo };
}

/**
 * Define o PIN que destrava o aparelho na loja.
 *
 * Vale para todos os aparelhos do cliente, porque a equipe de campo precisa de um
 * número que ela decore: um PIN por aparelho, com 250 aparelhos, viraria uma
 * planilha que ninguém leva para a loja.
 *
 * Apagar o campo TIRA a saída presencial de toda a frota do cliente, e é assim
 * que se revoga um PIN que vazou. Os aparelhos recebem em até 20 segundos.
 */
export async function setMaintenancePin(id: string, pin: string) {
  if (!ehOperadorDaPlataforma(await getSessionContext())) {
    return { ok: false as const, error: "Sem permissão." };
  }
  const limpo = pin.replace(/\D/g, "");
  if (limpo.length > 0 && (limpo.length < 6 || limpo.length > 8)) {
    return { ok: false as const, error: "O PIN precisa ter de 6 a 8 dígitos." };
  }
  // Seis dígitos, e não quatro: quatro são 10 mil combinações, e o bloqueio de 3
  // tentativas no aparelho não segura quem tem a tarde inteira na loja.
  // Grava em tenant_secrets (RLS: só superadmin). Upsert porque a linha só passa
  // a existir quando alguém define o primeiro PIN — cliente sem PIN é a ausência
  // da linha, e não uma linha vazia.
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("tenant_secrets")
    .upsert(
      {
        tenant_id: id,
        maintenance_pin: limpo.length > 0 ? limpo : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
  if (error) return { ok: false as const, error: "Não consegui salvar o PIN." };

  // O PIN NÃO vai para a auditoria — registrar o valor num log que outras pessoas
  // leem anularia o motivo de ele existir. Registra que mudou, e nada além.
  await logAction(
    limpo.length > 0 ? "tenant.set_maintenance_pin" : "tenant.clear_maintenance_pin",
    "tenant",
    id,
  );
  revalidatePath("/clientes");
  return { ok: true as const };
}

/**
 * Desativa (ou reativa) um cliente.
 *
 * É a resposta para "o contrato acabou" — e a alternativa honesta a excluir, que
 * só passa com o cliente vazio e leva a medição embora.
 *
 * O QUE ACONTECE: o cliente sai do seletor, então ninguém cadastra loja nem sobe
 * vídeo dentro de um contrato encerrado por engano. Continua nesta tela, que é
 * onde se reativa.
 *
 * O QUE NÃO ACONTECE, e a tela precisa dizer: os aparelhos na rua CONTINUAM
 * funcionando e exibindo o que já está neles. Desativar um cliente não pode
 * apagar 250 vitrines em 15 lojas por um clique num painel — quem encerra
 * vitrine é desprovisionar ou arquivar aparelho, com alguém sabendo. Contrato é
 * papel; vitrine é loja.
 */
export async function setTenantActive(id: string, ativo: boolean) {
  if (!ehOperadorDaPlataforma(await getSessionContext())) {
    return { ok: false as const, error: "Sem permissão." };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("tenants").update({ is_active: ativo }).eq("id", id);
  if (error) {
    return {
      ok: false as const,
      error: ativo ? "Não consegui reativar." : "Não consegui desativar.",
    };
  }

  // Sai do cliente desativado antes de recarregar: continuar "dentro" de um
  // cliente que não está mais no seletor deixa a tela num estado que a pessoa não
  // consegue explicar nem desfazer.
  if (!ativo) {
    const jar = await cookies();
    if (jar.get(TENANT_COOKIE)?.value === id) jar.delete(TENANT_COOKIE);
  }

  await logAction(ativo ? "tenant.activate" : "tenant.deactivate", "tenant", id);
  revalidatePath("/clientes");
  revalidatePath("/");
  return { ok: true as const };
}

/**
 * Exclui um cliente — e só passa se ele estiver VAZIO.
 *
 * A trava não é frescura: no banco, tudo que é do cliente cai junto em cascata.
 * Aparelho, loja, campanha, vídeo, e o histórico de interação inteiro. Um clique
 * errado aqui não perde um cadastro, perde meses de medição que não voltam de
 * lugar nenhum — os eventos foram apagados do aparelho assim que o servidor
 * confirmou que tinha gravado.
 *
 * Então a recusa diz O QUE segura, como no resto do painel. "Não foi possível"
 * faz a pessoa tentar de novo achando que foi falha de rede.
 */
export async function deleteTenant(id: string) {
  if (!ehOperadorDaPlataforma(await getSessionContext())) {
    return { ok: false as const, error: "Sem permissão." };
  }

  const supabase = await createSupabaseServerClient();
  const conta = async (tabela: string) => {
    const { count } = await supabase
      .from(tabela)
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", id);
    return count ?? 0;
  };

  const [aparelhos, lojas, redes, midias, campanhas, pessoas, total] = await Promise.all([
    conta("devices"),
    conta("stores"),
    conta("retail_chains"),
    conta("media_assets"),
    conta("campaigns"),
    conta("memberships"),
    supabase
      .from("tenants")
      .select("id", { count: "exact", head: true })
      .then((r) => r.count ?? 0),
  ]);

  const segura: string[] = [];
  const item = (n: number, um: string, muitos: string) =>
    n > 0 ? segura.push(`${n} ${n === 1 ? um : muitos}`) : null;
  item(aparelhos, "aparelho", "aparelhos");
  item(lojas, "loja", "lojas");
  item(redes, "rede", "redes");
  item(midias, "vídeo", "vídeos");
  item(campanhas, "campanha", "campanhas");
  item(pessoas, "pessoa com acesso", "pessoas com acesso");

  if (segura.length > 0) {
    return {
      ok: false as const,
      error: `Ainda tem ${segura.join(", ")}. Um cliente só sai vazio.`,
    };
  }
  // Sem nenhum cliente, o painel fica sem chão: não há onde cadastrar nada.
  if (total <= 1) {
    return { ok: false as const, error: "É o único cliente que existe." };
  }

  const { error } = await supabase.from("tenants").delete().eq("id", id);
  if (error) return { ok: false as const, error: "Não consegui excluir." };

  await logAction("tenant.delete", "tenant", id);
  revalidatePath("/clientes");
  return { ok: true as const };
}

/** Entra no cliente: passa a ser ele em todas as telas. */
export async function entrarNoCliente(id: string) {
  const supabase = await createSupabaseServerClient();
  // Confere que existe e que quem pediu enxerga: o id vem da tela, e tela é
  // entrada do usuário como qualquer outra.
  const { data } = await supabase.from("tenants").select("id").eq("id", id).maybeSingle();
  if (!data) return;

  (await cookies()).set(TENANT_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  redirect("/");
}

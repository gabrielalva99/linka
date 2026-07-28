import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Registra uma ação administrativa na trilha de auditoria.
 *
 * O autor NÃO é parâmetro: quem assina é a sessão de quem chamou, decidido
 * dentro do banco. Registro de auditoria em que o próprio chamador escolhe o
 * autor não serve de prova nenhuma.
 *
 * Nunca lança. Auditoria que derruba a ação auditada faz o operador parar de
 * conseguir trabalhar por causa do diário de bordo, que é o contrário do que
 * ela existe para fazer. Falha aqui é silenciosa de propósito.
 */
export async function logAction(
  action: string,
  entity?: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
) {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.rpc("log_action", {
      p_action: action,
      p_entity: entity ?? null,
      p_entity_id: entityId ?? null,
      p_metadata: metadata ?? {},
    });
  } catch {
    // Sem barulho: ver comentário acima.
  }
}

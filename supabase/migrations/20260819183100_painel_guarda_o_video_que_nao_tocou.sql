-- O painel guarda o vídeo que NÃO tocou.
--
-- Sem isto, vídeo que falha some: o aparelho tenta, erra, pula para o próximo, e
-- a vitrine parece saudável no painel enquanto uma peça da campanha nunca
-- apareceu na loja. O erro fica só no aparelho, onde ninguém olha.
--
-- Guardado no aparelho e não como evento porque a pergunta é de AGORA ("qual
-- peça está falhando neste aparelho"), e a resposta tem que sumir sozinha
-- quando o vídeo voltar a tocar — que é o que a batida faz ao limpar a coluna.
--
-- ── POR QUE ESTE ARQUIVO NASCEU DEPOIS DA COLUNA ──────────────────────────
-- Esta migration foi aplicada direto no banco em 19/08 e não foi versionada. A
-- coluna existia em produção, o agente escrevia nela (Telemetry.kt) e o
-- heartbeat lia — mas uma instalação limpa a partir do repositório nascia SEM
-- ela, e a batida quebraria no primeiro aparelho.
--
-- É o terceiro caso do mesmo tipo, e é exatamente o que tools/conferir-migrations.mjs
-- existe para pegar. Achado em 20/08 por varredura. O carimbo abaixo é o mesmo
-- que ficou registrado no banco de propósito: assim as duas listas voltam a
-- contar a mesma história e `db push` não tenta reaplicar.
alter table public.devices
  add column if not exists erro_de_video text;

comment on column public.devices.erro_de_video is
  'Ultimo video que o aparelho nao conseguiu tocar, com o codigo do erro. Escrito pelo aparelho.';

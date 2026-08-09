-- URL de mídia é única no sistema inteiro, e não por cliente.
--
-- POR QUE GLOBAL. Descoberto na varredura de 08/08, feita logo depois de
-- construir o criativo por formato: a busca da peça pelo `content_url` do
-- aparelho (em `_shared/conteudo.ts`) roda com service role — ignora RLS — e não
-- filtra por cliente. Ela não tem como filtrar: procura justamente por URL. Com
-- duas linhas de clientes diferentes carregando a MESMA url, essa busca vira
-- sorteio.
--
-- O ATAQUE, medido em transação revertida: um cliente insere uma peça com a URL
-- exata do vídeo fixo de um aparelho de outro cliente e pendura variantes nela. O
-- aparelho da vítima passa a receber a variante do atacante. É a peça de uma
-- marca entrando na vitrine de outra — a mesma família do furo de 29/07
-- (vídeo de um cliente na campanha de outro), por uma porta nova que eu mesmo
-- acabara de abrir.
--
-- Único por (tenant_id, url) NÃO resolveria: é exatamente ENTRE clientes que a
-- duplicata faz estrago.
--
-- Não restringe uso legítimo: cada envio gera um caminho próprio no armazenamento
-- (tenant/timestamp-nome), então URL repetida já era sinal de erro.
--
-- Provado nas duas direções: antes do índice, o INSERT do atacante passava e
-- ficavam 2 linhas com a mesma URL; depois, o banco recusa por violação de chave.
create unique index if not exists media_assets_url_unica on media_assets (url);

comment on index media_assets_url_unica is
  'URL única em todo o sistema. Sustenta a busca da peça por content_url, que roda com service role e não pode filtrar por cliente. Ver varredura de 08/08.';

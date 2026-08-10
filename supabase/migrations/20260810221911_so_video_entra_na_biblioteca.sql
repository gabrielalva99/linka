-- A biblioteca aceita vídeo, e a recusa acontece no armazenamento.
--
-- O QUE ESTAVA ABERTO. O filtro de tipo existia só no <input accept="video/*">
-- da tela de envio. Isso é decoração: o envio vai do navegador DIRETO para o
-- armazenamento, e quem chamar a API por fora não passa por aquele input. Um
-- usuário com papel de agência podia subir qualquer arquivo dentro da pasta do
-- próprio cliente — inclusive .html — e o balde `content` é público de leitura.
-- Resultado: página arbitrária servida por uma URL da nossa infraestrutura.
-- Não vaza dado de ninguém (o RLS de pasta continua valendo), mas é hospedagem
-- de conteúdo estranho com a nossa cara, que é como golpe de phishing começa.
--
-- POR QUE AQUI E NÃO NA TELA. Regra que mora no navegador não é regra, é
-- sugestão. O armazenamento recusa antes de gravar, para toda porta ao mesmo
-- tempo: painel, script, chamada direta na API.
--
-- POR QUE SÓ VÍDEO. É o que o aparelho sabe exibir hoje. Aceitar imagem no
-- balde enquanto o agente não desenha imagem só trocaria "recusado no envio"
-- (claro) por "vitrine em branco na loja" (invisível). Quando o agente aprender
-- imagem estática, esta lista cresce junto — e SVG fica de fora mesmo assim,
-- porque SVG carrega script.
update storage.buckets
set allowed_mime_types = array['video/mp4', 'video/webm']
where id = 'content';

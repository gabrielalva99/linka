-- A faxina de 19/08 corrigiu o futuro e esqueceu o passado.
--
-- Aquela migration criou o gatilho que puxa o horário da faxina para 30 minutos
-- antes de a loja fechar. Ele age quando o aparelho é criado ou alterado — e
-- nunca voltou para os que já estavam no banco.
--
-- Sobrou um: o 114, com o padrão antigo de 23:00, uma hora depois de a loja
-- fechar (22:00). Não deu problema porque é aparelho de bancada, sempre ligado.
-- Numa loja de verdade é exatamente o defeito que aquela migration existe para
-- evitar: às 23:00 a loja está fechada, o aparelho pode estar desligado, a
-- faxina não roda, e as fotos que o cliente tirou passam a noite no aparelho.
--
-- Encontrado em 21/08, ao conferir se as faxinas de ontem rodaram no horário.
-- Rodaram — 15 de 16 às 21:30, dentro de 47 segundos. O 114 rodou às 23:00.
--
-- A mesma conta do gatilho, aplicada a quem ficou para trás. Aparelho sem loja
-- não é tocado: sem horário de funcionamento não há como saber o que é "dentro
-- do expediente".
update public.devices d
set cleanup_time = (s.closes_at - interval '30 minutes')::time
from public.stores s
where d.store_id = s.id
  and d.cleanup_time is not null
  and s.opens_at is not null and s.closes_at is not null
  and (d.cleanup_time < s.opens_at or d.cleanup_time > s.closes_at);

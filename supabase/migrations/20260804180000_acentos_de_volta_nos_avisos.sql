-- LINKA — devolve os acentos aos avisos da tela de Visão geral.
--
-- REGRESSÃO MINHA, de 31/07. Comparando as versões da mesma view:
--
--   20260728110000 →  'sem contato há '     (certo)
--   20260731090000 →  'sem contato ha '     (acento perdido)
--
-- Ao reescrever a view naquele dia eu digitei os textos sem acento, e as três
-- migrations seguintes copiaram o erro adiante. O resultado é a tela mais
-- visitada do painel escrevendo "o aplicativo nao esta no controle do aparelho"
-- para o cliente da marca. Texto de painel fala com o cliente: errado ali não é
-- detalhe de estilo, é a impressão que a plataforma dá de si mesma.
--
-- NÃO É UM CASO, É UMA CLASSE. A mesma digitação sem acento atingiu também
-- protecoes_faltando ('fabrica', 'seguranca', 'usuario', 'aviao'), que alimenta
-- justamente o detalhe do aviso "sem travas". Os dois vão juntos aqui.
--
-- POR QUE A VIEW É REMENDADA EM VEZ DE REESCRITA. O corpo dela tem oito ramos de
-- diagnóstico e uma janela de expediente por fuso. Redigitar isso para trocar
-- sete literais é oferecer um erro novo em troca de um erro velho. O DO abaixo lê
-- a definição que está no banco, troca só os pedaços de texto e recria — e
-- ABORTA se qualquer âncora não for encontrada, porque um replace que não achou
-- nada passa silencioso e deixa o defeito de pé.
--
-- security_invoker=on É OBRIGATÓRIO NA RECRIAÇÃO. A view roda com o privilégio de
-- quem consulta justamente para a RLS por tenant continuar valendo. Recriar sem
-- essa opção faria a view rodar como dona e um cliente passaria a enxergar a
-- frota de outro. Não se confia em herança implícita para isso.

-- 1) Os nomes das proteções que faltam, com acento.
create or replace function public.protecoes_faltando(p jsonb)
returns text
language sql
immutable
set search_path to ''
as $function$
  select string_agg(
    case t.chave
      when 'no_config_credentials' then 'permite criar senha de tela'
      when 'no_factory_reset'      then 'permite restaurar de fábrica'
      when 'no_safe_boot'          then 'permite modo de segurança'
      when 'no_add_user'           then 'permite criar outro usuário'
      when 'no_modify_accounts'    then 'permite adicionar conta'
      when 'no_config_date_time'   then 'permite mudar a hora'
      when 'no_config_locale'      then 'permite mudar o idioma'
      when 'no_config_wifi'        then 'permite mexer no Wi-Fi'
      when 'no_change_wifi_state'  then 'permite desligar o Wi-Fi'
      when 'no_add_wifi_config'    then 'permite trocar de rede'
      when 'no_airplane_mode'      then 'permite ligar o modo avião'
      when 'escondido:com.android.vending' then 'Play Store ao alcance'
      else t.chave
    end, '; ' order by t.chave)
  from jsonb_each(p) as t(chave, valor)
  where valor = 'false'::jsonb;
$function$;

-- 2) Os textos dos avisos, com acento.
do $$
declare
  corpo text;
  de text;
  para text;
  pares text[][] := array[
    ['sem contato ha ',
     'sem contato há '],
    ['no ar, mas sem video na tela',
     'no ar, mas sem vídeo na tela'],
    ['o aplicativo nao esta no controle do aparelho',
     'o aplicativo não está no controle do aparelho'],
    ['protecao incompleta',
     'proteção incompleta'],
    ['da para desligar o Wi-Fi ou ligar o modo aviao',
     'dá para desligar o Wi-Fi ou ligar o modo avião'],
    ['tem senha na tela de bloqueio; no proximo reinicio a vitrine para',
     'tem senha na tela de bloqueio; no próximo reinício a vitrine para'],
    ['sem loja definida, nenhuma campanha alcanca este aparelho',
     'sem loja definida, nenhuma campanha alcança este aparelho']
  ];
  i int;
begin
  corpo := pg_get_viewdef('public.v_device_issues'::regclass, true);

  for i in 1 .. array_length(pares, 1) loop
    de := pares[i][1];
    para := pares[i][2];
    if position(de in corpo) = 0 then
      raise exception
        'ancora nao encontrada em v_device_issues: %. A view mudou desde 04/08 — confira antes de remendar.', de;
    end if;
    corpo := replace(corpo, de, para);
  end loop;

  execute 'create or replace view public.v_device_issues with (security_invoker = on) as ' || corpo;
end $$;

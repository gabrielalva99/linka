-- O gatilho que segura o dono do arquivo ganha caminho de busca fixo.
--
-- O QUE FALTAVA. `private.midia_nao_troca_de_dono` nasceu hoje de manhã sem
-- `set search_path`. As outras funções desta pasta têm; esta escapou.
--
-- POR QUE IMPORTA. Sem caminho fixo, a função roda com o `search_path` de QUEM
-- disparou o gatilho. Quem consegue criar um esquema à frente de `public` na
-- fila daquele papel passa a decidir qual função com nome igual é chamada aqui
-- dentro — e o que roda aqui dentro é justamente a trava que impede um arquivo
-- de trocar de cliente. É a diferença entre uma trava e uma trava que o outro
-- lado pode trocar de lugar.
--
-- Achado pela varredura de 10/08, no meu próprio código do mesmo dia.
create or replace function private.midia_nao_troca_de_dono()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception
      'O cliente dono de um arquivo não pode ser alterado. Envie o arquivo no cliente correto.';
  end if;
  return new;
end;
$$;

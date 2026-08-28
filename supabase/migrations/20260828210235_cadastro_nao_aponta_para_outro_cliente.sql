-- A-04: ponteiro entre cadastros nao atravessa cliente.
--
-- ── O FURO ──────────────────────────────────────────────────────────────────
-- O RLS valida o `tenant_id` da LINHA gravada, que e sempre o do usuario. Mas
-- ninguem conferia que o objeto APONTADO pela chave estrangeira era do mesmo
-- cliente. Entao dava para criar posicao apontando para loja de outra marca, ou
-- aparelho apontando para modelo/loja de outra, sem erro nenhum.
--
-- Quem consegue: usuario com papel de agencia em DOIS clientes. Que e o caso
-- real desta operacao, que atende varias marcas.
--
-- ── POR QUE GATILHO E NAO CONFERENCIA NA TELA ──────────────────────────────
-- A casa ja fechou esta mesma classe para midia e campanha
-- (conteudo_do_mesmo_cliente, alvo_do_mesmo_cliente, midia_nao_troca_de_dono) e
-- para contato-loja (27/08). Sempre no banco, e por dois motivos: vale tambem
-- contra service_role, que as funcoes de borda usam e que ignora RLS; e nao
-- depende de nenhuma tela futura lembrar de conferir.

-- Um so verificador para os quatro apontamentos: le o tenant da linha e recusa
-- qualquer ponteiro que seja de outro cliente.
create or replace function private.aponta_para_o_mesmo_cliente()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_dono uuid;
begin
  if to_jsonb(new) ? 'store_id' and (to_jsonb(new)->>'store_id') is not null then
    select tenant_id into v_dono from public.stores
     where id = (to_jsonb(new)->>'store_id')::uuid;
    if v_dono is null or v_dono <> new.tenant_id then
      raise exception 'loja e de outro cliente';
    end if;
  end if;

  if to_jsonb(new) ? 'chain_id' and (to_jsonb(new)->>'chain_id') is not null then
    select tenant_id into v_dono from public.retail_chains
     where id = (to_jsonb(new)->>'chain_id')::uuid;
    if v_dono is null or v_dono <> new.tenant_id then
      raise exception 'rede e de outro cliente';
    end if;
  end if;

  if to_jsonb(new) ? 'model_id' and (to_jsonb(new)->>'model_id') is not null then
    select tenant_id into v_dono from public.device_models
     where id = (to_jsonb(new)->>'model_id')::uuid;
    if v_dono is null or v_dono <> new.tenant_id then
      raise exception 'modelo e de outro cliente';
    end if;
  end if;

  if to_jsonb(new) ? 'position_id' and (to_jsonb(new)->>'position_id') is not null then
    select tenant_id into v_dono from public.positions
     where id = (to_jsonb(new)->>'position_id')::uuid;
    if v_dono is null or v_dono <> new.tenant_id then
      raise exception 'posicao e de outro cliente';
    end if;
  end if;

  return new;
end;
$$;

comment on function private.aponta_para_o_mesmo_cliente() is
  'Recusa gravacao cujo ponteiro (loja, rede, modelo, posicao) seja de outro cliente. Vale inclusive contra service_role.';

drop trigger if exists positions_mesmo_cliente on public.positions;
create trigger positions_mesmo_cliente
  before insert or update on public.positions
  for each row execute function private.aponta_para_o_mesmo_cliente();

drop trigger if exists stores_mesmo_cliente on public.stores;
create trigger stores_mesmo_cliente
  before insert or update on public.stores
  for each row execute function private.aponta_para_o_mesmo_cliente();

drop trigger if exists devices_mesmo_cliente on public.devices;
create trigger devices_mesmo_cliente
  before insert or update on public.devices
  for each row execute function private.aponta_para_o_mesmo_cliente();

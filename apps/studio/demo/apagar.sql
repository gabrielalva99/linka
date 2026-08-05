-- Apaga a rede de demonstração criada por `semear.sql`.
--
-- O filtro é sempre o tenant_id da rede `demonstracao`. Nada fora dela é
-- tocado — e é por isso que a demonstração precisa ser um tenant separado, e
-- nunca dados enfiados na rede real.

do $$
declare
  v_tenant uuid := (select id from public.tenants where slug = 'demonstracao');
  v_user uuid := (select id from auth.users where email = 'demo@linkaretail.com.br');
begin
  if v_tenant is null then raise notice 'nada a apagar'; return; end if;

  delete from public.rollup_toque_hora   where tenant_id = v_tenant;
  delete from public.rollup_recurso_hora where tenant_id = v_tenant;
  delete from public.rollup_midia_hora   where tenant_id = v_tenant;
  delete from public.rollup_visita_hora  where tenant_id = v_tenant;
  delete from public.device_alerts       where tenant_id = v_tenant;
  delete from public.device_events       where tenant_id = v_tenant;
  delete from public.device_apps where device_id in (select id from public.devices where tenant_id = v_tenant);
  delete from public.campaign_items      where tenant_id = v_tenant;
  delete from public.campaign_targets    where tenant_id = v_tenant;
  delete from public.campaigns           where tenant_id = v_tenant;
  delete from public.media_assets        where tenant_id = v_tenant;
  delete from public.devices             where tenant_id = v_tenant;
  delete from public.positions           where tenant_id = v_tenant;
  delete from public.stores              where tenant_id = v_tenant;
  delete from public.retail_chains       where tenant_id = v_tenant;
  delete from public.device_models       where tenant_id = v_tenant;
  delete from public.device_groups       where tenant_id = v_tenant;
  delete from public.tenant_secrets      where tenant_id = v_tenant;
  delete from public.memberships         where tenant_id = v_tenant;
  delete from public.audit_log           where tenant_id = v_tenant;
  delete from public.tenants             where id = v_tenant;

  if v_user is not null then
    delete from public.profiles where id = v_user;
    delete from auth.users where id = v_user;
  end if;
end $$;

-- Confira que o banco voltou ao que era. Os contadores de evento e rollup
-- podem ter subido um pouco: é o aparelho real reportando enquanto você
-- trabalhava, e é a prova de que o dado de verdade não foi tocado.
select (select count(*) from public.tenants)  as redes,
       (select string_agg(name,' · ') from public.tenants) as quais,
       (select count(*) from public.devices)  as aparelhos,
       (select count(*) from public.stores)   as lojas,
       (select count(*) from auth.users)      as usuarios;

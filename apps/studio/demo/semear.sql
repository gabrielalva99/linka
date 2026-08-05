-- Rede de demonstração para capturar as telas do painel.
--
-- Cria um tenant isolado com nomes neutros, os mesmos que o site usa
-- (Loja Centro, Bancada 01). Rode, capture, e rode `apagar.sql` em seguida.
-- O passo a passo e as armadilhas estão em ../capturar-painel.md
--
-- Seguro por construção: tudo pendura no tenant `demonstracao` e o apagar
-- filtra por ele. Nada fora dessa rede é tocado.

do $$
declare
  v_tenant uuid; v_chain uuid; v_user uuid := gen_random_uuid();
  v_store uuid; v_pos uuid; v_ma uuid; v_mb uuid; v_mc uuid;
  v_media uuid; v_camp uuid;
  r record; d record; dia date; i int; h int; n int := 0; visitas int; peso numeric;
begin
  insert into public.tenants (name, slug, enrollment_code, is_active)
  values ('Demonstração','demonstracao','DEMO'||substr(md5(random()::text),1,6),true)
  returning id into v_tenant;

  insert into public.retail_chains (tenant_id,name) values (v_tenant,'Rede Demonstração')
  returning id into v_chain;

  insert into public.device_models (tenant_id,name,line) values (v_tenant,'Linha Essencial','Essencial') returning id into v_ma;
  insert into public.device_models (tenant_id,name,line) values (v_tenant,'Linha Plus','Plus') returning id into v_mb;
  insert into public.device_models (tenant_id,name,line) values (v_tenant,'Linha Pro','Pro') returning id into v_mc;

  for r in select * from (values
      ('Loja Centro','shopping','São Paulo','SP'),
      ('Loja Norte','street','São Paulo','SP'),
      ('Loja Sul','shopping','São Paulo','SP'),
      ('Loja Leste','street','Guarulhos','SP')) as s(nome,tipo,cidade,uf)
  loop
    insert into public.stores (tenant_id,chain_id,name,kind,city,state,country,timezone,is_active,opens_at,closes_at)
    values (v_tenant,v_chain,r.nome,r.tipo::public.store_kind,r.cidade,r.uf,'BR','America/Sao_Paulo',true,'10:00','22:00')
    returning id into v_store;

    for i in 1..3 loop
      n := n + 1;
      insert into public.positions (tenant_id,store_id,label)
      values (v_tenant,v_store,'Bancada '||lpad(i::text,2,'0')) returning id into v_pos;

      -- DM003 e DM008 ficam fora do ar de propósito: alerta zerado não mostra
      -- o valor do produto, e alerta em tudo mostra um produto que não funciona.
      insert into public.devices (tenant_id,name,code,model_id,store_id,position_id,device_type,status,mode,
        battery_level,battery_charging,is_active,synced,last_seen_at,os_version,agent_version,hardware_model,
        connection,signal_dbm,is_device_owner,kiosk_locked,screen_on,volume_percent,temperature_c,uptime_seconds,
        idle_return_seconds,cleanup_enabled,cleanup_time,playing_url,content_url)
      values (v_tenant,'Bancada '||lpad(i::text,2,'0'),'DM'||lpad(n::text,3,'0'),
        case when n%3=1 then v_ma when n%3=2 then v_mb else v_mc end, v_store, v_pos,'smartphone',
        case when n in (3,8) then 'offline' else 'online' end::public.device_status,
        case when n in (3,8) then 'not_running' else 'show' end::public.device_mode,
        case when n in (3,8) then 11 else 72+(n*7)%24 end, n not in (3,8), true, true,
        case when n in (3,8) then now()-interval '4 hours' else now()-make_interval(secs=>8+(n*11)%40) end,
        '16','0.75.0','demo','wifi', -52-(n*3)%20, true, true, n not in (3,8), 70,
        30.5+(n%5), 86400*(2+n%6), 30, true, '03:30',
        case when n in (3,8) then null else 'https://cdn.linka/demo/campanha-agosto.mp4' end,
        'https://cdn.linka/demo/campanha-agosto.mp4');
    end loop;
  end loop;

  -- ── Três campanhas, e as três existem por um motivo ─────────────────────
  --
  -- 1) VITRINE PADRÃO — a rede de segurança. Sem ela o painel estampa um aviso
  --    laranja: "nenhuma campanha cobre todos os aparelhos o tempo todo".
  --    A condição é exata e está em apps/admin/app/(app)/campanhas/page.tsx:
  --    ativa, escopo `tenant`, e **sem data e sem horário**. Cobrir 00:00 às
  --    23:59 NÃO conta — já tentei, o aviso continua.
  insert into public.media_assets (tenant_id,name,storage_path,url,content_type,size_bytes)
  values (v_tenant,'Vitrine padrão','demo/vitrine-padrao.mp4','https://cdn.linka/demo/vitrine-padrao.mp4','video/mp4',12200000)
  returning id into v_media;
  insert into public.campaigns (tenant_id,name,starts_on,ends_on,start_time,end_time,is_active,rotation_seconds)
  values (v_tenant,'Vitrine padrão',null,null,null,null,true,20) returning id into v_camp;
  insert into public.campaign_items (tenant_id,campaign_id,media_id,position) values (v_tenant,v_camp,v_media,1);
  insert into public.campaign_targets (tenant_id,campaign_id,scope) values (v_tenant,v_camp,'tenant');

  -- 2) CAMPANHA DO MÊS — a rede inteira, no horário da loja.
  insert into public.media_assets (tenant_id,name,storage_path,url,content_type,size_bytes)
  values (v_tenant,'Campanha de agosto','demo/campanha-agosto.mp4','https://cdn.linka/demo/campanha-agosto.mp4','video/mp4',18400000)
  returning id into v_media;
  insert into public.campaigns (tenant_id,name,starts_on,ends_on,start_time,end_time,is_active,rotation_seconds)
  values (v_tenant,'Campanha de agosto',current_date-6,current_date+20,'10:00','22:00',true,20)
  returning id into v_camp;
  insert into public.campaign_items (tenant_id,campaign_id,media_id,position) values (v_tenant,v_camp,v_media,1);
  insert into public.campaign_targets (tenant_id,campaign_id,scope,chain_id) values (v_tenant,v_camp,'chain',v_chain);

  -- 3) LANÇAMENTO — duas lojas, no pico. É esta que faz a tela demonstrar a
  --    precedência prometida no subtítulo: o mais específico vence o mais geral.
  insert into public.media_assets (tenant_id,name,storage_path,url,content_type,size_bytes)
  values (v_tenant,'Lançamento — fim de semana','demo/lancamento.mp4','https://cdn.linka/demo/lancamento.mp4','video/mp4',22800000)
  returning id into v_media;
  insert into public.campaigns (tenant_id,name,starts_on,ends_on,start_time,end_time,is_active,rotation_seconds)
  values (v_tenant,'Lançamento — fim de semana',current_date-2,current_date+9,'14:00','21:00',true,15)
  returning id into v_camp;
  insert into public.campaign_items (tenant_id,campaign_id,media_id,position) values (v_tenant,v_camp,v_media,1);
  insert into public.campaign_targets (tenant_id,campaign_id,scope,store_id)
  select v_tenant, v_camp, 'store', id from public.stores
  where tenant_id = v_tenant and name in ('Loja Centro','Loja Norte');

  -- Sete dias de movimento com curva de loja: fraco de manhã, pico às 18h.
  for d in select id, code from public.devices where tenant_id=v_tenant and code not in ('DM003','DM008') loop
    for dia in select generate_series(current_date-6,current_date,'1 day')::date loop
      for h in 10..21 loop
        peso := (1.0 - abs(h-18)/9.0);
        visitas := greatest(0, round((3+(abs(hashtext(d.code||dia::text||h::text))%5))*peso)::int);
        if visitas = 0 then continue; end if;
        insert into public.rollup_visita_hora (tenant_id,device_id,hora_local,visitas,segundos_uso,segundos_vitrine,atualizado_em)
        values (v_tenant,d.id,(dia+make_interval(hours=>h))::timestamp,visitas,
                visitas*(40+(abs(hashtext(d.code||h::text))%70)), 3600-visitas*25, now()) on conflict do nothing;
      end loop;
      -- Câmera na frente com folga, e nada empatado: número redondo demais
      -- denuncia que o dado foi gerado.
      for h in 11..21 by 2 loop
        insert into public.rollup_toque_hora (tenant_id,device_id,hora_local,recurso,toques,atualizado_em)
        select v_tenant,d.id,(dia+make_interval(hours=>h))::timestamp,x.nome,
               greatest(1, round(x.base*(1.0-abs(h-18)/11.0))::int
                         + (abs(hashtext(d.code||h::text||x.nome))%3) - 1), now()
        from (values ('Câmera',8),('Tela',6),('Som',3),('Vídeo',2)) as x(nome,base) on conflict do nothing;
      end loop;
    end loop;
  end loop;

  -- As colunas de token vão como '' e não NULL: com NULL o GoTrue responde
  -- "e-mail ou senha inválidos" e o login nunca funciona.
  insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,
    raw_app_meta_data,raw_user_meta_data,confirmation_token,recovery_token,email_change,email_change_token_new,
    email_change_token_current,phone_change,phone_change_token,reauthentication_token,is_sso_user,is_anonymous)
  values ('00000000-0000-0000-0000-000000000000',v_user,'authenticated','authenticated','demo@linkaretail.com.br',
    crypt('Vitrine!2026#demo', gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,'{"full_name":"Demonstração"}'::jsonb,
    '','','','','','','','',false,false);
  insert into public.profiles (id,full_name,email,is_superadmin)
  values (v_user,'Demonstração','demo@linkaretail.com.br',false)
  on conflict (id) do update set full_name=excluded.full_name;
  insert into public.memberships (user_id,tenant_id,role) values (v_user,v_tenant,'client');
end $$;

-- Rode isto SEMPRE logo antes de capturar: a tolerância da rede é de 180 s, e
-- se você semear e fotografar vinte minutos depois a frota inteira aparece
-- "fora do ar".
update public.devices d
set last_seen_at = now() - make_interval(secs => 6 + (abs(hashtext(d.code)) % 45))
where d.tenant_id = (select id from public.tenants where slug='demonstracao')
  and d.code not in ('DM003','DM008');

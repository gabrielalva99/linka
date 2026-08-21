-- O toque na Otimização de RAM aparecia como "linka:ram" na tela do cliente.
--
-- O catálogo traduz a chave técnica que o aparelho manda ("linka:camera") para o
-- nome que a pessoa lê ("Câmera"). Chave sem entrada cai no coalesce e aparece
-- crua — e isso é DE PROPÓSITO, para alguém notar que falta. Funcionou: apareceu
-- no relatório do tablet Samsung em 20/08, ao lado de "Som" e "Brilho da tela".
--
-- A Otimização de RAM entrou no painel de recursos na 0.90.0 e ninguém lembrou de
-- cadastrar a tradução. É a única que faltava: o aparelho emite cinco chaves
-- (brilho, camera, ram, volume, youtube) e o catálogo tinha quatro.
insert into public.app_catalog (package, label, category, is_noise)
values ('linka:ram', 'Otimização de RAM', 'Painel LINKA', false)
on conflict (package) do update set label = excluded.label;

-- E o acento que faltava em "Camera", na mesma tela de cliente.
update public.app_catalog set label = 'Câmera' where package = 'linka:camera';

-- LINKA — extensões necessárias.
-- gen_random_uuid() vem de pgcrypto (habilitado por padrão no Supabase; garantimos aqui).
create extension if not exists pgcrypto;

-- Valor novo do tipo de evento, sozinho numa migration de propósito.
--
-- O Postgres recusa USAR um valor de enum na mesma transação em que ele foi
-- criado ("unsafe use of new value"). Como a migration seguinte cria views que
-- filtram por 'media_play', as duas coisas não podem viajar juntas.
alter type public.event_kind add value if not exists 'media_play';

alter table public.devices add column update_error text;
comment on column public.devices.update_error is 'Por que a atualização automática parou de ser tentada neste aparelho (ex.: assinatura diferente).';

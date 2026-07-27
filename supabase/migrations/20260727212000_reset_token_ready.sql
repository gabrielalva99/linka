alter table public.devices add column reset_token_ready boolean not null default false;
comment on column public.devices.reset_token_ready is 'O aparelho consegue ter a senha da tela apagada remotamente. Precisa estar pronto ANTES de alguém pôr um PIN.';

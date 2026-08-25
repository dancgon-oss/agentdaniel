-- Rode este script no SQL Editor do seu projeto Supabase
-- (https://supabase.com/dashboard/project/eyntrzbszzjjwaveynpj/sql/new)

-- Guarda as credenciais de sessão do WhatsApp (Baileys), para sobreviver
-- a reinícios do container no Hugging Face Spaces sem precisar reescanear o QR Code.
create table if not exists public.wa_auth_kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Histórico de mensagens, usado como contexto de conversa para o Claude.
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  jid text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists messages_jid_created_idx on public.messages (jid, created_at);

-- RLS habilitado por padrão. O backend deve usar a chave service_role
-- (que ignora RLS), então nenhuma policy adicional é necessária para o bot.
-- Só crie policies aqui se algum outro cliente (ex: um dashboard) também
-- precisar acessar estas tabelas com a chave anon.
alter table public.wa_auth_kv enable row level security;
alter table public.messages enable row level security;

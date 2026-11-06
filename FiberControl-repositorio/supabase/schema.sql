-- ClickIP FiberControl — schema Supabase (Postgres + RLS + Storage)
-- Execute no SQL Editor do projeto Supabase. Idempotente.
-- Modelo: cada coleção do app é uma tabela com `id` e `data jsonb` (flexível para novos campos sem migração),
-- com colunas geradas para filtros/índices. Permissões espelham FC.permissions (js/core/config.js).

create extension if not exists pgcrypto;

-- ---------- Tabelas ----------
do $$
declare t text;
begin
  foreach t in array array['perfis','enlaces','trechos','medicoes','anexos','auditoria','manutencoes','versoes_tracado','drive_arquivos'] loop
    execute format('create table if not exists public.%I (
      id text primary key,
      data jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      updated_by uuid default auth.uid()
    )', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create table if not exists public.configuracoes (id text primary key, data jsonb not null, updated_at timestamptz default now(), updated_by uuid default auth.uid());
alter table public.configuracoes enable row level security;

-- Tokens do Google Drive: acessíveis SOMENTE pela service_role (Edge Function). Sem políticas = negado ao cliente.
create table if not exists public.drive_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null, access_token text, expires_at timestamptz, email text,
  folder_id text, folder_name text, updated_at timestamptz default now()
);
alter table public.drive_tokens enable row level security;

-- Colunas geradas para consulta
alter table public.enlaces  add column if not exists projeto text generated always as (data->>'projeto') stored;
alter table public.enlaces  add column if not exists regiao  text generated always as (data->>'regiao') stored;
alter table public.trechos  add column if not exists link_id text generated always as (data->>'linkId') stored;
alter table public.medicoes add column if not exists trecho_id text generated always as (data->>'trechoId') stored;
alter table public.medicoes add column if not exists file_hash text generated always as (data->>'fileHash') stored;
alter table public.perfis   add column if not exists auth_id uuid generated always as (nullif(data->>'authId','')::uuid) stored;
create index if not exists ix_trechos_link on public.trechos(link_id);
create index if not exists ix_medicoes_trecho on public.medicoes(trecho_id);
create index if not exists ix_medicoes_hash on public.medicoes(file_hash);
create unique index if not exists ux_perfis_auth on public.perfis(auth_id);

-- ---------- Perfil do usuário logado ----------
create or replace function public.fc_role() returns text language sql stable security definer set search_path = public as $$
  select coalesce((select data->>'role' from public.perfis where auth_id = auth.uid() and coalesce((data->>'ativo')::boolean, true)), 'nenhum')
$$;
create or replace function public.fc_has(roles text[]) returns boolean language sql stable as $$ select public.fc_role() = any(roles) $$;

-- Primeiro usuário vira admin; demais entram como visualizador até o admin promover
create or replace function public.fc_bootstrap_profile() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- SQL Editor / service_role
  -- (colunas geradas ainda não existem num gatilho BEFORE: lê o authId direto do jsonb)
  if nullif(new.data->>'authId','')::uuid is distinct from auth.uid() and public.fc_role() <> 'admin' then raise exception 'Somente o próprio usuário ou o admin cria perfis'; end if;
  if tg_op = 'INSERT' and public.fc_role() <> 'admin' then
    new.data := jsonb_set(new.data, '{role}', to_jsonb(case when exists(select 1 from public.perfis) then 'visualizador' else 'admin' end));
  end if;
  if tg_op = 'UPDATE' and public.fc_role() <> 'admin' and (new.data->>'role') is distinct from (old.data->>'role') then
    raise exception 'Somente o administrador altera níveis de acesso';
  end if;
  return new;
end $$;
drop trigger if exists trg_perfis_guard on public.perfis;
create trigger trg_perfis_guard before insert or update on public.perfis for each row execute function public.fc_bootstrap_profile();

-- ---------- Políticas ----------
do $$
declare t text;
begin
  foreach t in array array['enlaces','trechos','medicoes','anexos','auditoria','manutencoes','versoes_tracado','drive_arquivos','perfis','configuracoes'] loop
    execute format('drop policy if exists fc_select on public.%I', t);
    execute format('create policy fc_select on public.%I for select to authenticated using (public.fc_role() <> ''nenhum'' or %L = ''perfis'')', t, t);
  end loop;
end $$;

-- escrita operacional (cadastro, medições, anexos, manutenção, versões)
do $$
declare t text;
begin
  foreach t in array array['enlaces','trechos','medicoes','anexos','manutencoes','versoes_tracado','drive_arquivos'] loop
    execute format('drop policy if exists fc_insert on public.%I', t);
    execute format('drop policy if exists fc_update on public.%I', t);
    execute format('drop policy if exists fc_delete on public.%I', t);
    execute format('create policy fc_insert on public.%I for insert to authenticated with check (public.fc_has(array[''admin'',''engenheiro'',''supervisor'',''tecnico'']))', t);
    execute format('create policy fc_update on public.%I for update to authenticated using (public.fc_has(array[''admin'',''engenheiro'',''supervisor'',''tecnico'']))', t);
    execute format('create policy fc_delete on public.%I for delete to authenticated using (public.fc_has(array[''admin'',''engenheiro'']))', t);
  end loop;
end $$;

-- Certificação: técnico não pode gravar status "certificado" em trechos
create or replace function public.fc_guard_cert() returns trigger language plpgsql as $$
begin
  if auth.uid() is null then return new; end if; -- SQL Editor / service_role
  if (new.data->'certificacao'->>'status') = 'certificado'
     and (tg_op = 'INSERT' or (old.data->'certificacao') is distinct from (new.data->'certificacao'))
     and not public.fc_has(array['admin','engenheiro','supervisor']) then
    raise exception 'Perfil sem permissão para certificar';
  end if;
  return new;
end $$;
drop trigger if exists trg_trechos_cert on public.trechos;
create trigger trg_trechos_cert before insert or update on public.trechos for each row execute function public.fc_guard_cert();

-- Auditoria: todos inserem, ninguém altera nem apaga (registro permanente)
drop policy if exists fc_insert on public.auditoria;
create policy fc_insert on public.auditoria for insert to authenticated with check (public.fc_role() <> 'nenhum');
-- Histórico permanente: medições não podem ser apagadas
drop policy if exists fc_delete on public.medicoes;

-- Perfis: o próprio usuário cria/edita o seu; admin gerencia todos
drop policy if exists fc_insert on public.perfis; drop policy if exists fc_update on public.perfis;
create policy fc_insert on public.perfis for insert to authenticated with check (auth_id = auth.uid() or public.fc_role() = 'admin');
-- membro migrado do navegador (sem auth_id) assume o próprio perfil no 1º login, pelo e-mail da conta
create policy fc_update on public.perfis for update to authenticated
  using (auth_id = auth.uid() or public.fc_role() = 'admin' or (auth_id is null and lower(data->>'email') = lower(auth.jwt()->>'email')))
  with check (auth_id = auth.uid() or public.fc_role() = 'admin');

-- Configurações técnicas: admin e engenheiro
drop policy if exists fc_write on public.configuracoes;
create policy fc_write on public.configuracoes for all to authenticated using (public.fc_has(array['admin','engenheiro'])) with check (public.fc_has(array['admin','engenheiro']));

-- Carimbo de atualização
create or replace function public.fc_touch() returns trigger language plpgsql as $$ begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['enlaces','trechos','medicoes','anexos','manutencoes','versoes_tracado','perfis','configuracoes'] loop
    execute format('drop trigger if exists trg_touch on public.%I', t);
    execute format('create trigger trg_touch before update on public.%I for each row execute function public.fc_touch()', t);
  end loop; end $$;

-- ---------- Storage (anexos: PDF, SOR, KMZ, fotos) ----------
insert into storage.buckets (id, name, public) values ('anexos', 'anexos', false) on conflict (id) do nothing;
drop policy if exists fc_anexos_read on storage.objects;
drop policy if exists fc_anexos_write on storage.objects;
drop policy if exists fc_anexos_delete on storage.objects;
create policy fc_anexos_read on storage.objects for select to authenticated using (bucket_id = 'anexos' and public.fc_role() <> 'nenhum');
create policy fc_anexos_write on storage.objects for insert to authenticated with check (bucket_id = 'anexos' and public.fc_has(array['admin','engenheiro','supervisor','tecnico']));
create policy fc_anexos_delete on storage.objects for delete to authenticated using (bucket_id = 'anexos' and public.fc_has(array['admin','engenheiro']));

create table if not exists public.scout_clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_name text not null,
  memo text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_scout_clients_tenant
  on public.scout_clients(tenant_id);

create table if not exists public.scout_client_logins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  client_id uuid not null references public.scout_clients(id) on delete cascade,
  site_key text not null,
  username text not null,
  password text not null,
  login_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_scout_logins_tenant
  on public.scout_client_logins(tenant_id);
create index if not exists idx_scout_logins_client
  on public.scout_client_logins(client_id);
create unique index if not exists uq_scout_logins_client_site
  on public.scout_client_logins(tenant_id, client_id, site_key);

alter table public.scout_clients enable row level security;
alter table public.scout_client_logins enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='scout_clients'
      and policyname='select_scout_clients'
  ) then
    create policy select_scout_clients on public.scout_clients
      for select using (tenant_id = public.current_tenant_id() or auth.role() = 'service_role');
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='scout_clients'
      and policyname='write_scout_clients'
  ) then
    create policy write_scout_clients on public.scout_clients
      for all using (tenant_id = public.current_tenant_id() or auth.role() = 'service_role')
      with check (tenant_id = public.current_tenant_id() or auth.role() = 'service_role');
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='scout_client_logins'
      and policyname='select_scout_logins'
  ) then
    create policy select_scout_logins on public.scout_client_logins
      for select using (tenant_id = public.current_tenant_id() or auth.role() = 'service_role');
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='scout_client_logins'
      and policyname='write_scout_logins'
  ) then
    create policy write_scout_logins on public.scout_client_logins
      for all using (tenant_id = public.current_tenant_id() or auth.role() = 'service_role')
      with check (tenant_id = public.current_tenant_id() or auth.role() = 'service_role');
  end if;
end$$;

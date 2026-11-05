-- Huddl pilot schema. Apply once to a dedicated Supabase project.
create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  name text not null,
  allowed_email_domain text,
  logo_data text,
  accent_color text not null default '#ef473d' check (accent_color ~ '^#[0-9a-fA-F]{6}$'),
  timezone text not null default 'Africa/Cairo',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table organizations add column if not exists is_active boolean not null default true;
alter table organizations add column if not exists seat_limit integer not null default 100;
alter table organizations add column if not exists screen_limit integer not null default 3;
alter table organizations add column if not exists enforce_allowlist boolean not null default true;
alter table organizations add column if not exists company_description text not null default '';
alter table organizations add column if not exists policy_context text not null default '';
alter table organizations alter column enforce_allowlist set default true;

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  display_name text not null,
  department text not null default '',
  role text not null default 'employee' check (role in ('owner','admin','employee')),
  password_hash text,
  photo_consent boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id,email)
);
alter table members add column if not exists job_title text not null default '';
alter table members add column if not exists must_change_password boolean not null default false;
alter table members add column if not exists credential_expires_at timestamptz;
alter table members add column if not exists session_version integer not null default 0;
alter table members add column if not exists profile_photo_data text;

create table if not exists employee_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  is_active boolean not null default true,
  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id,email)
);
create index if not exists employee_access_org_active on employee_access (organization_id,is_active);
alter table employee_access add column if not exists access_code_hash text;
insert into employee_access(organization_id,email)
select organization_id,lower(email) from members where role='employee'
on conflict (organization_id,email) do nothing;
update organizations set enforce_allowlist=true where enforce_allowlist=false;

create table if not exists login_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists login_codes_lookup on login_codes (organization_id,email,created_at desc);

create table if not exists auth_rate_limits (
  key text primary key,
  attempts integer not null default 0,
  window_started_at timestamptz not null default now()
);
create index if not exists auth_rate_limits_started on auth_rate_limits (window_started_at);

create table if not exists admin_email_codes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  new_email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists admin_email_codes_member on admin_email_codes (member_id,created_at desc);

create table if not exists admin_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists admin_invites_member on admin_invites (member_id,created_at desc);

create table if not exists polls (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  question text not null check (char_length(question) between 5 and 240),
  status text not null default 'draft' check (status in ('draft','live','closed')),
  mode text not null default 'social' check (mode in ('social','anonymous')),
  opens_at timestamptz,
  closes_at timestamptz,
  created_by uuid references members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_at is null or opens_at is null or closes_at > opens_at)
);
create unique index if not exists one_live_poll_per_org on polls (organization_id) where status='live';
create index if not exists polls_org_created on polls (organization_id,created_at desc);
create index if not exists polls_scheduled on polls (organization_id,opens_at) where status='draft' and opens_at is not null;

create table if not exists poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 100),
  position smallint not null check (position between 0 and 7),
  unique (poll_id,position),
  unique (poll_id,id)
);

create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  poll_id uuid not null references polls(id) on delete cascade,
  option_id uuid not null,
  member_id uuid not null references members(id) on delete cascade,
  show_identity boolean not null default false,
  created_at timestamptz not null default now(),
  unique (poll_id,member_id),
  foreign key (poll_id,option_id) references poll_options(poll_id,id)
);
create index if not exists votes_poll_option on votes (poll_id,option_id);
create index if not exists votes_org_created on votes (organization_id,created_at desc);
create index if not exists votes_member_shared on votes (member_id,poll_id) where show_identity=true;
alter table votes add column if not exists photo_data text;

create table if not exists display_screens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  location text not null default '',
  token uuid not null unique default gen_random_uuid(),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists display_screens_org on display_screens (organization_id,created_at);
insert into display_screens(organization_id,name)
select o.id,'Main office screen' from organizations o
where not exists (select 1 from display_screens s where s.organization_id=o.id);

create or replace function purge_huddl_photos() returns trigger language plpgsql as $$
begin
  if old.status = 'live' and new.status <> 'live' then
    update votes set photo_data = null where poll_id = new.id and photo_data is not null;
  end if;
  return new;
end $$;
drop trigger if exists purge_huddl_photos_on_close on polls;
create trigger purge_huddl_photos_on_close after update of status on polls
  for each row execute function purge_huddl_photos();

create or replace function purge_huddl_photos_on_pause() returns trigger language plpgsql as $$
begin
  if new.is_active = false and old.is_active = true then
    update votes set photo_data = null where organization_id = new.id and photo_data is not null;
  end if;
  return new;
end $$;
drop trigger if exists purge_huddl_photos_on_pause_trigger on organizations;
create trigger purge_huddl_photos_on_pause_trigger after update of is_active on organizations
  for each row execute function purge_huddl_photos_on_pause();

-- Keep timed questions accurate even when no office screen is open. The
-- application also checks on every display, vote, and HR calendar request.
create schema if not exists extensions;
create extension if not exists pg_cron with schema extensions;
create or replace function public.huddl_sync_due_polls() returns void
language plpgsql security definer set search_path = public as $$
declare org_id uuid; due_id uuid;
begin
  for org_id in
    select distinct organization_id from polls
    where (status = 'live' and closes_at <= now())
       or (status = 'draft' and opens_at <= now())
  loop
    perform id from organizations where id = org_id for update;
    update polls set status = 'closed', updated_at = now()
      where organization_id = org_id and status = 'live' and closes_at <= now();
    select id into due_id from polls
      where organization_id = org_id and status = 'draft'
        and opens_at <= now() and closes_at > now()
      order by opens_at desc, id desc limit 1;
    update polls set status = 'closed', updated_at = now()
      where organization_id = org_id and status = 'draft' and opens_at <= now()
        and (closes_at <= now() or id <> due_id);
    if due_id is not null then
      update polls set status = 'closed', updated_at = now()
        where organization_id = org_id and status = 'live';
      update polls set status = 'live', updated_at = now() where id = due_id;
    end if;
  end loop;
  delete from auth_rate_limits where window_started_at < now() - interval '1 day';
end $$;
revoke all on function public.huddl_sync_due_polls() from public, anon, authenticated;
select cron.schedule('huddl-scheduled-polls', '* * * * *',
  'select public.huddl_sync_due_polls()');

create table if not exists audit_events (
  id bigserial primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_id uuid references members(id) on delete set null,
  action text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_org_created on audit_events (organization_id,created_at desc);

-- The browser never connects directly to Postgres. All tenant access goes through
-- authenticated server endpoints; keep Supabase Data API access denied.
alter table organizations enable row level security;
alter table members enable row level security;
alter table employee_access enable row level security;
alter table auth_rate_limits enable row level security;
alter table login_codes enable row level security;
alter table admin_email_codes enable row level security;
alter table admin_invites enable row level security;
alter table polls enable row level security;
alter table poll_options enable row level security;
alter table votes enable row level security;
alter table audit_events enable row level security;
alter table display_screens enable row level security;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='seat_limit_range') then
    alter table organizations add constraint seat_limit_range check (seat_limit between 1 and 50000);
  end if;
  if not exists (select 1 from pg_constraint where conname='screen_limit_range') then
    alter table organizations add constraint screen_limit_range check (screen_limit between 1 and 100);
  end if;
end $$;
revoke all on organizations,members,employee_access,auth_rate_limits,login_codes,admin_email_codes,admin_invites,polls,poll_options,votes,audit_events,display_screens from anon,authenticated;

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
alter table login_codes enable row level security;
alter table polls enable row level security;
alter table poll_options enable row level security;
alter table votes enable row level security;
alter table audit_events enable row level security;
revoke all on organizations,members,login_codes,polls,poll_options,votes,audit_events from anon,authenticated;

-- Peaches shared tree schema for Supabase.
-- 1. In Supabase Dashboard enable Email provider in Authentication.
-- 2. If you do not want email confirmation, disable "Confirm email".
-- 3. Create users with email + password in Authentication > Users, or let them sign up if you add a signup UI later.
-- 4. Run this SQL, replacing owner@example.com and the tree name below.
-- 5. Copy the returned tree id into js/supabase-config.js as treeId.

create extension if not exists pgcrypto;

create table if not exists public.trees (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Общее древо',
  data jsonb not null default '{"people":[],"houses":[]}'::jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists public.tree_members (
  tree_id uuid not null references public.trees(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (tree_id, email)
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'trees'
  ) then
    alter publication supabase_realtime add table public.trees;
  end if;
end $$;

alter table public.trees enable row level security;
alter table public.tree_members enable row level security;

drop policy if exists "Members can read their trees" on public.trees;
drop policy if exists "Editors can update their trees" on public.trees;
drop policy if exists "Members can read tree membership" on public.tree_members;

create policy "Members can read their trees"
on public.trees
for select
to authenticated
using (
  exists (
    select 1
    from public.tree_members member
    where member.tree_id = trees.id
      and lower(member.email) = lower(auth.jwt() ->> 'email')
  )
);

create policy "Editors can update their trees"
on public.trees
for update
to authenticated
using (
  exists (
    select 1
    from public.tree_members member
    where member.tree_id = trees.id
      and lower(member.email) = lower(auth.jwt() ->> 'email')
      and member.role in ('owner', 'editor')
  )
)
with check (
  exists (
    select 1
    from public.tree_members member
    where member.tree_id = trees.id
      and lower(member.email) = lower(auth.jwt() ->> 'email')
      and member.role in ('owner', 'editor')
  )
);

create policy "Members can read tree membership"
on public.tree_members
for select
to authenticated
using (
  exists (
    select 1
    from public.tree_members member
    where member.tree_id = tree_members.tree_id
      and lower(member.email) = lower(auth.jwt() ->> 'email')
  )
);

-- Create the first shared tree and owner membership.
-- Replace owner@example.com before running.
with new_tree as (
  insert into public.trees (name, data, updated_by)
  values ('Общее древо', '{"people":[],"houses":[]}'::jsonb, 'skorpion_lord@mail.ru')
  returning id
)
insert into public.tree_members (tree_id, email, role)
select id, 'skorpion_lord@mail.ru', 'owner'
from new_tree
returning tree_id;

-- Add friends after they have accounts or before they log in:
-- insert into public.tree_members (tree_id, email, role)
-- values
--   ('PASTE_TREE_ID_HERE', 'friend@example.com', 'editor'),
--   ('PASTE_TREE_ID_HERE', 'viewer@example.com', 'viewer');

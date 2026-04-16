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
  is_public boolean not null default true,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.trees
add column if not exists is_public boolean not null default true;

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

grant select on public.trees to anon, authenticated;
grant update on public.trees to authenticated;
grant select on public.tree_members to authenticated;

create or replace function public.is_tree_member(target_tree_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tree_members member
    where member.tree_id = target_tree_id
      and lower(member.email) = lower(auth.jwt() ->> 'email')
  );
$$;

create or replace function public.can_edit_tree(target_tree_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tree_members member
    where member.tree_id = target_tree_id
      and lower(member.email) = lower(auth.jwt() ->> 'email')
      and member.role in ('owner', 'editor')
  );
$$;

revoke all on function public.is_tree_member(uuid) from public;
revoke all on function public.can_edit_tree(uuid) from public;
grant execute on function public.is_tree_member(uuid) to anon, authenticated;
grant execute on function public.can_edit_tree(uuid) to authenticated;

drop policy if exists "Members can read their trees" on public.trees;
drop policy if exists "Editors can update their trees" on public.trees;
drop policy if exists "Members can read tree membership" on public.tree_members;

create policy "Members can read their trees"
on public.trees
for select
to anon, authenticated
using (trees.is_public or public.is_tree_member(trees.id));

create policy "Editors can update their trees"
on public.trees
for update
to authenticated
using (public.can_edit_tree(trees.id))
with check (public.can_edit_tree(trees.id));

create policy "Members can read tree membership"
on public.tree_members
for select
to authenticated
using (public.is_tree_member(tree_members.tree_id));

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

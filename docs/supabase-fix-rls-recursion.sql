-- Fix for: infinite recursion detected in policy for relation "tree_members".
-- Run this once in Supabase SQL Editor for an already-created project.

alter table public.trees
add column if not exists is_public boolean not null default true;

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

grant select on public.trees to anon, authenticated;
grant update on public.trees to authenticated;
grant select on public.tree_members to authenticated;

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

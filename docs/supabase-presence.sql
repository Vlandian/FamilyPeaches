-- Database-backed presence for shared Peaches trees.
-- Run this once in Supabase SQL Editor.
-- It avoids relying on Supabase broadcast websockets for the "who is online" list.

create table if not exists public.tree_presence (
  tree_id uuid not null references public.trees(id) on delete cascade,
  session_id text not null,
  client_id text not null,
  mode text not null check (mode in ('guest', 'viewer', 'editor')),
  selected_ids text[] not null default array[]::text[],
  editing_person_id text not null default '',
  editing_person_name text not null default '',
  updated_at timestamptz not null default now(),
  primary key (tree_id, session_id)
);

create index if not exists tree_presence_tree_updated_idx
on public.tree_presence (tree_id, updated_at desc);

alter table public.tree_presence enable row level security;

grant select, insert, update, delete on public.tree_presence to anon, authenticated;
grant execute on function public.is_tree_member(uuid) to anon, authenticated;

drop policy if exists "Guests and members can read tree presence" on public.tree_presence;
drop policy if exists "Guests and members can insert tree presence" on public.tree_presence;
drop policy if exists "Guests and members can update tree presence" on public.tree_presence;
drop policy if exists "Guests and members can delete tree presence" on public.tree_presence;

create policy "Guests and members can read tree presence"
on public.tree_presence
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.trees tree
    where tree.id = tree_presence.tree_id
      and (tree.is_public or public.is_tree_member(tree.id))
  )
);

create policy "Guests and members can insert tree presence"
on public.tree_presence
for insert
to anon, authenticated
with check (
  exists (
    select 1
    from public.trees tree
    where tree.id = tree_presence.tree_id
      and (tree.is_public or public.is_tree_member(tree.id))
  )
);

create policy "Guests and members can update tree presence"
on public.tree_presence
for update
to anon, authenticated
using (
  exists (
    select 1
    from public.trees tree
    where tree.id = tree_presence.tree_id
      and (tree.is_public or public.is_tree_member(tree.id))
  )
)
with check (
  exists (
    select 1
    from public.trees tree
    where tree.id = tree_presence.tree_id
      and (tree.is_public or public.is_tree_member(tree.id))
  )
);

create policy "Guests and members can delete tree presence"
on public.tree_presence
for delete
to anon, authenticated
using (
  exists (
    select 1
    from public.trees tree
    where tree.id = tree_presence.tree_id
      and (tree.is_public or public.is_tree_member(tree.id))
  )
);

delete from public.tree_presence
where updated_at < now() - interval '1 day';

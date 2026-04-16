-- Component-based realtime sync for shared Peaches trees.
-- Run this once in Supabase SQL Editor for an existing project.
-- It keeps public guest viewing, but editing still requires tree_members role owner/editor.

create table if not exists public.tree_people (
  tree_id uuid not null references public.trees(id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (tree_id, id)
);

create table if not exists public.tree_houses (
  tree_id uuid not null references public.trees(id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (tree_id, id)
);

insert into public.tree_people (tree_id, id, data, updated_at, updated_by)
select
  tree.id,
  person.data ->> 'id',
  person.data,
  now(),
  tree.updated_by
from public.trees tree
cross join lateral jsonb_array_elements(coalesce(tree.data -> 'people', '[]'::jsonb)) as person(data)
where person.data ? 'id'
  and person.data ->> 'id' <> ''
on conflict (tree_id, id) do update
set
  data = excluded.data,
  updated_at = excluded.updated_at,
  updated_by = excluded.updated_by;

insert into public.tree_houses (tree_id, id, data, updated_at, updated_by)
select
  tree.id,
  house.data ->> 'id',
  house.data,
  now(),
  tree.updated_by
from public.trees tree
cross join lateral jsonb_array_elements(coalesce(tree.data -> 'houses', '[]'::jsonb)) as house(data)
where house.data ? 'id'
  and house.data ->> 'id' <> ''
on conflict (tree_id, id) do update
set
  data = excluded.data,
  updated_at = excluded.updated_at,
  updated_by = excluded.updated_by;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tree_people'
  ) then
    alter publication supabase_realtime add table public.tree_people;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tree_houses'
  ) then
    alter publication supabase_realtime add table public.tree_houses;
  end if;
end $$;

alter table public.tree_people enable row level security;
alter table public.tree_houses enable row level security;

grant select on public.tree_people to anon, authenticated;
grant select on public.tree_houses to anon, authenticated;
grant insert, update, delete on public.tree_people to authenticated;
grant insert, update, delete on public.tree_houses to authenticated;
grant update on public.trees to authenticated;
grant execute on function public.is_tree_member(uuid) to anon, authenticated;
grant execute on function public.can_edit_tree(uuid) to authenticated;

drop policy if exists "Guests and members can read tree people" on public.tree_people;
drop policy if exists "Editors can insert tree people" on public.tree_people;
drop policy if exists "Editors can update tree people" on public.tree_people;
drop policy if exists "Editors can delete tree people" on public.tree_people;

drop policy if exists "Guests and members can read tree houses" on public.tree_houses;
drop policy if exists "Editors can insert tree houses" on public.tree_houses;
drop policy if exists "Editors can update tree houses" on public.tree_houses;
drop policy if exists "Editors can delete tree houses" on public.tree_houses;

create policy "Guests and members can read tree people"
on public.tree_people
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.trees tree
    where tree.id = tree_people.tree_id
      and (tree.is_public or public.is_tree_member(tree.id))
  )
);

create policy "Editors can insert tree people"
on public.tree_people
for insert
to authenticated
with check (public.can_edit_tree(tree_people.tree_id));

create policy "Editors can update tree people"
on public.tree_people
for update
to authenticated
using (public.can_edit_tree(tree_people.tree_id))
with check (public.can_edit_tree(tree_people.tree_id));

create policy "Editors can delete tree people"
on public.tree_people
for delete
to authenticated
using (public.can_edit_tree(tree_people.tree_id));

create policy "Guests and members can read tree houses"
on public.tree_houses
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.trees tree
    where tree.id = tree_houses.tree_id
      and (tree.is_public or public.is_tree_member(tree.id))
  )
);

create policy "Editors can insert tree houses"
on public.tree_houses
for insert
to authenticated
with check (public.can_edit_tree(tree_houses.tree_id));

create policy "Editors can update tree houses"
on public.tree_houses
for update
to authenticated
using (public.can_edit_tree(tree_houses.tree_id))
with check (public.can_edit_tree(tree_houses.tree_id));

create policy "Editors can delete tree houses"
on public.tree_houses
for delete
to authenticated
using (public.can_edit_tree(tree_houses.tree_id));

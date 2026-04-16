-- Allow anyone with the site link to view the shared tree.
-- Editing still requires an authenticated tree_members row with role owner/editor.
-- Run this once in Supabase SQL Editor for an existing project.

alter table public.trees
add column if not exists is_public boolean not null default true;

grant select on public.trees to anon, authenticated;
grant update on public.trees to authenticated;
grant select on public.tree_members to authenticated;
grant execute on function public.is_tree_member(uuid) to anon, authenticated;

drop policy if exists "Members can read their trees" on public.trees;

create policy "Members can read their trees"
on public.trees
for select
to anon, authenticated
using (trees.is_public or public.is_tree_member(trees.id));

-- Optional: make only one tree public instead of using the default.
-- update public.trees
-- set is_public = true
-- where id = 'PASTE_TREE_ID_HERE';

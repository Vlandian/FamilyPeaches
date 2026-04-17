-- Run this in Supabase SQL Editor once before using image uploads for shared trees.
-- Images are stored as files in this public bucket; tree rows keep only public URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tree-assets',
  'tree-assets',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "tree assets public read" on storage.objects;
drop policy if exists "tree assets editor insert" on storage.objects;
drop policy if exists "tree assets editor update" on storage.objects;
drop policy if exists "tree assets editor delete" on storage.objects;

create policy "tree assets public read"
on storage.objects
for select
using (bucket_id = 'tree-assets');

create policy "tree assets editor insert"
on storage.objects
for insert
with check (
  bucket_id = 'tree-assets'
  and exists (
    select 1
    from public.tree_members tm
    where tm.tree_id = split_part(name, '/', 1)::uuid
      and lower(tm.email) = lower(auth.email())
      and tm.role in ('owner', 'editor')
  )
);

create policy "tree assets editor update"
on storage.objects
for update
using (
  bucket_id = 'tree-assets'
  and exists (
    select 1
    from public.tree_members tm
    where tm.tree_id = split_part(name, '/', 1)::uuid
      and lower(tm.email) = lower(auth.email())
      and tm.role in ('owner', 'editor')
  )
)
with check (
  bucket_id = 'tree-assets'
  and exists (
    select 1
    from public.tree_members tm
    where tm.tree_id = split_part(name, '/', 1)::uuid
      and lower(tm.email) = lower(auth.email())
      and tm.role in ('owner', 'editor')
  )
);

create policy "tree assets editor delete"
on storage.objects
for delete
using (
  bucket_id = 'tree-assets'
  and exists (
    select 1
    from public.tree_members tm
    where tm.tree_id = split_part(name, '/', 1)::uuid
      and lower(tm.email) = lower(auth.email())
      and tm.role in ('owner', 'editor')
  )
);

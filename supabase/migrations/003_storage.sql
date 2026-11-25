-- Kho tệp bài tập (PDF, ảnh). Riêng tư: gia sư quản lý thư mục của mình,
-- phụ huynh chỉ đọc được tệp của gia sư đang dạy con mình.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('files', 'files', false, 20971520, array['application/pdf','image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do nothing;

create policy "gia sư tải tệp lên" on storage.objects for insert to authenticated
  with check (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_admin()));
create policy "gia sư xóa tệp" on storage.objects for delete to authenticated
  using (bucket_id = 'files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "xem tệp" on storage.objects for select to authenticated
  using (bucket_id = 'files' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or (storage.foldername(name))[1] in (select t::text from public.my_child_tutor_ids() t)
  ));

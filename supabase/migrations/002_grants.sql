-- Quyền cơ bản cho người đã đăng nhập; RLS quyết định họ thấy dòng nào
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.settings, public.groups, public.students, public.group_members, public.lessons, public.attendance, public.payments to authenticated;

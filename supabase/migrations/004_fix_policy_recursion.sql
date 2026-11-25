-- Sửa lỗi "infinite recursion" giữa các quy tắc của groups/group_members và lessons/attendance:
-- quy tắc cho phụ huynh giờ dùng hàm security definer nên không gọi vòng sang bảng kia.
create or replace function public.my_child_group_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.group_id from public.group_members m join public.students s on s.id = m.student_id
  where s.parent_id = (select auth.uid())
$$;
create or replace function public.my_child_lesson_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select a.lesson_id from public.attendance a join public.students s on s.id = a.student_id
  where s.parent_id = (select auth.uid())
$$;
revoke execute on function public.my_child_group_ids(), public.my_child_lesson_ids() from anon, public;
grant execute on function public.my_child_group_ids(), public.my_child_lesson_ids() to authenticated;

alter policy "phụ huynh xem lớp của con" on public.groups
  using (id in (select public.my_child_group_ids()));
alter policy "phụ huynh xem buổi học của con" on public.lessons
  using (id in (select public.my_child_lesson_ids()));

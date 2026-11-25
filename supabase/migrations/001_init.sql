-- Sổ lớp gia sư: cấu trúc dữ liệu và phân quyền
-- Admin (gia sư) chỉ thấy dữ liệu của mình. Phụ huynh chỉ đọc được dữ liệu của con mình.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin','parent')),
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now()
);

create table public.settings (
  tutor_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  charge_unexcused boolean not null default false,
  bank_bin text, acc_no text, acc_name text,
  note_style text not null default 'name' check (note_style in ('name','random')),
  updated_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  subject text not null default 'Tiếng Anh',
  fee_offline integer not null default 0 check (fee_offline >= 0),
  fee_online integer not null default 0 check (fee_online >= 0),
  note text not null default '',
  created_at timestamptz not null default now()
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  parent_name text not null default '',
  phone text not null default '',
  note text not null default '',
  active boolean not null default true,
  parent_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  tutor_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  primary key (group_id, student_id)
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  group_id uuid references public.groups(id) on delete set null,
  group_name text not null default '',
  subject text not null default '',
  mode text not null default 'off' check (mode in ('off','on')),
  date date not null,
  time text not null default '',
  content text not null default '',
  homework_note text not null default '',
  hw_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attendance (
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  tutor_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  status text not null check (status in ('p','e','u')),
  done jsonb not null default '[]'::jsonb,
  fee integer not null default 0 check (fee >= 0),
  comment text not null default '',
  primary key (lesson_id, student_id)
);

create table public.payments (
  student_id uuid not null references public.students(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  tutor_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  paid boolean not null default false,
  amount integer not null default 0,
  paid_date date,
  primary key (student_id, month)
);

create index on public.groups(tutor_id);
create index on public.students(tutor_id);
create index on public.students(parent_id);
create index on public.group_members(tutor_id);
create index on public.group_members(student_id);
create index on public.lessons(tutor_id, date);
create index on public.lessons(group_id);
create index on public.attendance(tutor_id);
create index on public.attendance(student_id);
create index on public.payments(tutor_id);

-- Hồ sơ tự tạo khi có tài khoản mới. Vai trò lấy từ app_metadata (người dùng không tự sửa được).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    case when new.raw_app_meta_data->>'role' = 'parent' then 'parent' else 'admin' end,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    new.raw_app_meta_data->>'phone'
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Hàm kiểm tra quyền (security definer để tránh vòng lặp RLS)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin')
$$;
create or replace function public.my_child_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from public.students where parent_id = (select auth.uid())
$$;
create or replace function public.my_child_tutor_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct tutor_id from public.students where parent_id = (select auth.uid())
$$;
revoke execute on function public.is_admin(), public.my_child_ids(), public.my_child_tutor_ids() from anon, public;
grant execute on function public.is_admin(), public.my_child_ids(), public.my_child_tutor_ids() to authenticated;
revoke execute on function public.handle_new_user() from anon, authenticated, public;

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.groups enable row level security;
alter table public.students enable row level security;
alter table public.group_members enable row level security;
alter table public.lessons enable row level security;
alter table public.attendance enable row level security;
alter table public.payments enable row level security;

-- profiles: mỗi người xem và sửa tên của chính mình; không ai tự đổi vai trò
create policy "xem hồ sơ của mình" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "sửa hồ sơ của mình" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- Admin: toàn quyền trên dữ liệu của chính mình
create policy "admin quản lý" on public.settings for all to authenticated
  using (tutor_id = (select auth.uid()) and (select public.is_admin())) with check (tutor_id = (select auth.uid()) and (select public.is_admin()));
create policy "admin quản lý" on public.groups for all to authenticated
  using (tutor_id = (select auth.uid()) and (select public.is_admin())) with check (tutor_id = (select auth.uid()) and (select public.is_admin()));
create policy "admin quản lý" on public.students for all to authenticated
  using (tutor_id = (select auth.uid()) and (select public.is_admin())) with check (tutor_id = (select auth.uid()) and (select public.is_admin()));
create policy "admin quản lý" on public.group_members for all to authenticated
  using (tutor_id = (select auth.uid()) and (select public.is_admin()))
  with check (tutor_id = (select auth.uid()) and (select public.is_admin())
    and exists (select 1 from public.groups g where g.id = group_id and g.tutor_id = (select auth.uid()))
    and exists (select 1 from public.students s where s.id = student_id and s.tutor_id = (select auth.uid())));
create policy "admin quản lý" on public.lessons for all to authenticated
  using (tutor_id = (select auth.uid()) and (select public.is_admin()))
  with check (tutor_id = (select auth.uid()) and (select public.is_admin())
    and (group_id is null or exists (select 1 from public.groups g where g.id = group_id and g.tutor_id = (select auth.uid()))));
create policy "admin quản lý" on public.attendance for all to authenticated
  using (tutor_id = (select auth.uid()) and (select public.is_admin()))
  with check (tutor_id = (select auth.uid()) and (select public.is_admin())
    and exists (select 1 from public.lessons l where l.id = lesson_id and l.tutor_id = (select auth.uid()))
    and exists (select 1 from public.students s where s.id = student_id and s.tutor_id = (select auth.uid())));
create policy "admin quản lý" on public.payments for all to authenticated
  using (tutor_id = (select auth.uid()) and (select public.is_admin()))
  with check (tutor_id = (select auth.uid()) and (select public.is_admin())
    and exists (select 1 from public.students s where s.id = student_id and s.tutor_id = (select auth.uid())));

-- Phụ huynh: chỉ đọc dữ liệu của con mình
create policy "phụ huynh xem con" on public.students for select to authenticated
  using (parent_id = (select auth.uid()));
create policy "phụ huynh xem điểm danh của con" on public.attendance for select to authenticated
  using (student_id in (select public.my_child_ids()));
create policy "phụ huynh xem buổi học của con" on public.lessons for select to authenticated
  using (exists (select 1 from public.attendance a where a.lesson_id = lessons.id and a.student_id in (select public.my_child_ids())));
create policy "phụ huynh xem học phí của con" on public.payments for select to authenticated
  using (student_id in (select public.my_child_ids()));
create policy "phụ huynh xem tài khoản nhận tiền" on public.settings for select to authenticated
  using (tutor_id in (select public.my_child_tutor_ids()));
create policy "phụ huynh xem lớp của con" on public.groups for select to authenticated
  using (exists (select 1 from public.group_members m where m.group_id = groups.id and m.student_id in (select public.my_child_ids())));
create policy "phụ huynh xem lớp của con" on public.group_members for select to authenticated
  using (student_id in (select public.my_child_ids()));

revoke all on all tables in schema public from anon;

-- Ngày gia sư kiểm tra bài tập về nhà (của buổi giao bài) cho từng học sinh
alter table public.attendance add column if not exists checked_on date;

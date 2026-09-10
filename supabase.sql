-- 1. Bảng lưu thông tin người dùng & vai trò (Role)
CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Bảng lưu Yêu cầu Khảo sát từ Giảng viên
CREATE TABLE IF NOT EXISTS public.survey_requests (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  teacher_email TEXT NOT NULL,
  title TEXT NOT NULL,
  facility_name TEXT NOT NULL,
  categories JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Bảng lưu Bài Báo cáo Khảo sát từ Sinh viên
CREATE TABLE IF NOT EXISTS public.inspections (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  request_id TEXT,
  user_id TEXT,
  user_email TEXT NOT NULL,
  facility_name TEXT NOT NULL,
  description TEXT,
  category_ratings JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'good',
  image_url TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bật Row Level Security (RLS) & Cho phép đọc/ghi công khai (Full Permissive Access cho PWA)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Profiles Access" ON public.profiles;
CREATE POLICY "Public Profiles Access" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Survey Requests Access" ON public.survey_requests;
CREATE POLICY "Public Survey Requests Access" ON public.survey_requests FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public Inspections Access" ON public.inspections;
CREATE POLICY "Public Inspections Access" ON public.inspections FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- AGENCY OS — COMPLETE DATABASE SCHEMA
-- Paste this into Supabase SQL Editor
-- ============================================

-- ============================================
-- 1. PROFILES (extends Supabase Auth users)
-- ============================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'Project Director',
  agency_name TEXT,
  agency_website TEXT,
  phone TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 2. CLIENTS
-- ============================================

CREATE TABLE IF NOT EXISTS public.clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT,
  type TEXT DEFAULT 'smb' CHECK (type IN ('enterprise', 'smb', 'individual', 'potential')),
  industry TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'potential')),
  contact_person TEXT,
  contact_position TEXT,
  email TEXT,
  phone TEXT,
  location TEXT,
  website TEXT,
  logo_url TEXT,
  notes TEXT,
  total_value NUMERIC DEFAULT 0,
  project_count INTEGER DEFAULT 0,
  first_project_date DATE,
  last_interaction_date DATE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ============================================
-- 3. PROJECTS
-- ============================================

CREATE TABLE IF NOT EXISTS public.projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  type TEXT DEFAULT 'بروفايل مؤسسي',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'review', 'completed', 'on-hold', 'cancelled')),
  phase INTEGER DEFAULT 1,
  phase_name TEXT,
  progress INTEGER DEFAULT 0,
  budget NUMERIC,
  currency TEXT DEFAULT 'جنيه',
  start_date DATE,
  due_date DATE,
  completed_date DATE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_projects_client ON public.projects(client_id);
CREATE INDEX idx_projects_status ON public.projects(status);

-- ============================================
-- 4. TASKS
-- ============================================

CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'todo' CHECK (status IN ('todo', 'inprogress', 'review', 'done')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  assignee_id UUID REFERENCES public.profiles(id),
  due_date DATE,
  completed_date DATE,
  tags TEXT[] DEFAULT '{}',
  comments_count INTEGER DEFAULT 0,
  attachments_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_tasks_project ON public.tasks(project_id);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_assignee ON public.tasks(assignee_id);

-- ============================================
-- 5. FILES
-- ============================================

CREATE TABLE IF NOT EXISTS public.files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'document' CHECK (type IN ('image', 'pdf', 'document', 'spreadsheet', 'archive', 'video', 'other')),
  size BIGINT DEFAULT 0,
  mime_type TEXT,
  storage_path TEXT,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  uploaded_by UUID REFERENCES public.profiles(id),
  starred BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_files_project ON public.files(project_id);
CREATE INDEX idx_files_client ON public.files(client_id);

-- ============================================
-- 6. INTERACTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS public.interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT DEFAULT 'meeting' CHECK (type IN ('meeting', 'email', 'call', 'note', 'other')),
  title TEXT NOT NULL,
  description TEXT,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  date DATE DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_interactions_client ON public.interactions(client_id);

-- ============================================
-- 7. COMMENTS
-- ============================================

CREATE TABLE IF NOT EXISTS public.comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('project', 'task', 'client', 'file')),
  entity_id UUID NOT NULL,
  author_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_comments_entity ON public.comments(entity_type, entity_id);

-- ============================================
-- 8. VIEWS
-- ============================================

-- Project overview with client info
CREATE OR REPLACE VIEW public.project_overview AS
SELECT
  p.id,
  p.name,
  c.name AS client_name,
  c.type AS client_type,
  p.status,
  p.phase,
  p.progress,
  p.budget,
  p.due_date,
  COUNT(t.id) AS task_count,
  COUNT(CASE WHEN t.status = 'done' THEN 1 END) AS completed_tasks
FROM public.projects p
LEFT JOIN public.clients c ON p.client_id = c.id
LEFT JOIN public.tasks t ON t.project_id = p.id
GROUP BY p.id, c.name, c.type;

-- Client stats
CREATE OR REPLACE VIEW public.client_stats AS
SELECT
  c.id,
  c.name,
  COUNT(p.id) AS total_projects,
  COALESCE(SUM(p.budget), 0) AS total_revenue,
  COUNT(CASE WHEN p.status = 'active' THEN 1 END) AS active_projects
FROM public.clients c
LEFT JOIN public.projects p ON p.client_id = c.id
GROUP BY c.id, c.name;

-- ============================================
-- 9. ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Policies: Allow all for now (restrict later with auth)
CREATE POLICY "Allow all access" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.clients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.files FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.interactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access" ON public.comments FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 10. FUNCTIONS
-- ============================================

-- Update updated_at automatically
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_files_updated_at BEFORE UPDATE ON public.files FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- DONE! 
-- Run this in Supabase SQL Editor
-- ============================================

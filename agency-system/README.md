# 🚀 AGENCY OS — نظام إدارة الوكالة

نظام شامل لإدارة وكالة إبداعية، مبني بـ Next.js + Supabase.

## ✨ المميزات

### 🎨 التصميم
- **Blueprint Style** — تصميم تقني/هندسي فريد
- **Dark/Light Mode** — ثيم داكن وفاتح مع حفظ التفضيل
- **8 Accent Colors** — ألوان تمييز قابلة للتغيير
- **RTL/LTR** — دعم كامل للعربي والإنجليزي
- **Responsive** — متجاوب مع كل الأجهزة

### 📊 الصفحات (11 صفحة)
| الصفحة | الرابط | الوصف |
|---|---|---|
| Dashboard | `/` | نظرة عامة على كل المشاريع |
| Projects | `/projects` | قائمة + تفاصيل + Workflow (10 مراحل) |
| Clients | `/clients` | قاعدة بيانات العملاء |
| Tasks | `/tasks` | Kanban Board + Drag & Drop |
| Files | `/files` | نظام رفع وإدارة الملفات |
| AI Assistant | `/ai-assistant` | 6 مساعدين ذكيين |
| Reports | `/reports` | تحليلات وإحصائيات |
| Templates | `/templates` | مكتبة 12 قالب جاهز |
| Settings | `/settings` | تخصيص كامل للنظام |
| Auth | `/auth` | تسجيل دخول/إنشاء حساب |
| Test DB | `/test-db` | اختبار الاتصال بـ Supabase |

### 🗄️ قاعدة البيانات (7 جداول)
- `profiles` — المستخدمون
- `clients` — العملاء
- `projects` — المشاريع
- `tasks` — المهام
- `files` — الملفات
- `interactions` — التفاعلات
- `comments` — التعليقات

###  المصادقة
- Supabase Auth
- تسجيل دخول/خروج
- حفظ البروفايل تلقائياً

---

## ️ التقنيات

| الطبقة | التقنية |
|---|---|
| Frontend | Next.js 16 + TypeScript |
| Styling | Tailwind CSS 4 + shadcn/ui |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Fonts | Cairo, Tajawal, Bebas Neue, Space Grotesk |
| Icons | Lucide |

---

## 🚀 التشغيل

```bash
# تثبيت
cd agency-system
npm install

# نسخ ملف البيئة
cp .env.local.example .env.local
# (املأ بـ Supabase URL + anon key)

# التشغيل
npm run dev
```

---

## 📁 الهيكل

```
agency-system/
├── app/              # الصفحات
├── components/       # المكونات
│   ├── layout/       # Sidebar, TopBar
│   └── ui/           # Button, Card, etc.
├── contexts/         # Theme, Language, Accent, Auth
├── lib/
│   ── supabase/     # Database client + functions
├── supabase/
│   ── schema.sql    # Database schema
└── public/           # Static files
```

---

## 🔑 إعداد Supabase

1. اعمل حساب على [supabase.com](https://supabase.com)
2. اعمل مشروع جديد
3. انسخ **Project URL** و **anon key** من Settings → API
4. الصقهم في `.env.local`
5. شغّل `supabase/schema.sql` في SQL Editor

---

## 🗺️ Roadmap

راجع `ROADMAP.md` للتطوير المستقبلي.

---

**Built with ❤️ for creative agencies**

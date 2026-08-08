'use client'

import { useState } from 'react'
import {
  User,
  Bell,
  Shield,
  Palette,
  Globe,
  Database,
  Zap,
  Save,
  Moon,
  Sun,
  Check,
  ChevronLeft,
  LogOut,
  Key,
  Mail,
  Phone,
  Camera,
  Upload,
  AlertTriangle,
  Trash2,
} from 'lucide-react'
import { useTheme } from '@/contexts/theme-context'
import { useLanguage } from '@/contexts/language-context'
import { useAccent } from '@/contexts/accent-context'
import { DatabaseStatus } from '@/components/ui/database-status'

function BlueprintDecorations() {
  return (
    <>
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundImage:
            'linear-gradient(hsl(0 0% 12%) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 12%) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          opacity: 0.3,
        }}
      />
      <div
        className="fixed top-0 right-0 w-[600px] h-[600px] pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(ellipse at top right, hsl(358 75% 50%), transparent 70%)',
          opacity: 0.06,
        }}
      />
    </>
  )
}

function DotGrid({ className = '' }: { className?: string }) {
  return (
    <div className={`inline-grid grid-cols-3 gap-[3px] ${className}`}>
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className="w-1 h-1 rounded-full bg-line-light" />
      ))}
    </div>
  )
}

function CornerMarker() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute top-0 right-0 w-4 h-4 border-t border-l border-line-light" />
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b border-r border-line-light" />
    </div>
  )
}

function TechCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative bg-surface border border-border overflow-hidden ${className}`}>
      <CornerMarker />
      <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-l from-accent/40 via-accent/10 to-transparent" />
      {children}
    </div>
  )
}

/* ============================================
   DATA
   ============================================ */

const settingsSections = [
  { id: 'profile', label: 'الملف الشخصي', labelEn: 'PROFILE', icon: User },
  { id: 'notifications', label: 'الإشعارات', labelEn: 'NOTIFICATIONS', icon: Bell },
  { id: 'appearance', label: 'المظهر', labelEn: 'APPEARANCE', icon: Palette },
  { id: 'language', label: 'اللغة والمنطقة', labelEn: 'LANGUAGE', icon: Globe },
  { id: 'security', label: 'الأمان', labelEn: 'SECURITY', icon: Shield },
  { id: 'integrations', label: 'التكاملات', labelEn: 'INTEGRATIONS', icon: Zap },
  { id: 'storage', label: 'التخزين', labelEn: 'STORAGE', icon: Database },
]

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('profile')
  const [saved, setSaved] = useState(false)
  
  const { theme, setTheme, toggleTheme } = useTheme()
  const { language, setLanguage } = useLanguage()
  const { accent, setAccent, accentColors } = useAccent()

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="relative min-h-screen blueprint-bg">
      <BlueprintDecorations />

      <div className="relative z-10 p-8 space-y-8">
        {/* DATABASE STATUS */}
        <DatabaseStatus />

        {/* HEADER */}
        <header className="relative">
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-[1px] w-8 bg-accent" />
                <span className="font-mono-tech tracking-widest text-[10px]">
                  SETTINGS / 009
                </span>
              </div>

              <h1 className="font-display text-[64px] md:text-[80px] text-fg leading-none tracking-tight">
                SETTINGS<span className="text-text-tertiary">.</span>
              </h1>
              <p className="mt-2 text-text-secondary text-sm max-w-lg">
                تخصيص النظام — الملف الشخصي، الإشعارات، المظهر، والأمان.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                className={`border px-4 py-2 text-xs font-medium rounded-[4px] flex items-center gap-2 transition-colors ${
                  saved
                    ? 'border-green-500 text-green-500 bg-green-500/10'
                    : 'border-accent text-accent bg-accent/10 hover:bg-accent hover:text-accent-foreground'
                }`}
              >
                {saved ? (
                  <>
                    <Check className="h-4 w-4" />
                    <span>تم الحفظ</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>حفظ التغييرات</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="mt-8 h-[1px] w-full bg-gradient-to-l from-accent/30 via-line to-transparent" />
        </header>

        <div className="grid gap-6 md:grid-cols-[250px_1fr]">
          {/* SIDEBAR NAVIGATION */}
          <TechCard className="p-4 h-fit">
            <div className="relative">
              <div className="space-y-1">
                {settingsSections.map((section) => {
                  const Icon = section.icon
                  const isActive = activeSection === section.id
                  return (
                    <button
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className={`w-full flex items-center gap-3 rounded-[4px] px-3 py-2.5 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-surface-raised text-fg border border-line-light'
                          : 'text-text-secondary hover:bg-surface-raised hover:text-fg border border-transparent'
                      }`}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={1.5} />
                      <div className="text-right flex-1">
                        <div className="text-sm">{section.label}</div>
                        <div className="font-mono-tech text-[8px] text-text-tertiary">
                          {section.labelEn}
                        </div>
                      </div>
                      <ChevronLeft className={`h-3 w-3 transition-opacity ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                    </button>
                  )
                })}
              </div>

              <div className="mt-4 pt-4 border-t border-border">
                <button className="w-full flex items-center gap-3 rounded-[4px] px-3 py-2.5 text-sm font-medium text-red-500 hover:bg-red-500/10 transition-colors">
                  <LogOut className="h-4 w-4" />
                  <span>تسجيل الخروج</span>
                </button>
              </div>
            </div>
          </TechCard>

          {/* CONTENT AREA */}
          <div className="space-y-6">
            {/* Profile Section */}
            {activeSection === 'profile' && (
              <>
                <TechCard className="p-6">
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="h-[1px] w-6 bg-accent" />
                      <span className="font-mono-tech tracking-widest text-[10px]">
                        PROFILE / INFO
                      </span>
                    </div>

                    {/* Avatar */}
                    <div className="flex items-center gap-6 mb-6">
                      <div className="relative">
                        <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-accent bg-accent/10">
                          <User className="h-8 w-8 text-accent" />
                        </div>
                        <button className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-raised">
                          <Camera className="h-3 w-3 text-text-secondary" />
                        </button>
                      </div>
                      <div>
                        <h3 className="font-display text-2xl text-fg">أحمد محمد</h3>
                        <p className="font-mono-tech text-[10px] text-text-secondary">
                          AHMED MOHAMED · PROJECT DIRECTOR
                        </p>
                        <button className="mt-2 border border-border bg-surface-raised rounded-[4px] px-3 py-1 text-[10px] font-medium text-text-secondary hover:border-accent hover:text-accent transition-colors flex items-center gap-1">
                          <Upload className="h-3 w-3" />
                          <span>تغيير الصورة</span>
                        </button>
                      </div>
                    </div>

                    {/* Form */}
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="font-mono-tech text-[10px] text-text-secondary mb-2 block">
                          الاسم الكامل
                        </label>
                        <input
                          type="text"
                          defaultValue="أحمد محمد"
                          className="w-full border border-border bg-surface-raised rounded-[4px] px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent"
                        />
                      </div>
                      <div>
                        <label className="font-mono-tech text-[10px] text-text-secondary mb-2 block">
                          المنصب
                        </label>
                        <input
                          type="text"
                          defaultValue="مدير المشروع"
                          className="w-full border border-border bg-surface-raised rounded-[4px] px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent"
                        />
                      </div>
                      <div>
                        <label className="font-mono-tech text-[10px] text-text-secondary mb-2 block">
                          البريد الإلكتروني
                        </label>
                        <div className="relative">
                          <Mail className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                          <input
                            type="email"
                            defaultValue="ahmed@agency.com"
                            className="w-full border border-border bg-surface-raised rounded-[4px] px-3 py-2 pr-9 text-sm text-fg focus:outline-none focus:border-accent"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="font-mono-tech text-[10px] text-text-secondary mb-2 block">
                          الهاتف
                        </label>
                        <div className="relative">
                          <Phone className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                          <input
                            type="tel"
                            defaultValue="+20 100 123 4567"
                            className="w-full border border-border bg-surface-raised rounded-[4px] px-3 py-2 pr-9 text-sm text-fg focus:outline-none focus:border-accent"
                          />
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <label className="font-mono-tech text-[10px] text-text-secondary mb-2 block">
                          نبذة شخصية
                        </label>
                        <textarea
                          rows={3}
                          defaultValue="مدير مشاريع إبداعية بخبرة +10 سنوات في إدارة وكالات التصميم والبراندنج."
                          className="w-full border border-border bg-surface-raised rounded-[4px] px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent resize-none"
                        />
                      </div>
                    </div>
                  </div>
                </TechCard>

                <TechCard className="p-6">
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="h-[1px] w-6 bg-accent" />
                      <span className="font-mono-tech tracking-widest text-[10px]">
                        AGENCY / INFO
                      </span>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="font-mono-tech text-[10px] text-text-secondary mb-2 block">
                          اسم الوكالة
                        </label>
                        <input
                          type="text"
                          defaultValue="وكالة العز الإبداعية"
                          className="w-full border border-border bg-surface-raised rounded-[4px] px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent"
                        />
                      </div>
                      <div>
                        <label className="font-mono-tech text-[10px] text-text-secondary mb-2 block">
                          الموقع الإلكتروني
                        </label>
                        <input
                          type="text"
                          defaultValue="agency.com"
                          className="w-full border border-border bg-surface-raised rounded-[4px] px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent"
                        />
                      </div>
                    </div>
                  </div>
                </TechCard>
              </>
            )}

            {/* Notifications Section */}
            {activeSection === 'notifications' && (
              <TechCard className="p-6">
                <div className="relative">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-[1px] w-6 bg-accent" />
                    <span className="font-mono-tech tracking-widest text-[10px]">
                      NOTIFICATION / PREFERENCES
                    </span>
                  </div>

                  <div className="space-y-4">
                    {[
                      { label: 'إشعارات المشاريع', desc: 'تنبيهات عند تغيير حالة المشروع', enabled: true },
                      { label: 'إشعارات المهام', desc: 'تنبيهات عند تعيين مهمة جديدة', enabled: true },
                      { label: 'إشعارات العملاء', desc: 'تنبيهات عند رسائل العملاء', enabled: true },
                      { label: 'التقارير الأسبوعية', desc: 'ملخص أسبوعي بالأداء', enabled: false },
                      { label: 'إشعارات البريد', desc: 'استلام نسخة من كل إيميل', enabled: false },
                      { label: 'إشعارات WhatsApp', desc: 'تنبيهات عبر واتساب', enabled: true },
                    ].map((item, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-4 border border-border rounded-[4px]"
                      >
                        <div>
                          <h4 className="text-sm font-semibold text-fg">{item.label}</h4>
                          <p className="text-xs text-text-tertiary mt-1">{item.desc}</p>
                        </div>
                        <button
                          className={`w-10 h-5 rounded-full transition-colors relative ${
                            item.enabled ? 'bg-accent' : 'bg-border'
                          }`}
                        >
                          <div
                            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                              item.enabled ? 'right-0.5' : 'left-0.5'
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </TechCard>
            )}

            {/* Appearance Section */}
            {activeSection === 'appearance' && (
              <TechCard className="p-6">
                <div className="relative">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-[1px] w-6 bg-accent" />
                    <span className="font-mono-tech tracking-widest text-[10px]">
                      APPEARANCE / SETTINGS
                    </span>
                  </div>

                  <div className="space-y-6">
                    {/* Theme */}
                    <div>
                      <label className="font-mono-tech text-[10px] text-text-secondary mb-3 block">
                        المظهر (Theme)
                      </label>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { id: 'dark', label: 'Dark', icon: Moon },
                          { id: 'light', label: 'Light', icon: Sun },
                        ].map((option) => {
                          const Icon = option.icon
                          return (
                            <button
                              key={option.id}
                              onClick={() => setTheme(option.id as any)}
                              className={`border rounded-[4px] p-4 flex flex-col items-center gap-2 transition-colors ${
                                theme === option.id
                                  ? 'border-accent bg-accent/10'
                                  : 'border-border bg-surface-raised hover:border-line-light'
                              }`}
                            >
                              <Icon className="h-6 w-6" strokeWidth={1.5} />
                              <span className="text-xs font-medium text-fg">{option.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Color Accent */}
                    <div>
                      <label className="font-mono-tech text-[10px] text-text-secondary mb-3 block">
                        لون التمييز (Accent Color)
                      </label>
                      <div className="flex items-center gap-3 flex-wrap">
                        {accentColors.map((c) => (
                          <button
                            key={c.name}
                            onClick={() => setAccent(c)}
                            className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                              accent.name === c.name ? 'border-white scale-110' : 'border-transparent'
                            }`}
                            style={{ backgroundColor: `hsl(${c.hsl})` }}
                            title={c.name}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </TechCard>
            )}

            {/* Language Section */}
            {activeSection === 'language' && (
              <TechCard className="p-6">
                <div className="relative">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-[1px] w-6 bg-accent" />
                    <span className="font-mono-tech tracking-widest text-[10px]">
                      LANGUAGE / REGION
                    </span>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="font-mono-tech text-[10px] text-text-secondary mb-2 block">
                        اللغة
                      </label>
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value as any)}
                        className="w-full border border-border bg-surface-raised rounded-[4px] px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent"
                      >
                        <option value="ar">العربية</option>
                        <option value="en">English</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-mono-tech text-[10px] text-text-secondary mb-2 block">
                        اتجاه النص
                      </label>
                      <div className="flex items-center gap-2 border border-border bg-surface-raised rounded-[4px] px-3 py-2 text-sm text-fg">
                        <Globe className="h-4 w-4" />
                        <span>{language === 'ar' ? 'RTL (من اليمين لليسار)' : 'LTR (من اليسار لليمين)'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </TechCard>
            )}

            {/* Security Section */}
            {activeSection === 'security' && (
              <TechCard className="p-6">
                <div className="relative">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-[1px] w-6 bg-accent" />
                    <span className="font-mono-tech tracking-widest text-[10px]">
                      SECURITY / SETTINGS
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="font-mono-tech text-[10px] text-text-secondary mb-2 block">
                        كلمة المرور الحالية
                      </label>
                      <div className="relative">
                        <Key className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                        <input
                          type="password"
                          placeholder="••••••••"
                          className="w-full border border-border bg-surface-raised rounded-[4px] px-3 py-2 pr-9 text-sm text-fg focus:outline-none focus:border-accent"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="font-mono-tech text-[10px] text-text-secondary mb-2 block">
                        كلمة المرور الجديدة
                      </label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        className="w-full border border-border bg-surface-raised rounded-[4px] px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div>
                      <label className="font-mono-tech text-[10px] text-text-secondary mb-2 block">
                        تأكيد كلمة المرور
                      </label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        className="w-full border border-border bg-surface-raised rounded-[4px] px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent"
                      />
                    </div>

                    <div className="pt-4 border-t border-border">
                      <h4 className="text-sm font-semibold text-fg mb-3">المصادقة الثنائية (2FA)</h4>
                      <p className="text-xs text-text-tertiary mb-3">
                        أضف طبقة أمان إضافية لحسابك
                      </p>
                      <button className="border border-accent text-accent px-4 py-2 text-xs font-medium rounded-[4px] hover:bg-accent hover:text-accent-foreground transition-colors">
                        تفعيل 2FA
                      </button>
                    </div>
                  </div>
                </div>
              </TechCard>
            )}

            {/* Integrations Section */}
            {activeSection === 'integrations' && (
              <TechCard className="p-6">
                <div className="relative">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-[1px] w-6 bg-accent" />
                    <span className="font-mono-tech tracking-widest text-[10px]">
                      INTEGRATIONS / LIST
                    </span>
                  </div>

                  <div className="space-y-3">
                    {[
                      { name: 'Google Drive', status: 'متصل', connected: true },
                      { name: 'Slack', status: 'متصل', connected: true },
                      { name: 'Stripe', status: 'غير متصل', connected: false },
                      { name: 'WhatsApp API', status: 'غير متصل', connected: false },
                      { name: 'OpenAI API', status: 'متصل', connected: true },
                    ].map((integration, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-4 border border-border rounded-[4px]"
                      >
                        <div className="flex items-center gap-3">
                          <Zap className="h-5 w-5 text-text-tertiary" />
                          <div>
                            <h4 className="text-sm font-semibold text-fg">{integration.name}</h4>
                            <span className={`text-[10px] font-mono-tech ${integration.connected ? 'text-green-500' : 'text-text-tertiary'}`}>
                              {integration.status}
                            </span>
                          </div>
                        </div>
                        <button
                          className={`border px-3 py-1.5 text-[10px] font-medium rounded-[4px] transition-colors ${
                            integration.connected
                              ? 'border-border text-text-secondary hover:border-red-500 hover:text-red-500'
                              : 'border-accent text-accent hover:bg-accent hover:text-accent-foreground'
                          }`}
                        >
                          {integration.connected ? 'إلغاء الاتصال' : 'اتصال'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </TechCard>
            )}

            {/* Storage Section */}
            {activeSection === 'storage' && (
              <TechCard className="p-6">
                <div className="relative">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="h-[1px] w-6 bg-accent" />
                    <span className="font-mono-tech tracking-widest text-[10px]">
                      STORAGE / USAGE
                    </span>
                  </div>

                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-fg">المساحة المستخدمة</span>
                      <span className="font-mono-tech text-[10px] text-text-secondary">
                        1.2 GB / 5 GB
                      </span>
                    </div>
                    <div className="w-full h-2 bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-accent rounded-full" style={{ width: '24%' }} />
                    </div>
                  </div>

                  <div className="space-y-3">
                    {[
                      { name: 'الملفات المرفقة', size: '450 MB', percentage: 37 },
                      { name: 'صور المشاريع', size: '380 MB', percentage: 31 },
                      { name: 'مستندات', size: '220 MB', percentage: 18 },
                      { name: 'أخرى', size: '150 MB', percentage: 12 },
                    ].map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border border-border rounded-[4px]">
                        <div>
                          <h4 className="text-sm font-medium text-fg">{item.name}</h4>
                          <span className="font-mono-tech text-[10px] text-text-tertiary">
                            {item.size}
                          </span>
                        </div>
                        <div className="w-24 h-1 bg-border rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent rounded-full"
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 pt-4 border-t border-border">
                    <div className="flex items-start gap-3 p-4 border border-yellow-500/30 bg-yellow-500/5 rounded-[4px]">
                      <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
                      <div>
                        <h4 className="text-sm font-semibold text-fg mb-1">منطقة الخطر</h4>
                        <p className="text-xs text-text-tertiary mb-3">
                          حذف الحساب نهائيًا مع جميع البيانات
                        </p>
                        <button className="border border-red-500/30 text-red-500 px-3 py-1.5 text-[10px] font-medium rounded-[4px] hover:bg-red-500/10 transition-colors flex items-center gap-1">
                          <Trash2 className="h-3 w-3" />
                          <span>حذف الحساب</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </TechCard>
            )}
          </div>
        </div>

        {/* FOOTER */}
        <footer className="relative pt-8">
          <div className="h-[1px] w-full bg-gradient-to-l from-line-light via-line to-transparent mb-6" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <DotGrid />
              <span className="font-mono-tech text-[10px] text-text-tertiary">
                SETTINGS · ALL CHANGES SAVED LOCALLY
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="font-mono-tech text-[10px] text-text-tertiary">
                SYSTEM ACTIVE · PREFERENCES SYNCED
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

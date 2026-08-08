'use client'

import { useState } from 'react'
import {
  Sparkles,
  Send,
  Copy,
  Check,
  FileText,
  Search,
  BarChart3,
  Target,
  Languages,
  ShieldCheck,
  Bot,
  User,
  Clock,
  Zap,
  Lightbulb,
  MessageSquare,
  FolderKanban,
  ChevronDown,
} from 'lucide-react'

/* ============================================
   BLUEPRINT COMPONENTS
   ============================================ */

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
          opacity: 0.08,
        }}
      />
      <div
        className="fixed bottom-0 left-0 w-[500px] h-[500px] pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(ellipse at bottom left, hsl(358 75% 50%), transparent 70%)',
          opacity: 0.05,
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
   TYPES
   ============================================ */

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  type?: 'text' | 'suggestion' | 'analysis'
}

interface AIAssistant {
  id: string
  name: string
  nameAr: string
  description: string
  icon: React.ElementType
  color: string
}

/* ============================================
   DATA
   ============================================ */

const aiAssistants: AIAssistant[] = [
  {
    id: 'content',
    name: 'CONTENT',
    nameAr: 'مساعد المحتوى',
    description: 'كتابة وتطوير المحتوى احترافي',
    icon: FileText,
    color: 'text-blue-500',
  },
  {
    id: 'research',
    name: 'RESEARCH',
    nameAr: 'مساعد البحث',
    description: 'تحليل السوق والمنافسين',
    icon: Search,
    color: 'text-green-500',
  },
  {
    id: 'strategy',
    name: 'STRATEGY',
    nameAr: 'مساعد الاستراتيجية',
    description: 'تطوير استراتيجيات المحتوى والتصميم',
    icon: Target,
    color: 'text-accent',
  },
  {
    id: 'translation',
    name: 'TRANSLATION',
    nameAr: 'مساعد الترجمة',
    description: 'ترجمة احترافية عربي/إنجليزي',
    icon: Languages,
    color: 'text-purple-500',
  },
  {
    id: 'qa',
    name: 'QA CHECK',
    nameAr: 'مساعد الجودة',
    description: 'مراجعة وضمان جودة المحتوى',
    icon: ShieldCheck,
    color: 'text-yellow-500',
  },
  {
    id: 'analysis',
    name: 'ANALYSIS',
    nameAr: 'مساعد التحليل',
    description: 'تحليل البيانات والتقارير',
    icon: BarChart3,
    color: 'text-pink-500',
  },
]

const projects = [
  { id: '001', name: 'العز العالمية — بروفايل FM' },
  { id: '002', name: 'ABC — إعادة تصميم الموقع' },
  { id: '003', name: 'XYZ — هوية بصرية كاملة' },
  { id: '004', name: 'DEF — حملة تسويقية' },
]

const quickPrompts = [
  'اكتب رسالة رئيس مجلس الإدارة',
  'حلل المنافسين في سوق إدارة المرافق',
  'طور استراتيجية محتوى للبروفايل',
  'ترجم المحتوى للعربية',
  'راجع الجودة اللغوية',
  'اقترح عناوين جذابة',
]

/* ============================================
   PAGE
   ============================================ */

export default function AIAssistantPage() {
  const [selectedAssistant, setSelectedAssistant] = useState<string | null>('content')
  const [selectedProject, setSelectedProject] = useState<string>('001')
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '001',
      role: 'assistant',
      content: 'مرحباً! أنا مساعدك الذكي لتطوير المحتوى. كيف يمكنني مساعدتك اليوم؟',
      timestamp: '10:00 ص',
      type: 'text',
    },
  ])
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)

  const handleSend = () => {
    if (!input.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      type: 'text',
    }

    setMessages([...messages, userMessage])
    setInput('')
    setIsTyping(true)

    // Simulate AI response
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: generateAIResponse(input),
        timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        type: 'suggestion',
      }
      setMessages((prev) => [...prev, assistantMessage])
      setIsTyping(false)
    }, 1500)
  }

  const generateAIResponse = (prompt: string): string => {
    const responses: Record<string, string> = {
      'رسالة رئيس مجلس الإدارة': `## رسالة رئيس مجلس الإدارة

بسم الله الرحمن الرحيم

يسعدني أن أتقدم إليكم بهذا البروفايل الذي يعكس رؤية شركة العز العالمية في قطاع إدارة المرافق.

منذ تأسيسنا عام 1979، ونحن نلتزم بتقديم خدمات متكاملة تجمع بين الخبرة الطويلة والاحترافية العالية. اليوم، نفخر بتوسيع نطاق خدماتنا ليشمل إدارة المرافق والمرافق، مستفيدين من أكثر من 45 عاماً من الخبرة في قطاع المقاولات والبناء.

نؤمن بأن من بنى المبنى هو الأقدر على رعايته وصيانته. لذلك، نقدم خدماتنا بخبرة فريدة تجمع بين فهم عميق للبنى التحتية وقدرة تقنية عالية على إدارة وصيانة المرافق بأعلى معايير الجودة العالمية.

نتطلع إلى شراكة مثمرة معكم، ونعدكم بالالتزام الكامل بالجودة والتميز في كل مشروع نعمل عليه.

وتقبلوا فائق الاحترام والتقدير،

**رئيس مجلس الإدارة**
شركة العز العالمية للتجارة العامة والمقاولات`,

      'تحليل المنافسين': `## تحليل المنافسين — سوق إدارة المرافق في السعودية

### المنافسون الرئيسيون:

**1. FMCO (Facilities Management Company)**
- التأسيس: 2018
- المقر: الدمام
- الموظفون: ~1,340
- الشهادات: 7 شهادات ISO
- رأس المال: 140 مليون ريال
- **نقاط القوة**: جزء من مجموعة اليمامة، presence حكومي قوي
- **نقاط الضعف**: تصميم تقليدي، محتوى طويل ومتكرر

**2. EMCOR (EFS)**
- إيرادات عالمية: 12.6 مليار دولار
- **نقاط القوة**: خبرة عالمية، تقنية متقدمة
- **نقاط الضعف**: غير مخصص للسوق السعودي بشكل كافٍ

**3. Musanadah**
- **نقاط القوة**: مشاريع حكومية كبيرة
- **نقاط الضعف**: تصميم قديم

### الفرص لشركة العز:
✅ الاستفادة من التراث الطويل (1979)
✅ التخصص في FM مع خلفية إنشائية قوية
✅ تصميم عصري يميزنا عن المنافسين
✅ محتوى مكثف وموجه للنتائج`,

      'استراتيجية المحتوى': `## استراتيجية محتوى البروفايل المؤسسي

### الهيكل المقترح (15-20 صفحة):

**الصفحة 1: الغلاف**
- شعار العز FM
- صورة رئيسية قوية
- Tagline: "من بنى المبنى... هو الأقدر على رعايته"

**الصفحة 2-3: عن الشركة**
- قصة التأسيس (1979)
- الرحلة من الكويت للسعودية
- الرؤية والرسالة

**الصفحة 4: رسالة الرئيس**
- صورة احترافية
- رسالة شخصية تلهم الثقة

**الصفحة 5: الرؤية والرسالة والقيم**
- عبارات ملهمة ومختصرة
- 4-6 قيم أساسية مع أيقونات مخصصة

**الصفحة 6-9: الخدمات**
- صفحة لكل خدمة رئيسية
- أيقونات + وصف مختصر + فوائد

**الصفحة 10: الإحصائيات**
- أرقام ضخمة (موظفين، مشاريع، عملاء)
- إنفوجرافيك جذاب

**الصفحة 11-13: المشاريع**
- 5-8 مشاريع مع صور حقيقية
- اسم العميل + الموقع + نوع الخدمة

**الصفحة 14: العملاء**
- شبكة لوجوهات العملاء
- تصنيف حسب القطاع

**الصفحة 15: الشهادات**
- ISO + تراخيص + جوائز
- عرض بصري احترافي

**الصفحة 16: الفريق**
- صور القيادة + خبرات

**الصفحة 17: الفروع**
- خريطة + عناوين

**الصفحة 18: التواصل**
- بيانات + QR Code + خريطة`,
    }

    for (const [key, value] of Object.entries(responses)) {
      if (prompt.includes(key)) return value
    }

    return `شكراً لسؤالك! بناءً على تحليلي، إليك الاقتراح:

**النقاط الرئيسية:**

1. **الوضوح والاختصار** — كل فقرة يجب أن تخدم هدفاً واحداً واضحاً
2. **الأرقام تتحدث** — استخدم إحصائيات محددة بدل الوصف العام
3. **القصة أولاً** — ابدأ بقصة الشركة قبل التفاصيل التقنية
4. **Vision 2030** — اربط خدماتك بأهداف الرؤية السعودية
5. **إثبات اجتماعي** — استخدم لوجوهات العملاء والشهادات

**التوصية التالية:**
أنصح بالتركيز على التميز التنافسي: "45 سنة خبرة في البناء = صيانة أذكى وأعمق"

هل تريد أن أتوسع في أي نقطة؟`
  }

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const selectedAssistantData = aiAssistants.find((a) => a.id === selectedAssistant)
  const selectedProjectData = projects.find((p) => p.id === selectedProject)

  return (
    <div className="relative min-h-screen blueprint-bg">
      <BlueprintDecorations />

      <div className="relative z-10 p-8 space-y-8">
        {/* HEADER */}
        <header className="relative">
          <div className="flex items-end justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-[1px] w-8 bg-accent" />
                <span className="font-mono-tech tracking-widest text-[10px]">
                  AI ASSISTANT / 006
                </span>
              </div>

              <h1 className="font-display text-[64px] md:text-[80px] text-fg leading-none tracking-tight">
                AI<span className="text-text-tertiary">.</span>
              </h1>
              <p className="mt-2 text-text-secondary text-sm max-w-lg">
                مساعدك الذكي لتطوير المحتوى، البحث، التحليل، والترجمة.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <DotGrid />
            </div>
          </div>

          <div className="mt-8 h-[1px] w-full bg-gradient-to-l from-accent/30 via-line to-transparent" />
        </header>

        {/* AI ASSISTANTS GRID */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="h-[1px] w-6 bg-accent" />
            <span className="font-mono-tech tracking-widest text-[10px]">
              SELECT / ASSISTANT
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            {aiAssistants.map((assistant) => {
              const Icon = assistant.icon
              const isSelected = selectedAssistant === assistant.id
              return (
                <button
                  key={assistant.id}
                  onClick={() => setSelectedAssistant(assistant.id)}
                  className={`relative p-4 border transition-all ${
                    isSelected
                      ? 'border-accent bg-accent/10'
                      : 'border-border bg-surface hover:border-line-light'
                  }`}
                >
                  <CornerMarker />
                  <div className="relative">
                    <Icon className={`h-8 w-8 ${assistant.color} mb-3`} strokeWidth={1.5} />
                    <h3 className="font-display text-lg text-fg leading-none mb-1">
                      {assistant.name}
                    </h3>
                    <p className="font-mono-tech text-[9px] text-text-secondary mb-2">
                      {assistant.nameAr}
                    </p>
                    <p className="text-[10px] text-text-tertiary line-clamp-2">
                      {assistant.description}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* PROJECT SELECTOR */}
        <TechCard className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-accent" strokeWidth={1.5} />
              <span className="font-mono-tech text-[10px] text-text-secondary">
                المشروع المرتبط:
              </span>
            </div>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="flex-1 bg-surface-raised border border-border rounded-[4px] px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>
        </TechCard>

        {/* CHAT INTERFACE */}
        <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
          {/* Quick Prompts */}
          <TechCard className="p-5">
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-[1px] w-6 bg-accent" />
                <span className="font-mono-tech tracking-widest text-[10px]">
                  QUICK / PROMPTS
                </span>
              </div>

              <div className="space-y-2">
                {quickPrompts.map((prompt, index) => (
                  <button
                    key={index}
                    onClick={() => handleQuickPrompt(prompt)}
                    className="w-full text-right border border-border bg-surface-raised rounded-[4px] px-3 py-2 text-xs text-text-secondary hover:border-accent hover:text-accent transition-colors"
                  >
                    <Lightbulb className="h-3 w-3 inline ml-2 text-accent" />
                    {prompt}
                  </button>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-border">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="h-4 w-4 text-accent" />
                  <span className="font-mono-tech text-[10px] text-text-secondary">
                    نصائح الاستخدام
                  </span>
                </div>
                <ul className="space-y-2 text-[10px] text-text-tertiary">
                  <li className="flex items-start gap-2">
                    <span className="text-accent mt-0.5">•</span>
                    <span>كن محدداً في طلبك للحصول على نتائج أفضل</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent mt-0.5">•</span>
                    <span>اختر المشروع المرتبط لنتائج مخصصة</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-accent mt-0.5">•</span>
                    <span>استخدم Quick Prompts للبدء السريع</span>
                  </li>
                </ul>
              </div>
            </div>
          </TechCard>

          {/* Chat Area */}
          <TechCard className="flex flex-col h-[600px]">
            <div className="relative flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.role === 'user' ? 'flex-row-reverse' : ''
                  }`}
                >
                  <div className="flex-shrink-0">
                    {message.role === 'assistant' ? (
                      <div className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-accent bg-accent/10">
                        <Bot className="h-4 w-4 text-accent" />
                      </div>
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-border bg-surface-raised">
                        <User className="h-4 w-4 text-text-secondary" />
                      </div>
                    )}
                  </div>

                  <div className={`flex-1 ${message.role === 'user' ? 'text-left' : ''}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono-tech text-[9px] text-text-tertiary">
                        {message.role === 'assistant' ? 'AI ASSISTANT' : 'YOU'}
                      </span>
                      <span className="font-mono-tech text-[9px] text-text-tertiary">
                        · {message.timestamp}
                      </span>
                    </div>

                    <div
                      className={`border rounded-[4px] p-4 ${
                        message.role === 'assistant'
                          ? 'border-border bg-surface-raised'
                          : 'border-accent/30 bg-accent/5'
                      }`}
                    >
                      <div className="text-sm text-fg whitespace-pre-wrap leading-relaxed">
                        {message.content}
                      </div>
                    </div>

                    {message.role === 'assistant' && (
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => copyToClipboard(message.content)}
                          className="flex items-center gap-1 border border-border bg-surface rounded-[4px] px-2 py-1 text-[9px] font-mono-tech text-text-secondary hover:border-accent hover:text-accent transition-colors"
                        >
                          <Copy className="h-3 w-3" />
                          <span>نسخ</span>
                        </button>
                        <button className="flex items-center gap-1 border border-border bg-surface rounded-[4px] px-2 py-1 text-[9px] font-mono-tech text-text-secondary hover:border-accent hover:text-accent transition-colors">
                          <Check className="h-3 w-3" />
                          <span>تطبيق</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-[4px] border border-accent bg-accent/10">
                    <Bot className="h-4 w-4 text-accent" />
                  </div>
                  <div className="flex-1">
                    <div className="border border-border bg-surface-raised rounded-[4px] p-4">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                        <div className="h-2 w-2 rounded-full bg-accent animate-pulse" style={{ animationDelay: '0.2s' }} />
                        <div className="h-2 w-2 rounded-full bg-accent animate-pulse" style={{ animationDelay: '0.4s' }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="border-t border-border p-4">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="اكتب رسالتك هنا..."
                  className="flex-1 bg-surface-raised border border-border rounded-[4px] px-4 py-3 text-sm text-fg placeholder:text-text-tertiary focus:outline-none focus:border-accent"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || isTyping}
                  className="border border-accent bg-accent/10 text-accent rounded-[4px] p-3 hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <p className="font-mono-tech text-[9px] text-text-tertiary mt-2">
                Press Enter to send · AI responses are suggestions only
              </p>
            </div>
          </TechCard>
        </div>

        {/* FOOTER */}
        <footer className="relative pt-8">
          <div className="h-[1px] w-full bg-gradient-to-l from-line-light via-line to-transparent mb-6" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <DotGrid />
              <span className="font-mono-tech text-[10px] text-text-tertiary">
                AI ASSISTANT · {selectedAssistantData?.name} · PROJECT {selectedProject}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="font-mono-tech text-[10px] text-text-tertiary">
                AI MODEL ONLINE · READY TO ASSIST
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}

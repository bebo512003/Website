/** Public contact details for the site owner, not account or CRM data. */
const email = 'beshoyashrafoffecial@gmail.com'
const phone = '+201008239401'

export const SITE_CONTACT = {
  email,
  phone,
  mailto: `mailto:${email}`,
  tel: `tel:${phone}`,
  whatsapp: `https://wa.me/${phone.replace(/\D/g, '')}`,
  behance: 'https://www.behance.net/beshoy-ashraf51',
  linkedin: 'https://www.linkedin.com/in/beshoy-ashraf51/',
} as const

export const REQUEST_RESPONSE_TIME = {
  en: '1–2 business days',
  ar: 'يوم إلى يومي عمل',
} as const

export const SITE_CONTACT_LINKS = [
  { key: 'email', href: SITE_CONTACT.mailto, en: 'Email', ar: 'البريد الإلكتروني', value: SITE_CONTACT.email, external: false },
  { key: 'phone', href: SITE_CONTACT.tel, en: 'Call', ar: 'اتصال', value: SITE_CONTACT.phone, external: false },
  { key: 'whatsapp', href: SITE_CONTACT.whatsapp, en: 'WhatsApp', ar: 'واتساب', value: null, external: true },
  { key: 'behance', href: SITE_CONTACT.behance, en: 'Behance portfolio', ar: 'الأعمال على Behance', value: null, external: true },
  { key: 'linkedin', href: SITE_CONTACT.linkedin, en: 'LinkedIn', ar: 'لينكد إن', value: null, external: true },
] as const

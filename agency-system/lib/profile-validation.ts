// Shared limits and pure validation helpers for the self-service profile
// editor (/profile). Kept framework-free so the same rules can be unit-tested
// and reused anywhere the profile form is rendered.

export const PROFILE_LIMITS = {
  fullName: 120,
  phone: 30,
  location: 120,
  jobTitle: 120,
  skills: 500,
  bio: 2000,
  longText: 5000,
  url: 2048,
  linkKey: 40,
  customLinks: 20,
  avatarMaxBytes: 5 * 1024 * 1024, // 5 MB
} as const

/** Profile form fields that hold web addresses and are normalized before save. */
export const PROFILE_URL_FIELDS = [
  'portfolio_url',
  'linkedin',
  'behance',
  'instagram',
  'facebook',
  'twitter',
  'personal_website',
] as const

const PHONE_PATTERN = /^[+]?[0-9()\-\s.]{7,30}$/
const LINK_KEY_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/

/** Prepends https:// when the user typed a bare domain (linkedin.com/in/…). */
export function normalizeUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function isValidHttpUrl(value: string): boolean {
  if (!value) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function isValidPhone(value: string): boolean {
  const trimmed = value.trim()
  return trimmed === '' || PHONE_PATTERN.test(trimmed)
}

export function isValidLinkKey(value: string): boolean {
  return LINK_KEY_PATTERN.test(value.trim())
}

export type ProfileFormValues = Record<string, string>

export type ProfileValidationResult = {
  errors: Record<string, string>
  /** Copy of the input with text trimmed and web addresses normalized. */
  normalized: ProfileFormValues
}

/**
 * Validates the full profile edit buffer. Because every panel saves the same
 * form state through the same RPC, a single validator keeps the rules
 * consistent: invalid values are never persisted, and the user sees exactly
 * which field needs attention.
 */
export function validateProfileForm(form: ProfileFormValues): ProfileValidationResult {
  const errors: Record<string, string> = {}
  const normalized: ProfileFormValues = { ...form }

  const checkText = (field: string, label: string, max: number) => {
    const value = (form[field] || '').trim()
    normalized[field] = value
    if (value.length > max) errors[field] = `${label} must be ${max} characters or fewer.`
  }

  const fullName = (form.full_name || '').trim()
  normalized.full_name = fullName
  if (!fullName) {
    errors.full_name = 'Full name is required.'
  } else if (fullName.length > PROFILE_LIMITS.fullName) {
    errors.full_name = `Full name must be ${PROFILE_LIMITS.fullName} characters or fewer.`
  }

  checkText('location', 'Location', PROFILE_LIMITS.location)
  checkText('job_title', 'Job title', PROFILE_LIMITS.jobTitle)
  checkText('skills', 'Skills', PROFILE_LIMITS.skills)
  checkText('bio', 'Bio', PROFILE_LIMITS.bio)
  checkText('experience', 'Experience', PROFILE_LIMITS.longText)
  checkText('certifications', 'Certifications', PROFILE_LIMITS.longText)
  checkText('previous_projects', 'Previous projects', PROFILE_LIMITS.longText)

  for (const field of ['phone', 'whatsapp'] as const) {
    const value = (form[field] || '').trim()
    normalized[field] = value
    if (value && !isValidPhone(value)) {
      errors[field] = 'Enter a valid phone number (digits, spaces, + - ( ) and . only).'
    }
  }

  for (const field of PROFILE_URL_FIELDS) {
    const raw = (form[field] || '').trim()
    if (!raw) {
      normalized[field] = ''
      continue
    }
    const candidate = normalizeUrl(raw)
    if (!isValidHttpUrl(candidate)) {
      errors[field] = 'Enter a valid web address (e.g. https://example.com).'
    } else if (candidate.length > PROFILE_LIMITS.url) {
      errors[field] = 'This link is too long.'
    } else {
      normalized[field] = candidate
    }
  }

  return { errors, normalized }
}

export type CustomLinkValidationResult = {
  key: string
  url: string
  error?: string
}

export function validateCustomLink(key: string, url: string): CustomLinkValidationResult {
  const cleanKey = key.trim()
  const cleanUrl = normalizeUrl(url)
  if (!isValidLinkKey(cleanKey)) {
    return { key: cleanKey, url: cleanUrl, error: 'Use 1–40 letters, numbers, dashes or underscores (no spaces).' }
  }
  if (!isValidHttpUrl(cleanUrl)) {
    return { key: cleanKey, url: cleanUrl, error: 'Enter a valid web address (e.g. https://example.com).' }
  }
  return { key: cleanKey, url: cleanUrl }
}

/** Human-friendly label derived from a custom link key (dribbble → Dribbble). */
export function linkKeyLabel(key: string): string {
  return key
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

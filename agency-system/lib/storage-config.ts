/**
 * Centralized Storage & File Upload Security Rules for Agency OS
 *
 * Defines bucket constraints, allowed MIME types, allowed extensions,
 * maximum file sizes, public/private visibility, and client/backend validation helpers.
 */

export type StorageBucketId =
  | 'avatars'
  | 'portfolio-images'
  | 'project-files'
  | 'form-files'
  | 'intake-files'

export type BucketVisibility = 'public' | 'private'

export interface StorageBucketRule {
  id: StorageBucketId
  name: string
  purpose: string
  purposeAr: string
  visibility: BucketVisibility
  maxSizeBytes: number
  maxSizeFormatted: string
  allowedMimeTypes: string[]
  allowedExtensions: string[]
  acceptAttribute: string
  requiresSignedUrl: boolean
  signedUrlDurationSeconds?: number
}

export interface FileValidationResult {
  valid: boolean
  error?: string
  errorAr?: string
  sanitizedName?: string
}

/**
 * Universal list of dangerous/executable file extensions blocked across the platform.
 * Even if an allowed extension rule were misconfigured, these extensions are always rejected.
 */
export const BLOCKED_DANGEROUS_EXTENSIONS: readonly string[] = [
  '.exe', '.bat', '.cmd', '.sh', '.bash', '.zsh', '.bin', '.run',
  '.msi', '.msp', '.scr', '.pif', '.hta', '.cpl', '.msc', '.jar',
  '.php', '.phtml', '.php3', '.php4', '.php5', '.php7', '.phps',
  '.asp', '.aspx', '.jsp', '.jspx', '.cgi', '.pl', '.py',
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.html', '.htm', '.xhtml', '.shtml',
  '.vbs', '.vbe', '.wsf', '.wsh', '.ps1', '.ps1xml', '.ps2', '.psc1', '.psc2',
]

export const STORAGE_RULES: Record<StorageBucketId, StorageBucketRule> = {
  avatars: {
    id: 'avatars',
    name: 'Avatars',
    purpose: 'Team and user profile photos',
    purposeAr: 'صور الملف الشخصي ودليل الفريق',
    visibility: 'public',
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB
    maxSizeFormatted: '5 MB',
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
    acceptAttribute: 'image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif',
    requiresSignedUrl: false,
  },

  'portfolio-images': {
    id: 'portfolio-images',
    name: 'Portfolio Images',
    purpose: 'Public agency portfolio project showcases and galleries',
    purposeAr: 'صور ومشاريع معرض الأعمال العام للشركة',
    visibility: 'private', // Served via signed URLs validated against published status
    maxSizeBytes: 10 * 1024 * 1024, // 10 MB
    maxSizeFormatted: '10 MB',
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/avif',
    ],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'],
    acceptAttribute: 'image/jpeg,image/png,image/webp,image/gif,image/avif,.jpg,.jpeg,.png,.webp,.gif,.avif',
    requiresSignedUrl: true,
    signedUrlDurationSeconds: 3600, // 1 hour for public portfolio viewer
  },

  'project-files': {
    id: 'project-files',
    name: 'Project Files',
    purpose: 'Internal workspace project deliverables, assets, and documents',
    purposeAr: 'ملفات ومستندات وتسليمات المشاريع الداخلية',
    visibility: 'private',
    maxSizeBytes: 50 * 1024 * 1024, // 50 MB
    maxSizeFormatted: '50 MB',
    allowedMimeTypes: [
      // Images
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml', 'image/tiff', 'image/bmp',
      // Documents
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.oasis.opendocument.text',
      'text/plain', 'text/markdown', 'text/csv', 'application/rtf', 'application/json',
      // Spreadsheets
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.oasis.opendocument.spreadsheet',
      // Presentations
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.presentation',
      // Archives
      'application/zip', 'application/x-zip-compressed', 'application/x-tar', 'application/gzip',
      'application/x-7z-compressed', 'application/x-rar-compressed', 'application/vnd.rar',
      // Media / Design
      'audio/mpeg', 'audio/wav', 'audio/ogg',
      'video/mp4', 'video/webm', 'video/quicktime',
      'application/illustrator', 'application/postscript', 'image/vnd.adobe.photoshop',
    ],
    allowedExtensions: [
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.odt', '.ods', '.odp', '.txt', '.md', '.csv', '.rtf', '.json',
      '.zip', '.tar', '.gz', '.7z', '.rar',
      '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff', '.svg',
      '.psd', '.ai', '.eps',
      '.mp3', '.wav', '.ogg',
      '.mp4', '.webm', '.mov',
    ],
    acceptAttribute: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.rtf,.json,.zip,.tar,.gz,.7z,.rar,.png,.jpg,.jpeg,.webp,.gif,.svg,.psd,.ai,.mp3,.wav,.mp4,.mov',
    requiresSignedUrl: true,
    signedUrlDurationSeconds: 120, // 2 minutes
  },

  'form-files': {
    id: 'form-files',
    name: 'Form Attachments',
    purpose: 'Public form response attachments and client intake uploads',
    purposeAr: 'مرفقات نماذج الاستبيان وردود العملاء',
    visibility: 'private',
    maxSizeBytes: 20 * 1024 * 1024, // 20 MB
    maxSizeFormatted: '20 MB',
    allowedMimeTypes: [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.text',
      'application/vnd.oasis.opendocument.spreadsheet',
      'text/plain', 'text/csv',
      'application/zip', 'application/x-zip-compressed', 'application/x-7z-compressed',
      'application/x-rar-compressed', 'application/vnd.rar',
      'audio/mpeg', 'audio/wav', 'video/mp4', 'video/quicktime',
    ],
    allowedExtensions: [
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.odt', '.ods', '.txt', '.csv',
      '.zip', '.rar', '.7z',
      '.png', '.jpg', '.jpeg', '.webp', '.gif',
      '.mp3', '.wav', '.mp4', '.mov',
    ],
    acceptAttribute: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.txt,.csv,.zip,.rar,.7z,.png,.jpg,.jpeg,.webp,.gif,.mp3,.wav,.mp4,.mov',
    requiresSignedUrl: true,
    signedUrlDurationSeconds: 120, // 2 minutes
  },

  'intake-files': {
    id: 'intake-files',
    name: 'Intake Files',
    purpose: 'Legacy client intake attachments',
    purposeAr: 'مرفقات نماذج الاستقبال السابقة',
    visibility: 'private',
    maxSizeBytes: 20 * 1024 * 1024, // 20 MB
    maxSizeFormatted: '20 MB',
    allowedMimeTypes: [
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv',
      'application/zip', 'application/x-zip-compressed', 'application/x-7z-compressed',
      'application/x-rar-compressed', 'application/vnd.rar',
    ],
    allowedExtensions: [
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
      '.txt', '.csv',
      '.zip', '.rar', '.7z',
      '.png', '.jpg', '.jpeg', '.webp', '.gif',
    ],
    acceptAttribute: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z,.png,.jpg,.jpeg,.webp,.gif',
    requiresSignedUrl: true,
    signedUrlDurationSeconds: 120,
  },
}

/**
 * Returns formatted byte count string (e.g. "4.2 MB", "850 KB").
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}

/**
 * Extracts normalized lowercased file extension including the leading dot (e.g. ".png").
 */
export function getFileExtension(filename: string): string {
  if (!filename) return ''
  // Strip path segments
  const clean = filename.split(/[/\\]/).pop() || ''
  const dotIndex = clean.lastIndexOf('.')
  if (dotIndex <= 0) return ''
  return clean.slice(dotIndex).toLowerCase()
}

/**
 * Checks if a filename has an unsafe/blocked executable or script extension.
 */
export function isUnsafeExtension(filename: string): boolean {
  const ext = getFileExtension(filename)
  if (!ext) return false
  return BLOCKED_DANGEROUS_EXTENSIONS.includes(ext)
}

/**
 * Sanitizes a filename for storage:
 * - Strips directory traversal components (/ and \)
 * - Strips null bytes and control characters
 * - Replaces unsafe non-alphanumeric characters (except dots, underscores, dashes)
 * - Limits base filename length while preserving extension
 */
export function sanitizeFileName(filename: string): string {
  if (!filename) return 'file'

  // Remove null bytes and control characters
  const cleaned = filename.replace(/[\0\x00-\x1f\x7f-\x9f]/g, '').trim()

  // Extract base name without path
  const baseOnly = cleaned.split(/[/\\]/).pop() || 'file'

  const dotIndex = baseOnly.lastIndexOf('.')
  let baseName = dotIndex > 0 ? baseOnly.slice(0, dotIndex) : baseOnly
  const extension = dotIndex > 0 ? baseOnly.slice(dotIndex).toLowerCase() : ''

  // Replace any character that is not alphanumeric, dot, underscore, or dash
  baseName = baseName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)

  // Ensure baseName is not empty or just dots/underscores
  if (!baseName.replace(/[._-]/g, '')) {
    baseName = 'file'
  }

  const safeExt = extension.replace(/[^a-zA-Z0-9.]/g, '')
  return `${baseName}${safeExt}`
}

/**
 * Retrieves the configuration rule for a specific storage bucket.
 */
export function getBucketRule(bucketId: StorageBucketId): StorageBucketRule {
  return STORAGE_RULES[bucketId] || STORAGE_RULES['project-files']
}

/**
 * Centralized validation helper for file uploads.
 * Validates:
 * 1. File presence and size > 0
 * 2. File size <= bucket maximum
 * 3. File extension is safe (not blocked)
 * 4. File extension is explicitly allowed for this bucket
 * 5. MIME type is compatible if present
 */
export function validateFile(
  file: File | null | undefined,
  bucketId: StorageBucketId,
  lang: 'en' | 'ar' = 'en'
): FileValidationResult {
  if (!file) {
    const error = lang === 'ar' ? 'يرجى اختيار ملف للرفع.' : 'Please select a file to upload.'
    return {
      valid: false,
      error,
      errorAr: 'يرجى اختيار ملف للرفع.',
    }
  }

  const rule = getBucketRule(bucketId)

  // 1. Check empty file (0 bytes)
  if (file.size <= 0) {
    const errorAr = `الملف “${file.name}” فارغ (0 بايت).`
    const errorEn = `“${file.name}” is empty (0 bytes).`
    return {
      valid: false,
      error: lang === 'ar' ? errorAr : errorEn,
      errorAr,
    }
  }

  // 2. Check maximum size
  if (file.size > rule.maxSizeBytes) {
    const fileSizeFormatted = formatBytes(file.size)
    const errorAr = `الملف “${file.name}” كبير جداً (${fileSizeFormatted}). الحد الأقصى المسموح به هو ${rule.maxSizeFormatted}.`
    const errorEn = `“${file.name}” is too large (${fileSizeFormatted}). Maximum allowed size is ${rule.maxSizeFormatted}.`
    return {
      valid: false,
      error: lang === 'ar' ? errorAr : errorEn,
      errorAr,
    }
  }

  const ext = getFileExtension(file.name)

  // 3. Check blocked unsafe extensions
  if (isUnsafeExtension(file.name)) {
    const errorAr = `الملف “${file.name}” يحتوي على امتداد محظور وغير آمن (${ext}) ولا يمكن رفعه.`
    const errorEn = `“${file.name}” has a restricted unsafe file extension (${ext}) and cannot be uploaded.`
    return {
      valid: false,
      error: lang === 'ar' ? errorAr : errorEn,
      errorAr,
    }
  }

  // 4. Check allowed extensions for this bucket
  if (!ext || !rule.allowedExtensions.includes(ext)) {
    const allowedList = rule.allowedExtensions.join(', ')
    const errorAr = `نوع الملف “${file.name}” غير مدعوم (${ext || 'بدون امتداد'}). الأنواع المسموح بها: ${allowedList}`
    const errorEn = `“${file.name}” has an unsupported file type (${ext || 'no extension'}). Allowed: ${allowedList}`
    return {
      valid: false,
      error: lang === 'ar' ? errorAr : errorEn,
      errorAr,
    }
  }

  // 5. MIME type check if provided
  if (file.type && file.type.trim()) {
    const mime = file.type.toLowerCase().trim()
    // If it's an image bucket, ensure MIME starts with image/
    if ((bucketId === 'avatars' || bucketId === 'portfolio-images') && !mime.startsWith('image/')) {
      const errorAr = `الملف “${file.name}” ليس صورة صالحة.`
      const errorEn = `“${file.name}” is not recognized as a valid image.`
      return {
        valid: false,
        error: lang === 'ar' ? errorAr : errorEn,
        errorAr,
      }
    }
    // Block executable MIME types
    if (
      mime === 'application/x-msdownload' ||
      mime === 'application/x-sh' ||
      mime === 'application/x-httpd-php' ||
      mime === 'application/x-executable'
    ) {
      const errorAr = `الملف “${file.name}” من نوع تنفيذي غير مسموح به.`
      const errorEn = `“${file.name}” contains an executable MIME type and is rejected.`
      return {
        valid: false,
        error: lang === 'ar' ? errorAr : errorEn,
        errorAr,
      }
    }
  }

  return {
    valid: true,
    sanitizedName: sanitizeFileName(file.name),
  }
}

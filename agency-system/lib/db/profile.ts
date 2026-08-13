/**
 * profile repository — data access for the profile domain.
 * Part of the domain-based data layer under lib/db (see lib/db/index.ts).
 */

import { supabase } from '../supabase/client'
import { Result, fail, ok } from './shared'
import type { Profile } from '../supabase/types'
// Enhanced profile functions



export async function updateOwnEnhancedProfile(userId: string, updates: {
  full_name?: string
  phone?: string
  whatsapp?: string
  bio?: string
  job_title?: string
  skills?: string
  experience?: string
  previous_projects?: string
  certifications?: string
  location?: string
  portfolio_url?: string
  linkedin?: string
  behance?: string
  instagram?: string
  facebook?: string
  twitter?: string
  personal_website?: string
  other_social_links?: Record<string, string>
  avatar_url?: string
}): Promise<Result<Profile | null>> {
  if (!supabase) return fail(null)
  
  const { data, error } = await supabase.rpc('update_own_enhanced_profile', {
    p_user_id: userId,
    p_full_name: updates.full_name || null,
    p_phone: updates.phone || null,
    p_whatsapp: updates.whatsapp || null,
    p_bio: updates.bio || null,
    p_job_title: updates.job_title || null,
    p_skills: updates.skills || null,
    p_experience: updates.experience || null,
    p_previous_projects: updates.previous_projects || null,
    p_certifications: updates.certifications || null,
    p_location: updates.location || null,
    p_portfolio_url: updates.portfolio_url || null,
    p_linkedin: updates.linkedin || null,
    p_behance: updates.behance || null,
    p_instagram: updates.instagram || null,
    p_facebook: updates.facebook || null,
    p_twitter: updates.twitter || null,
    p_personal_website: updates.personal_website || null,
    p_other_social_links: (updates.other_social_links as unknown as import('../supabase/types').Json) || null,
    p_avatar_url: updates.avatar_url || null,
  })
  
  return error ? fail(null, error.message) : ok(data as Profile | null)
}




/**
 * Collects every social link stored on a profile — the admin-managed
 * `social_links` JSON, the self-service platform columns (linkedin, behance,
 * instagram, facebook, twitter, personal_website) and the custom
 * `other_social_links` JSON — into a single key → URL map. Individual columns
 * win over the same key stored in the JSON maps.
 */

export function collectSocialLinks(profile: Profile): Record<string, string> {
  const links: Record<string, string> = {}

  const absorb = (value: import('../supabase/types').Json | null | undefined) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    Object.entries(value).forEach(([key, item]) => {
      if (typeof item === 'string' && item.trim()) {
        links[key] = item.trim()
      }
    })
  }

  absorb(profile.social_links)
  absorb(profile.other_social_links)

  // Individual self-service columns win over JSON maps.
  const columnKeys = ['linkedin', 'behance', 'instagram', 'facebook', 'twitter', 'personal_website'] as const
  for (const column of columnKeys) {
    const value = profile[column]
    if (typeof value === 'string' && value.trim()) links[column] = value.trim()
  }

  return links
}


export async function getSocialLinks(profile: Profile): Promise<Record<string, string>> {
  return collectSocialLinks(profile)
}


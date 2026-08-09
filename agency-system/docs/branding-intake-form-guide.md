# Branding & Visual Identity Intake Form — Build Guide

Two ways to create this form. The **seed script** is the fast, reliable one-shot
path. The **Admin Dashboard walkthrough** below proves the Form Builder itself
can build it (sections + conditional logic are now supported by the builder).

---

## Step 0 — Apply the migration first (required either way)

The conditional (show/hide) behaviour at submission lives in a database function.
Before creating or using the form, run in the **Supabase SQL Editor**:

**`supabase/migrations/20260812000000_form_sections_and_conditional.sql`**

This creates `is_form_question_visible()` and updates `submit_dynamic_form()` so
hidden questions are never required and never stored.

---

## Option A — One-shot seed (recommended, reliable)

In the Supabase SQL Editor, after the migration above, run:

**`supabase/seed_branding_intake_form.sql`**

This inserts the form (published) with all 24 questions, sections, options,
required flags, contact-field mapping, and conditional rules — exactly the rows
the builder would create.

Result:
- Public link: `/f/branding-visual-identity-intake`
- Editable anytime from **Administration → Forms**.
- Then follow the **Test the form** section below.

---

## Option B — Build it by hand in the Admin Dashboard

Sign in as Admin → **Administration → Forms → New form**.

**Form details:**
- Title: `Branding & Visual Identity Intake Form`
- Description: `A client intake form to understand the client's business, branding needs, existing visual identity, and project requirements.`
- Save details, then **Add a question** for each item below. For each question set its **Section** (bottom of the edit panel) and any **Show only when** rule.

### Section 1 · About You
| Question | Type | Required | Map to | Options |
|---|---|---|---|---|
| Full Name | Short text | ✅ | name | – |
| Email Address | Short text | ✅ | email | – |
| Phone / WhatsApp Number | Short text | ✅ | phone | – |
| Company / Brand Name | Short text | ✅ | company | – |

### Section 2 · Your Brand
| Question | Type | Required | Show when | Options |
|---|---|---|---|---|
| What do you need help with? | Multiple choice | ✅ | – | Logo Design · Visual Identity · Logo + Visual Identity · Company Profile · Logo + Visual Identity + Company Profile · Brand Refresh / Rebranding · Not sure yet |
| Do you already have a logo? | Single choice | ✅ | – | Yes · No |
| Please upload your current logo. | File upload | ✅ | Do you already have a logo? = **Yes** | – |
| What do you like or dislike about your current logo? | Multiple choice | – | Do you already have a logo? = **Yes** | I like it and want to keep it · I like the idea but want to improve it · I don't like the design · It feels outdated · It doesn't represent the brand · I'm not sure |
| What industry does your business operate in? | Dropdown | – | – | Construction · Real Estate · Technology · Food & Beverage · Fashion · Healthcare · Education · Finance · E-commerce · Professional Services · Manufacturing · Other |
| Please specify your industry. | Short text | – | industry = **Other** | – |
| How would you describe your brand? | Single choice | ✅ | – | New business / Starting from scratch · Existing business with no clear identity · Existing brand that needs improvement · Established brand that needs a refresh · Rebranding an existing business |

### Section 3 · Brand Personality
| Question | Type | Required | Options |
|---|---|---|---|
| How should your brand feel? | Multiple choice | – | Professional · Modern · Premium · Elegant · Friendly · Bold · Minimal · Creative · Trustworthy · Energetic · Serious · Luxurious |

### Section 4 · Audience & Market
| Question | Type | Required | Show when | Options / Notes |
|---|---|---|---|---|
| Who is your main target audience? | Multiple choice | – | – | Individuals / Consumers · Businesses · Professionals · Families · Young adults · Children · Luxury / Premium customers · Mass market · Other |
| Please specify your main target audience. | Short text | – | target audience = **Other** | – |
| Who are your main competitors? | Short text | – | – | Help text: *Enter brand names or links, if you like.* |
| Are there any brands you like visually? | Short text | – | – | Help text: *Provide brand names or links, if you like.* |

### Section 5 · Visual Preferences
| Question | Type | Required | Options |
|---|---|---|---|
| Are there any colors you want to use? | Multiple choice | – | Blue · Green · Red · Orange · Yellow · Purple · Black · White · Neutral colors · No preference |
| Are there any colors you want to avoid? | Multiple choice | – | Blue · Green · Red · Orange · Yellow · Purple · Black · White · Neutral colors · No preference |

### Section 6 · Deliverables
| Question | Type | Required | Show when | Options |
|---|---|---|---|---|
| Which deliverables do you need? | Multiple choice | – | – | Primary Logo · Logo Variations · Color Palette · Typography · Brand Guidelines · Business Cards · Social Media Templates · Presentation Template · Company Profile · Other |
| Please specify the deliverables you need. | Short text | – | deliverables = **Other** | – |

### Section 7 · Project Details
| Question | Type | Required | Options |
|---|---|---|---|
| When do you need the project? | Single choice | – | As soon as possible · Within 1 week · Within 2 weeks · Within 1 month · Flexible |
| Do you have a specific budget range? | Single choice | – | Under $100 · $100–$250 · $250–$500 · $500–$1,000 · $1,000+ · Not sure yet · Prefer not to say |

### Section 8 · Final Notes
| Question | Type | Required |
|---|---|---|
| Is there anything else we should know about the project? | Long text | – |
| Upload any references, documents, or files that may help us understand the project. | File upload | – |

Then click **Enable form**. Public link: `/f/branding-visual-identity-intake`.

---

## Test the form (client view)

Open the public link `/f/branding-visual-identity-intake` in a private window
(no login):

1. **Conditional logic** — choose *No* for "Do you already have a logo?" → the
   logo upload + logo-opinion questions must NOT appear. Choose *Yes* → they appear.
   For the dropdown/industry and the "Other" options, selecting *Other* reveals the
   follow-up text field.
2. **Required fields** — submit while leaving Full Name / Email / Phone / Company /
   "What do you need help with?" / "Do you already have a logo?" empty → the form
   flags them and does not submit.
3. **File uploads** — attach a logo and a reference file (anonymous sign-in must be
   enabled in Supabase for uploads).
4. **Submit** — the success screen appears.

### Verify in the Admin Dashboard
**Administration → Forms → (your form) → Responses**:
- The submission is listed; open it.
- Every answered question is present and readable, grouped by section order.
- The hidden conditional questions are **not** stored as answered (e.g. when the
  client chose *No* for the logo question, the "upload your logo" / "like or
  dislike" rows are absent).
- File attachments show as downloadable chips.

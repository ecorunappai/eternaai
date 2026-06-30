// Eterna AI — Platform autofill plans.
// Maps each takedown type → selector list. Used by both the local Playwright
// script and the in-browser bookmarklet. Selectors are best-effort; platforms
// change DOM frequently, so the operator always reviews before submitting.

export type FillStep =
  | { kind: "fill"; selectors: string[]; valueKey: string }
  | { kind: "check"; selectors: string[] }
  | { kind: "select"; selectors: string[]; valueKey: string }
  | { kind: "click"; selectors: string[] }
  | { kind: "wait"; ms: number };

export interface PlatformPlan {
  label: string;
  url: string;
  notes: string;
  steps: FillStep[];
}

const COMMON = {
  name: ["input[name='name']", "input[name='full_name']", "input[id*='name' i]", "input[aria-label*='name' i]"],
  email: ["input[type='email']", "input[name='email']", "input[id*='email' i]", "input[aria-label*='email' i]"],
  copyright_owner: ["input[name='copyright_owner']", "input[name='rights_owner']", "input[id*='owner' i]"],
  original_url: ["input[name='original_url']", "input[name='source_url']", "input[id*='original' i]", "textarea[name*='original' i]"],
  infringing_url: ["input[name='infringing_url']", "input[name='url']", "input[id*='infring' i]", "textarea[name*='infring' i]", "textarea[name*='url' i]"],
  description: ["textarea[name='description']", "textarea[name*='describe' i]", "textarea[id*='descript' i]", "textarea[aria-label*='describ' i]"],
  signature: ["input[name='signature']", "input[name='sign']", "input[id*='signat' i]"],
  country: ["select[name='country']", "select[id*='country' i]"],
};

function plan(label: string, url: string, notes: string, extras: FillStep[] = []): PlatformPlan {
  return {
    label, url, notes,
    steps: [
      { kind: "fill", selectors: COMMON.name, valueKey: "full_legal_name" },
      { kind: "fill", selectors: COMMON.email, valueKey: "contact_email" },
      { kind: "fill", selectors: COMMON.copyright_owner, valueKey: "copyright_owner" },
      { kind: "fill", selectors: COMMON.original_url, valueKey: "original_work_url" },
      { kind: "fill", selectors: COMMON.infringing_url, valueKey: "infringing_url" },
      { kind: "fill", selectors: COMMON.description, valueKey: "description_of_infringement" },
      { kind: "fill", selectors: COMMON.signature, valueKey: "signature" },
      ...extras,
    ],
  };
}

export const PLATFORM_PLANS: Record<string, PlatformPlan> = {
  youtube_copyright: plan(
    "YouTube Copyright Complaint",
    "https://www.youtube.com/copyright_complaint_form",
    "Sign in to the rights owner's Google account first. Form is multi-step; bookmarklet/script fills visible fields per step — click Next manually.",
  ),
  youtube_privacy: plan(
    "YouTube Privacy Complaint",
    "https://support.google.com/youtube/answer/142443",
    "Privacy complaint requires personal-info justification. Review the auto-filled description carefully.",
  ),
  youtube_impersonation: plan(
    "YouTube Impersonation Report",
    "https://support.google.com/youtube/contact/impersonation",
    "Attach proof of identity (passport / brand registration) manually — file uploads cannot be automated.",
  ),
  instagram_copyright: plan(
    "Instagram Copyright Report",
    "https://help.instagram.com/contact/372592039493026",
    "Meta forms heavily use react-controlled inputs — bookmarklet dispatches input events to trigger validation.",
  ),
  facebook_copyright: plan(
    "Facebook Copyright Report",
    "https://www.facebook.com/help/contact/1758255661104383",
    "Same engine as Instagram. Choose the correct content-type radio manually.",
  ),
  tiktok_copyright: plan(
    "TikTok Copyright Report",
    "https://www.tiktok.com/legal/report/Copyright",
    "TikTok requires a category dropdown selection — pick 'Copyright infringement' before running the bookmarklet.",
  ),
  website_dmca: {
    label: "Website DMCA Notice (email)",
    url: "mailto:",
    notes: "No web form — script generates a ready-to-send mail draft and opens your mail client.",
    steps: [],
  },
  hosting_abuse: {
    label: "Hosting Provider Abuse",
    url: "mailto:",
    notes: "Same as DMCA email — sent to the hosting provider's abuse@ address.",
    steps: [],
  },
  google_delisting: plan(
    "Google Search Delisting",
    "https://reportcontent.google.com/forms/dmca_search",
    "Google form has CAPTCHA — solve manually after autofill.",
  ),
};

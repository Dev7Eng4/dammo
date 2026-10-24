/**
 * Maps a niche/topic keyword to a Facebook Page category label.
 * Facebook only accepts categories from its own list (typed into a combobox),
 * so these labels must match entries Facebook suggests.
 */
const TOPIC_CATEGORY_RULES: Array<{ match: RegExp; category: string }> = [
  { match: /psych|tam.?ly|mind|mental/i, category: 'Education' },
  { match: /money|finance|pension|tai.?chinh|luong.?huu/i, category: 'Finance' },
  { match: /health|nutrition|food|suc.?khoe|dinh.?duong|thuc.?pham/i, category: 'Health/Beauty' },
  { match: /tech|cong.?nghe/i, category: 'Science, Technology & Engineering' },
  { match: /drama|story|cau.?chuyen|entertain/i, category: 'Entertainment Website' },
  { match: /wisdom|quote|loi.?day|triet.?ly|lonely|family|nostalgia/i, category: 'Personal Blog' },
];

export const DEFAULT_FACEBOOK_CATEGORY = 'Digital creator';

export function suggestFacebookCategory(topic: string): string {
  const normalized = topic.trim();
  if (!normalized) return DEFAULT_FACEBOOK_CATEGORY;
  return TOPIC_CATEGORY_RULES.find((rule) => rule.match.test(normalized))?.category ?? DEFAULT_FACEBOOK_CATEGORY;
}

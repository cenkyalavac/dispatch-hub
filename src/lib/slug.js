// Tiny URL-safe slugifier — lowercase, ASCII-ish, hyphens between words.
// Kept dependency-free so any page/component can import it.
export function slugify(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')        // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')             // non-alphanum → hyphen
    .replace(/^-+|-+$/g, '')                 // trim hyphens
    .slice(0, 60);
}

// Ensure the slug is unique within `existing` (an array of slugs). Appends
// -2, -3, … until a free one is found.
export function uniqueSlug(base, existing) {
  const set = new Set(existing.filter(Boolean));
  if (!set.has(base)) return base;
  let i = 2;
  while (set.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}
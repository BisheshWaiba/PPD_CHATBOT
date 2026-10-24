// How saved chats are written on the History page.

// The assistant's messages can contain its own links as HTML (for example the printable results).
// A saved chat shows them as plain text: "Open a printable version (/report.html)". What a person
// typed is shown exactly as they typed it, so it is never touched.
export function plainText(text, role) {
  const raw = String(text ?? '');
  if (role !== 'bot') return raw;
  return raw
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '');
}

// "20 Oct 2026, 3:41 pm" in the person's own language and time zone
export function formatWhen(iso, { locale, timeZone } = {}) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone });
}

export function countLabel(count) {
  return count === 1 ? '1 message' : `${count} messages`;
}

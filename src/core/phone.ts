// WhatsApp numbers arrive in every shape: 0812..., +62 812..., 62-812..., with
// spaces, dots, or wrapped in a redirect link. Normalize to the 62... form that
// wa.me click-to-chat links need.

export function normalizeWhatsapp(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  let text = String(raw).trim();
  if (!text) return null;
  // Unwrap links such as https://wa.me/62812... or redirect wrappers holding one.
  const linked = decodeURIComponent(text).match(/wa\.me\/(\+?\d[\d\s-]*)/i);
  if (linked) text = linked[1];
  let digits = text.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0')) digits = '62' + digits.slice(1);
  else if (!digits.startsWith('62')) digits = '62' + digits;
  // Country code plus 8 to 13 digits.
  const rest = digits.length - 2;
  if (rest < 8 || rest > 13) return null;
  return digits;
}

export function whatsappLink(number: string | null, message: string): string | null {
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

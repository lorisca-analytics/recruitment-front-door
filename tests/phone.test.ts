import { normalizeWhatsapp, whatsappLink } from '../src/core';

describe('WhatsApp numbers', () => {
  test.each([
    ['0000 1234 5678', '6200012345678'],
    ['+62 000-1234-5678', '6200012345678'],
    ['62.000.1234.5678', '6200012345678'],
    ['https://wa.me/6200012345678', '6200012345678'],
    ['https%3A%2F%2Fwa.me%2F6200012345678', '6200012345678'],
  ])('%s', (raw, want) => {
    expect(normalizeWhatsapp(raw)).toBe(want);
  });

  test('too short or empty is null', () => {
    expect(normalizeWhatsapp('0812')).toBeNull();
    expect(normalizeWhatsapp('')).toBeNull();
    expect(normalizeWhatsapp(undefined)).toBeNull();
  });

  test('builds a click-to-chat link with an encoded message', () => {
    expect(whatsappLink('6200012345678', 'Hi Sari, see you at 08:30')).toBe(
      'https://wa.me/6200012345678?text=Hi%20Sari%2C%20see%20you%20at%2008%3A30',
    );
    expect(whatsappLink(null, 'x')).toBeNull();
  });
});

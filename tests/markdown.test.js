const { renderDescription } = require('../src/services/equipmentService');

describe('renderDescription (Markdown sanitization)', () => {
  test('strips script tags, images and event handlers but keeps safe formatting', () => {
    // A line starting with raw HTML is an HTML block in Markdown, so the bold text needs its own paragraph.
    const html = renderDescription('<script>alert(1)</script><img src=x onerror=alert(1)>\n\n**ok**');
    expect(html).not.toMatch(/<script|onerror|<img/i);
    expect(html).toContain('<strong>ok</strong>');
  });

  test('blocks javascript: URLs in links', () => {
    expect(renderDescription('[x](javascript:alert(1))')).not.toMatch(/javascript:/i);
  });

  test('keeps http links and forces rel="noopener noreferrer"', () => {
    const html = renderDescription('[docs](https://example.com)');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});

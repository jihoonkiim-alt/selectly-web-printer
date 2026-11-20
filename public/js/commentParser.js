// Parses a raw Facebook comment-section text dump (manually selected +
// copy-pasted by the operator) into {authorName, content} blocks.
//
// Originally ported 1:1 from lib/services/comment_scrape_parser.dart, which
// assumed a WebView-extracted innerText dump shaped like:
//   {Author}
//   {content}
//   [번역 보기]
//   {relative time, e.g. "3시간"}
//   좋아요
//   답글 달기
//
// A real manual copy-paste from the live comment feed (2026-11-19 sample)
// turned out shaped differently — no visible "좋아요" line, no relative-time
// text (replaced by one or two bare " ·" separator lines, sometimes with a
// blank line), and "번역 보기" appearing AFTER "답글 달기" instead of before.
// The only element that showed up identically in every single block, across
// both formats, is a line that is exactly "답글 달기" — so that's the one
// anchor this parser relies on. Everything else recognizable as UI chrome
// ("좋아요", "번역 보기", bare "·" separators, relative-time-only lines) is
// filtered out as noise before block-splitting, so the parser tolerates
// either format without caring which one produced the paste.
const REPLY_LABEL = '답글 달기';
const NOISE_LABELS = new Set(['좋아요', '번역 보기']);
const BULLET_ONLY_PATTERN = /^[·.]+$/;
const RELATIVE_TIME_PATTERN = /^\d+(초|분|시간|일|주)$/;
// A bare number on its own line is always UI chrome (a reply count next to
// "답글 달기"), never real order content — orders always carry words/units
// ("13k", "mine large"), so this is safe to drop unconditionally.
const PURE_NUMBER_PATTERN = /^\d+$/;

export function parseComments(rawText) {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 0 &&
        !NOISE_LABELS.has(l) &&
        !BULLET_ONLY_PATTERN.test(l) &&
        !RELATIVE_TIME_PATTERN.test(l) &&
        !PURE_NUMBER_PATTERN.test(l)
    );

  const results = [];
  let blockStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== REPLY_LABEL) continue;
    // Need at least an author line + one content line.
    if (i - blockStart >= 2) {
      const author = lines[blockStart];
      const content = lines.slice(blockStart + 1, i).join(' ');
      results.push({ authorName: author, content });
    }
    blockStart = i + 1;
  }
  return results;
}

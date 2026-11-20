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
// anchor this parser relied on at first.
//
// A second operator (2026-11-20) pastes from an English-language Facebook
// UI, where the same block-boundary button reads "Reply" instead of "답글
// 달기", and extra UI chrome shows up that never appeared in the Korean
// dumps: "Hide" (a moderation action, shown because the operator has
// permission to hide/delete comments on this post) and "Author" (a badge
// Facebook shows on the post owner's own comments). "Hide" etc. is just
// noise to drop before block-splitting, same as "좋아요"/"번역 보기" always
// were. The parser treats any of several known reply-button strings as a
// block boundary so it tolerates either UI language without caring which
// one produced the paste.
//
// "Author"/"작성자" is handled differently: it's not just UI chrome, it's a
// structural signal that the comment was written by the post's own owner
// (e.g. captions on product photos), which can never be a customer order —
// so any block carrying that badge is dropped entirely rather than just
// having the badge text stripped out of its content.
//
// Beyond that, the parser deliberately does NOT try to guess whether a
// block "looks like" a real order (e.g. by requiring a price or color
// word) — a bump comment like "Up" and a real order like "Black and brick"
// are both kept as candidates, and the operator filters them by simply not
// clicking the ones that aren't real orders. Missing a real paying order
// by over-filtering is worse than a stray "Up" sitting in the list.
const REPLY_LABELS = new Set(['답글 달기', 'Reply']);
const NOISE_LABELS = new Set(['좋아요', '번역 보기', 'Like', 'See translation', 'Hide']);
const AUTHOR_BADGE_LABELS = new Set(['Author', '작성자']);
const BULLET_ONLY_PATTERN = /^[·.]+$/;
const RELATIVE_TIME_PATTERN = /^\d+(초|분|시간|일|주)$/;
// English relative-time shorthand, e.g. "3h", "2d", "1w", "52m".
const RELATIVE_TIME_PATTERN_EN = /^\d+(s|m|h|d|w)$/i;
// A bare number on its own line is always UI chrome (a reply count next to
// the reply button), never real order content — orders always carry
// words/units ("13k", "mine large"), so this is safe to drop unconditionally.
const PURE_NUMBER_PATTERN = /^\d+$/;

function isNoise(l) {
  return (
    NOISE_LABELS.has(l) ||
    BULLET_ONLY_PATTERN.test(l) ||
    RELATIVE_TIME_PATTERN.test(l) ||
    RELATIVE_TIME_PATTERN_EN.test(l) ||
    PURE_NUMBER_PATTERN.test(l)
  );
}

export function parseComments(rawText) {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const results = [];
  let blockStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!REPLY_LABELS.has(lines[i])) continue;
    const rawBlock = lines.slice(blockStart, i);
    const isAuthorBlock = rawBlock.some((l) => AUTHOR_BADGE_LABELS.has(l));
    const cleaned = rawBlock.filter((l) => !isNoise(l) && !AUTHOR_BADGE_LABELS.has(l));
    // Need at least an author line + one content line.
    if (!isAuthorBlock && cleaned.length >= 2) {
      const author = cleaned[0];
      const content = cleaned.slice(1).join(' ');
      results.push({ authorName: author, content });
    }
    blockStart = i + 1;
  }
  return results;
}

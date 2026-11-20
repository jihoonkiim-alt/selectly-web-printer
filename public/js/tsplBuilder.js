// Port of lib/services/printer_service.dart's TSPL-building logic — keep
// the label geometry/command layout identical to the proven Flutter app.
//
// Byte encoding (UTF-8, for Korean names) happens in bleClient.js via
// TextEncoder — this module only produces the TSPL command string.

const LABEL_WIDTH_MM = 60;
const LABEL_HEIGHT_MM = 40;
const GAP_MM = 1;
const LINE_HEIGHT_DOTS = 48; // rough spacing per line at these font sizes
const TOP_MARGIN = 16;

function formatTimestamp(date) {
  const two = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

// Naive word-wrap since TSPL TEXT doesn't wrap on its own — long comments
// would otherwise run off the printable width and get cut off.
function wrapText(text, maxCharsPerLine = 16) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (candidate.length > maxCharsPerLine && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.length === 0 ? [''] : lines;
}

function buildTspl(lines) {
  let buffer = '';
  buffer += `SIZE ${LABEL_WIDTH_MM} mm, ${LABEL_HEIGHT_MM} mm\r\n`;
  buffer += `GAP ${GAP_MM} mm, 0 mm\r\n`;
  buffer += 'DIRECTION 1\r\n';
  buffer += 'DENSITY 15\r\n';
  buffer += 'SPEED 4\r\n';
  buffer += 'CLS\r\n';

  let y = TOP_MARGIN;
  for (const line of lines) {
    const escaped = line.text.replaceAll('"', "'");
    buffer += `TEXT 16,${y},"${line.font}",0,${line.xMul},${line.yMul},"${escaped}"\r\n`;
    y += LINE_HEIGHT_DOTS * line.yMul;
  }
  buffer += 'PRINT 1,1\r\n';
  return buffer;
}

export function buildTestLabelTspl() {
  return buildTspl([
    { text: 'SELECTLY WEB TEST PRINT', font: '4', xMul: 1, yMul: 1 },
    { text: 'Bluetooth connection OK', font: '3', xMul: 1, yMul: 1 },
    { text: formatTimestamp(new Date()), font: '2', xMul: 1, yMul: 1 },
  ]);
}

// printedAt must be the moment of printing (new Date()), not the comment's
// original post time — the printed "출력일시" is deliberately when the
// label was made, not when the comment was posted.
export function buildReceiptTspl({ authorName, printedAt, content }) {
  const lines = [
    { text: authorName, font: '4', xMul: 1, yMul: 1 },
    { text: formatTimestamp(printedAt), font: '2', xMul: 1, yMul: 1 },
    ...wrapText(content, 16).map((line) => ({ text: line, font: '3', xMul: 1, yMul: 1 })),
  ];
  return buildTspl(lines);
}

export { wrapText };

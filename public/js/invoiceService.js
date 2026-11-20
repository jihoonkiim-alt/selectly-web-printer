// Port of lib/services/invoice_service.dart + lib/models/invoice_line_item.dart
// — keep grouping/shipping-fee math identical to the proven Flutter app.

export const SHIPPING_STANDARD_WON = 5000;
export const SHIPPING_ISLAND_WON = 6000;

export function shippingFee({ isIsland }) {
  return isIsland ? SHIPPING_ISLAND_WON : SHIPPING_STANDARD_WON;
}

// Grouping key — same customer only if the name matches exactly once
// trimmed and lowercased. Typos are fixed by editing the name until it
// matches, not through a separate merge UI (matches the Dart app's design).
export function normalizedName(authorName) {
  return authorName.trim().toLowerCase();
}

// orders: [{id, authorName, content, amountWon, printedAt}]
// Returns: [{displayName, items, subtotal, count}]
export function groupByCustomer(orders) {
  const order = [];
  const groups = new Map();
  for (const item of orders) {
    const key = normalizedName(item.authorName);
    if (!groups.has(key)) {
      order.push(key);
      groups.set(key, []);
    }
    groups.get(key).push(item);
  }
  return order.map((key) => {
    const items = groups.get(key);
    const subtotal = items.reduce((sum, it) => sum + it.amountWon, 0);
    return {
      displayName: items[0].authorName.trim(),
      items,
      subtotal,
      count: items.length,
    };
  });
}

function csvEscape(value) {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

// Flat, ungrouped export — one row per print, for bookkeeping/reconciliation
// outside the app.
export function buildCsv(items) {
  const rows = [
    ['Author Name', 'Content', 'Amount (KRW)', 'Printed At'],
    ...items.map((item) => [item.authorName, item.content, String(item.amountWon), item.printedAt]),
  ];
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
}

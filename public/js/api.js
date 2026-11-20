// Backend wrapper — the only place that knows how orders are actually
// stored. Backed by Google Apps Script + a Google Sheet (via gasClient's
// JSONP calls) so order history survives even when no laptop is running a
// local server. Return shapes are preserved from the old local-server
// version so callers (printView.js, customersView.js) need no changes.
import { sheetsReq } from './gasClient.js';

const SHEET = 'Orders';

export async function getOrders() {
  const res = await sheetsReq('getAll', { sheet: SHEET });
  return res.rows || [];
}

// order: {authorName, content, amountWon, printedAt}
export async function addOrder(order) {
  const row = { id: crypto.randomUUID(), ...order };
  await sheetsReq('append', { sheet: SHEET, row });
  return row;
}

export async function deleteOrder(id) {
  await sheetsReq('delete', { sheet: SHEET, id });
}

// patch: partial fields to overwrite, e.g. {content, amountWon}
export async function updateOrder(id, patch) {
  await sheetsReq('update', { sheet: SHEET, id, row: patch });
}

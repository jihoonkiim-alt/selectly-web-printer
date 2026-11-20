// Google Apps Script backend for the Selectly web printer app.
// Bind this script to a dedicated Google Sheet (separate from the Shane's
// Online Shop groupware sheet/script — do not merge them) with one tab
// named "Orders" and header row: id, authorName, content, amountWon, printedAt
//
// This is a reference copy kept in the repo for version history — Apps
// Script itself only runs the copy pasted into the online editor
// (Extensions > Apps Script), not this file directly.
//
// Setup:
//   1. Run setToken() once from the Apps Script editor (pick ▷ next to it)
//      to generate and store the shared secret in Script Properties.
//   2. Deploy > New deployment > Web app > Execute as: Me > Who has
//      access: Anyone > Deploy. Copy the resulting .../exec URL.
//   3. Paste that URL and the printed token into settings.html in the app.
const SS = SpreadsheetApp.getActiveSpreadsheet();
const TOKEN = PropertiesService.getScriptProperties().getProperty('TOKEN');

function doGet(e) {
  const action = e.parameter.action;
  const cb = e.parameter.callback;
  let result;

  try {
    if (e.parameter.token !== TOKEN) {
      result = { ok: false, error: 'unauthorized' };
    } else if (action === 'getAll') {
      result = { ok: true, rows: getSheet(e.parameter.sheet) };
    } else if (action === 'append') {
      const row = JSON.parse(e.parameter.row);
      appendRow(e.parameter.sheet, row);
      result = { ok: true };
    } else if (action === 'delete') {
      deleteRow(e.parameter.sheet, e.parameter.id);
      result = { ok: true };
    } else if (action === 'update') {
      const patch = JSON.parse(e.parameter.row);
      updateRow(e.parameter.sheet, e.parameter.id, patch);
      result = { ok: true };
    } else {
      result = { ok: false, error: 'unknown action' };
    }
  } catch (err) {
    result = { ok: false, error: err.message };
  }

  const json = JSON.stringify(result);
  return ContentService.createTextOutput(cb + '(' + json + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

// --- helpers, ported as-is from the proven Shane's Shop sheets-api.gs ---

function getSheet(name) {
  const sheet = SS.getSheetByName(name);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function appendRow(name, obj) {
  const sheet = SS.getSheetByName(name);
  if (!sheet) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => obj[h] !== undefined ? obj[h] : '');
  sheet.appendRow(row);
}

function deleteRow(name, id) {
  const sheet = SS.getSheetByName(name);
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('id');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      sheet.deleteRow(i + 1);
      return;
    }
  }
}

// Patches only the fields present in `patch` — leaves the rest of the row
// untouched (unlike appendRow, which writes a full row).
function updateRow(name, id, patch) {
  const sheet = SS.getSheetByName(name);
  if (!sheet) return;
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('id');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      headers.forEach((h, col) => {
        if (patch[h] !== undefined) {
          sheet.getRange(i + 1, col + 1).setValue(patch[h]);
        }
      });
      return;
    }
  }
}

// Run once manually from the Apps Script editor to set the shared secret.
function setToken() {
  const token = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty('TOKEN', token);
  Logger.log('Token (copy this into settings.html): ' + token);
}

// Run once to create the "Orders" tab with the right header row, if it
// doesn't already exist.
function initSheet() {
  let sheet = SS.getSheetByName('Orders');
  if (!sheet) {
    sheet = SS.insertSheet('Orders');
  }
  sheet.getRange(1, 1, 1, 5).setValues([['id', 'authorName', 'content', 'amountWon', 'printedAt']]);
  sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
}

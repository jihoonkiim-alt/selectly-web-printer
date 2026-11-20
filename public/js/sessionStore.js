// Persists the paste/parse working session to localStorage, keyed by date,
// so leaving index.html (e.g. to customers.html) and coming back doesn't
// lose what was pasted — and so past days' paste batches stay viewable for
// a while instead of vanishing the moment a new day's paste overwrites them.
const PREFIX = 'selectly_paste_';
const DATES_KEY = 'selectly_paste_dates';
const RETENTION_DAYS = 30;

export function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function readDates() {
  try {
    return JSON.parse(localStorage.getItem(DATES_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeDates(dates) {
  try {
    localStorage.setItem(DATES_KEY, JSON.stringify(dates));
  } catch {
    // localStorage unavailable (private window, quota, etc.) — degrade silently.
  }
}

export function saveSession(dateKey, session) {
  try {
    localStorage.setItem(PREFIX + dateKey, JSON.stringify(session));
    const dates = readDates();
    if (!dates.includes(dateKey)) {
      dates.push(dateKey);
      writeDates(dates);
    }
  } catch {
    // Same as above — a failed save shouldn't crash the print flow.
  }
}

export function loadSession(dateKey) {
  try {
    const raw = localStorage.getItem(PREFIX + dateKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Dates with a saved session, newest first — for the "지난 기록 / Past
// records" picker.
export function listDates() {
  return readDates().sort().reverse();
}

// Removes sessions older than RETENTION_DAYS (1개월 보관 — about a month).
// Call once on page load.
export function pruneOld() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffKey = cutoff.toISOString().slice(0, 10);

  const dates = readDates();
  const kept = [];
  for (const d of dates) {
    if (d < cutoffKey) {
      try {
        localStorage.removeItem(PREFIX + d);
      } catch {
        // ignore
      }
    } else {
      kept.push(d);
    }
  }
  if (kept.length !== dates.length) writeDates(kept);
}

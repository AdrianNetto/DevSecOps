const clock = require('./clock');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function pad(n) {
  return String(n).padStart(2, '0');
}

function toDateString(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function isValidDateString(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = parseDate(value);
  return toDateString(d) === value;
}

// Parses YYYY-MM-DD as a local calendar date (midnight).
function parseDate(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function today() {
  return toDateString(clock.now());
}

function addDays(dateStr, days) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return toDateString(d);
}

// Whole calendar days from a to b (b - a). Uses UTC to avoid DST drift.
function diffDays(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / MS_PER_DAY);
}

function isWeekend(dateStr) {
  const day = parseDate(dateStr).getDay();
  return day === 0 || day === 6;
}

module.exports = { toDateString, isValidDateString, parseDate, today, addDays, diffDays, isWeekend };

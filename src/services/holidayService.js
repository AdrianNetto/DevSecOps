const axios = require('axios');
const config = require('../config');
const dates = require('../utils/dates');

// year -> Set<'YYYY-MM-DD'> loaded from the public API
const cache = new Map();

// Fixed-date Brazilian national holidays (MM-DD).
const FIXED_FALLBACK = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];

// Anonymous Gregorian algorithm (Meeus/Jones/Butcher).
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return dates.toDateString(new Date(year, month - 1, day));
}

function fallbackHolidays(year) {
  const easter = easterSunday(year);
  const list = FIXED_FALLBACK.map((md) => `${year}-${md}`);
  list.push(dates.addDays(easter, -48)); // Carnival Monday
  list.push(dates.addDays(easter, -47)); // Carnival Tuesday
  list.push(dates.addDays(easter, -2)); // Good Friday
  list.push(dates.addDays(easter, 60)); // Corpus Christi
  return new Set(list);
}

async function getHolidays(year) {
  if (cache.has(year)) return cache.get(year);
  const { apiUrl, countryCode, timeoutMs } = config.holidays;
  try {
    const response = await axios.get(`${apiUrl}/${year}/${countryCode}`, { timeout: timeoutMs });
    if (!Array.isArray(response.data)) {
      throw new Error('Unexpected holiday API response');
    }
    const set = new Set(response.data.map((h) => h.date).filter((d) => dates.isValidDateString(d)));
    cache.set(year, set);
    return set;
  } catch (err) {
    if (config.env !== 'test') {
      console.warn(`[holidays] API unavailable for ${year} (${err.message}); using fallback list`);
    }
    return fallbackHolidays(year);
  }
}

async function isHoliday(dateStr) {
  const year = Number(dateStr.slice(0, 4));
  const holidays = await getHolidays(year);
  return holidays.has(dateStr);
}

async function isBusinessDay(dateStr) {
  return !dates.isWeekend(dateStr) && !(await isHoliday(dateStr));
}

// Returns dateStr if it's a business day, otherwise the next business day.
async function nextBusinessDay(dateStr) {
  let current = dateStr;
  // Bounded loop: no real calendar has more than a handful of consecutive non-business days.
  for (let i = 0; i < 30; i += 1) {
    if (await isBusinessDay(current)) return current;
    current = dates.addDays(current, 1);
  }
  return current;
}

function clearCache() {
  cache.clear();
}

module.exports = { getHolidays, isHoliday, isBusinessDay, nextBusinessDay, fallbackHolidays, easterSunday, clearCache };

jest.mock('axios');

const axios = require('axios');
const holidayService = require('../src/services/holidayService');
const { resetState } = require('./helpers');

beforeEach(() => resetState());

describe('Rule 3: holiday calendar', () => {
  test('uses holidays returned by the public API', async () => {
    axios.get.mockResolvedValue({ data: [{ date: '2025-03-12', name: 'Test Day' }] });
    expect(await holidayService.nextBusinessDay('2025-03-12')).toBe('2025-03-13');
    expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/2025/BR'), expect.objectContaining({ timeout: expect.any(Number) }));
  });

  test('falls back to the hardcoded list when the API times out', async () => {
    axios.get.mockRejectedValue(Object.assign(new Error('timeout of 3000ms exceeded'), { code: 'ECONNABORTED' }));
    // Christmas 2025 is a Thursday
    expect(await holidayService.nextBusinessDay('2025-12-25')).toBe('2025-12-26');
    // Carnival Monday/Tuesday 2025 (Mar 3-4)
    expect(await holidayService.nextBusinessDay('2025-03-03')).toBe('2025-03-05');
  });

  test('falls back when the API returns an unexpected payload', async () => {
    axios.get.mockResolvedValue({ data: '<html>error</html>' });
    expect(await holidayService.isHoliday('2025-11-20')).toBe(true);
  });

  test('computes Easter correctly for the fallback list', () => {
    expect(holidayService.easterSunday(2024)).toBe('2024-03-31');
    expect(holidayService.easterSunday(2025)).toBe('2025-04-20');
    expect(holidayService.easterSunday(2026)).toBe('2026-04-05');
  });
});

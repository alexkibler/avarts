import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatDate, formatTime, formatTimeGPX, formatSumTime, serializeNonPOJOs } from './utils';

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe('formatDate', () => {
	it('returns "Today at HH:MM AM/PM" for today\'s date', () => {
		const now = new Date();
		const result = formatDate(now);
		expect(result).toMatch(/^Today at \d{1,2}:\d{2} [AP]M$/);
	});

	it('returns a non-"Today" string for a past date', () => {
		const past = new Date('2020-03-15T09:00:00');
		const result = formatDate(past);
		expect(result).not.toMatch(/^Today/);
		expect(result).toContain('at');
	});

	it('accepts a date string as input', () => {
		const result = formatDate('2023-06-15T14:30:00');
		expect(typeof result).toBe('string');
		expect(result.length).toBeGreaterThan(0);
	});

	it('includes time with AM/PM in the result', () => {
		const result = formatDate('2020-01-01T10:00:00');
		expect(result).toMatch(/[AP]M/);
	});

	it('uses Dutch locale for non-today dates (nl dateStyle)', () => {
		// NOTE: The locale is hardcoded to 'nl' (Dutch). This may be unintentional
		// for an app intended for international users. Dates will appear in Dutch format
		// e.g. "15 juni 2023 at 02:30 PM" rather than "June 15, 2023 at 02:30 PM".
		// BUG: Locale should be configurable or use the user's locale.
		const result = formatDate('2023-06-15T14:30:00');
		// Dutch format uses lowercase month names
		expect(result).toMatch(/\d{1,2} \w+ \d{4} at/);
	});
});

// ---------------------------------------------------------------------------
// formatTime
// ---------------------------------------------------------------------------
describe('formatTime', () => {
	it('formats a UTC date string to "YYYY-MM-DD HH:MM:SS.mmmZ"', () => {
		const result = formatTime('2023-06-15T14:30:45.123Z');
		expect(result).toBe('2023-06-15 14:30:45.123Z');
	});

	it('zero-pads all components correctly', () => {
		const result = formatTime('2023-01-05T02:04:06.007Z');
		expect(result).toBe('2023-01-05 02:04:06.007Z');
	});

	it('handles Date objects', () => {
		const date = new Date('2023-06-15T14:30:45.100Z');
		const result = formatTime(date);
		expect(result).toBe('2023-06-15 14:30:45.100Z');
	});

	it('includes milliseconds in the output', () => {
		const result = formatTime('2023-01-01T00:00:00.000Z');
		expect(result).toBe('2023-01-01 00:00:00.000Z');
	});

	it('uses a space separator between date and time (not T)', () => {
		const result = formatTime('2023-01-01T12:00:00.000Z');
		expect(result).not.toContain('T');
		expect(result).toContain(' ');
	});
});

// ---------------------------------------------------------------------------
// formatTimeGPX
// ---------------------------------------------------------------------------
describe('formatTimeGPX', () => {
	it('formats a UTC date string to ISO 8601 "YYYY-MM-DDTHH:MM:SSZ" (GPX format)', () => {
		const result = formatTimeGPX('2023-06-15T14:30:45.123Z');
		expect(result).toBe('2023-06-15T14:30:45Z');
	});

	it('uses T separator (not space) between date and time', () => {
		const result = formatTimeGPX('2023-01-01T12:00:00Z');
		expect(result).toContain('T');
		expect(result).not.toMatch(/\d{4}-\d{2}-\d{2} /);
	});

	it('does NOT include milliseconds', () => {
		const result = formatTimeGPX('2023-06-15T14:30:45.999Z');
		expect(result).not.toContain('.');
		expect(result).toBe('2023-06-15T14:30:45Z');
	});

	it('handles Date objects', () => {
		const date = new Date('2023-06-15T14:30:45.000Z');
		const result = formatTimeGPX(date);
		expect(result).toBe('2023-06-15T14:30:45Z');
	});

	it('zero-pads all components correctly', () => {
		const result = formatTimeGPX('2023-01-05T02:04:06Z');
		expect(result).toBe('2023-01-05T02:04:06Z');
	});

	it('ends with Z (UTC designator)', () => {
		const result = formatTimeGPX('2023-06-15T14:30:45Z');
		expect(result).toMatch(/Z$/);
	});
});

// ---------------------------------------------------------------------------
// formatSumTime
// ---------------------------------------------------------------------------
describe('formatSumTime', () => {
	it('formats 0 seconds as "0h 0m"', () => {
		expect(formatSumTime(0)).toBe('0h 0m');
	});

	it('formats exactly one hour (3600 s) as "1h 0m"', () => {
		expect(formatSumTime(3600)).toBe('1h 0m');
	});

	it('formats 1 hour 1 minute (3661 s) as "1h 1m"', () => {
		expect(formatSumTime(3661)).toBe('1h 1m');
	});

	it('formats 2.5 hours (9000 s) as "2h 30m"', () => {
		expect(formatSumTime(9000)).toBe('2h 30m');
	});

	it('floors partial minutes (90 s = 1m 30s → "0h 1m")', () => {
		expect(formatSumTime(90)).toBe('0h 1m');
	});

	it('handles large values (10 hours)', () => {
		expect(formatSumTime(36000)).toBe('10h 0m');
	});

	it('returns a string', () => {
		expect(typeof formatSumTime(3600)).toBe('string');
	});

	it('format is "Xh Ym" with no leading zeros on hours', () => {
		expect(formatSumTime(3600)).toMatch(/^\d+h \d+m$/);
	});
});

// ---------------------------------------------------------------------------
// serializeNonPOJOs
// ---------------------------------------------------------------------------
describe('serializeNonPOJOs', () => {
	it('returns a deep clone of a plain object', () => {
		const obj = { a: 1, b: { c: 2 } };
		const result = serializeNonPOJOs(obj);
		expect(result).toEqual(obj);
		expect(result).not.toBe(obj);
		expect(result.b).not.toBe(obj.b);
	});

	it('returns a deep clone of an array', () => {
		const arr = [1, 2, { x: 3 }];
		const result = serializeNonPOJOs(arr);
		expect(result).toEqual(arr);
		expect(result).not.toBe(arr);
		expect(result[2]).not.toBe(arr[2]);
	});

	it('clones nested structures', () => {
		const obj = { user: { id: 'abc123', name: 'Test', nested: { deep: true } } };
		const result = serializeNonPOJOs(obj);
		expect(result).toEqual(obj);
		expect(result.user).not.toBe(obj.user);
		expect(result.user.nested).not.toBe(obj.user.nested);
	});

	it('handles null values', () => {
		const obj = { a: null };
		const result = serializeNonPOJOs(obj);
		expect(result).toEqual({ a: null });
	});

	it('handles primitive values (string)', () => {
		const result = serializeNonPOJOs('hello');
		expect(result).toBe('hello');
	});

	it('handles primitive values (number)', () => {
		const result = serializeNonPOJOs(42);
		expect(result).toBe(42);
	});

	it('handles objects with array values', () => {
		const obj = { tags: ['running', 'cycling'], count: 2 };
		const result = serializeNonPOJOs(obj);
		expect(result).toEqual(obj);
		expect(result.tags).not.toBe(obj.tags);
	});

	it('clones a PocketBase-like auth model object', () => {
		const model = {
			id: 'user123',
			username: 'testuser',
			name: 'Test User',
			weight: 70,
			avatar: '',
			collectionId: '_pb_users_auth_',
			collectionName: 'users',
			created: '2023-01-01T00:00:00Z',
			updated: '2023-01-01T00:00:00Z',
			emailVisibility: false,
			verified: false,
		};
		const result = serializeNonPOJOs(model);
		expect(result).toEqual(model);
		expect(result).not.toBe(model);
	});
});

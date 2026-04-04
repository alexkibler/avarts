import { describe, it, expect } from 'vitest';
import { get } from 'svelte/store';
import { userCookie, activeGameTab } from './stores';

describe('stores.ts module', () => {
  it('verifies activeGameTab initializes to null', () => {
    expect(get(activeGameTab)).toBeNull();
  });

  it('verifies activeGameTab updates correctly', () => {
    activeGameTab.set('chat');
    expect(get(activeGameTab)).toBe('chat');

    activeGameTab.set('upload');
    expect(get(activeGameTab)).toBe('upload');

    activeGameTab.set('route');
    expect(get(activeGameTab)).toBe('route');

    activeGameTab.set(null);
    expect(get(activeGameTab)).toBeNull();
  });

  it('verifies userCookie stores and updates a value', () => {
      userCookie.set('test_cookie_value');
      expect(get(userCookie)).toBe('test_cookie_value');

      userCookie.set(undefined);
      expect(get(userCookie)).toBeUndefined();
  });
});

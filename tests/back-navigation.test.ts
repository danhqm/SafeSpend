import assert from 'node:assert/strict';
import test from 'node:test';
import { goBackOrReplace } from '../utils/back-navigation.ts';

test('back returns through the existing stack instead of replacing the originating page', () => {
  const calls: unknown[] = [];
  goBackOrReplace({ canGoBack: () => true, back: () => calls.push('back'), replace: href => calls.push(href) }, '/accounts');
  assert.deepEqual(calls, ['back']);
});

test('a detail page opened directly has a usable back destination', () => {
  const calls: unknown[] = [];
  goBackOrReplace({ canGoBack: () => false, back: () => calls.push('back'), replace: href => calls.push(href) }, '/accounts');
  assert.deepEqual(calls, ['/accounts']);
});

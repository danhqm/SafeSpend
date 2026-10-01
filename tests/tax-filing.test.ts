import assert from 'node:assert/strict';
import test from 'node:test';
import { suggestedFilingForm } from '../types/tax-filing.ts';

test('resident without business income is guided to BE', () => {
  assert.equal(suggestedFilingForm('resident', 'no'), 'BE');
});

test('resident with business income is guided to B', () => {
  assert.equal(suggestedFilingForm('resident', 'yes'), 'B');
});

test('non-resident is guided to M regardless of business answer', () => {
  assert.equal(suggestedFilingForm('non_resident', 'no'), 'M');
  assert.equal(suggestedFilingForm('non_resident', 'yes'), 'M');
  assert.equal(suggestedFilingForm('non_resident', 'unsure'), 'M');
});

test('unanswered classification never guesses a resident form', () => {
  assert.equal(suggestedFilingForm('unsure', 'yes'), null);
  assert.equal(suggestedFilingForm('resident', 'unsure'), null);
});

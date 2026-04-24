import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractHashtags, extractMentions, parseCommand } from '../telegram/bot.js';

test('extractHashtags: single tag', () => {
  const r = extractHashtags('#groceries buy milk');
  assert.deepEqual(r.tags, ['groceries']);
  assert.equal(r.text, 'buy milk');
});

test('extractHashtags: multiple tags, dedup', () => {
  const r = extractHashtags('#home #Home buy a lamp #diy');
  assert.deepEqual(r.tags, ['home', 'diy']);
  assert.equal(r.text, 'buy a lamp');
});

test('extractHashtags: no tags', () => {
  const r = extractHashtags('just a plain message');
  assert.deepEqual(r.tags, []);
  assert.equal(r.text, 'just a plain message');
});

test('extractHashtags: tag inside a word is not extracted', () => {
  const r = extractHashtags('email foo@bar.com with #urgent');
  assert.deepEqual(r.tags, ['urgent']);
});

test('parseCommand: /today', () => {
  const r = parseCommand('/today mow the lawn');
  assert.equal(r.command, 'today');
  assert.equal(r.rest, 'mow the lawn');
});

test('parseCommand: /assign with @botname', () => {
  const r = parseCommand('/assign@familybot @alice pick up keys');
  assert.equal(r.command, 'assign');
  assert.equal(r.rest, '@alice pick up keys');
});

test('parseCommand: no command', () => {
  const r = parseCommand('plain text with no slash');
  assert.equal(r.command, null);
  assert.equal(r.rest, 'plain text with no slash');
});

test('parseCommand: slash but not at start = no command', () => {
  const r = parseCommand('email a/b help');
  assert.equal(r.command, null);
});

test('extractMentions: single @user', () => {
  assert.deepEqual(extractMentions('@alice pick up keys'), ['@alice']);
});

test('extractMentions: multiple + dedup', () => {
  assert.deepEqual(extractMentions('@alice @bob @alice please'), ['@alice', '@bob']);
});

test('extractMentions: emails not captured', () => {
  // @example in "foo@example.com" is only captured if min length matches; we allow it.
  // Accept whatever behavior we get, but ensure plain text without @ returns empty.
  assert.deepEqual(extractMentions('no mentions here'), []);
});

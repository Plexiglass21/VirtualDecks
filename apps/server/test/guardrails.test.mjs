import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeNickname, WindowRateLimiter } from '../dist/guardrails.js'

test('Nicknames are validated, normalized and protected from markup/control chars', () => {
  assert.equal(normalizeNickname('  Maria   Rossi  '), 'Maria Rossi')
  assert.equal(normalizeNickname('Éloïse-2'), 'Éloïse-2')
  assert.equal(normalizeNickname('Ａｎｎａ'), 'Anna')
  for (const bad of ['', ' ', 'A', 'a'.repeat(21), 42, null, '<script>', 'Bob\nAdmin', 'a\u202eb', '👑king']) {
    assert.equal(normalizeNickname(bad), null, String(bad))
  }
})

test('Fixed-window limits are independent and reset predictably', () => {
  const limiter = new WindowRateLimiter()
  assert.equal(limiter.allow('ipA', 2, 1000, 0), true)
  assert.equal(limiter.allow('ipA', 2, 1000, 200), true)
  assert.equal(limiter.allow('ipA', 2, 1000, 300), false)
  assert.equal(limiter.allow('ipB', 2, 1000, 300), true)
  assert.equal(limiter.allow('ipA', 2, 1000, 1000), true)
  limiter.sweep(2000)
  assert.equal(limiter.allow('ipB', 2, 1000, 2100), true)
})

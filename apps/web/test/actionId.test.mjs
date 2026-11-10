import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createActionId } from '../src/utils/actionId.ts'

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const serverAccepted = /^[0-9a-f-]{36}$/

test('uses native randomUUID in a secure context', () => {
  const expected = '12345678-1234-4234-9234-123456789abc'
  const secure = {
    randomUUID: () => expected,
    getRandomValues: () => { throw new Error('Fallback must not run') },
  }
  assert.equal(createActionId(secure), expected)
})

test('works on an HTTP-LAN context with no randomUUID()', () => {
  const insecure = {
    getRandomValues(bytes) {
      for (let i = 0; i < bytes.length; i++) bytes[i] = i * 11 + 3
      return bytes
    },
  }
  const id = createActionId(insecure)
  assert.match(id, uuidV4)
  assert.match(id, serverAccepted)
})

test('generates distinct server-compatible IDs for successive actions', () => {
  let callCount = 0
  const insecure = {
    getRandomValues(bytes) {
      callCount++
      for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 7 + callCount * 31) % 256
      return bytes
    },
  }
  const first = createActionId(insecure)
  const second = createActionId(insecure)
  assert.notEqual(first, second)
  assert.match(first, uuidV4)
  assert.match(second, uuidV4)
})

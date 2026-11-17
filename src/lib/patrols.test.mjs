import assert from 'node:assert/strict'
import test from 'node:test'
import { canSaveYouthPatrol, formatPatrolPost } from './patrols.ts'

test('active youth can receive or change an assignment', () => {
  assert.equal(canSaveYouthPatrol(true, 'patrol-a', 'patrol-b'), true)
  assert.equal(canSaveYouthPatrol(true, null, 'patrol-a'), true)
})

test('inactive youth can keep or remove an existing assignment but cannot receive or change one', () => {
  assert.equal(canSaveYouthPatrol(false, 'patrol-a', 'patrol-a'), true)
  assert.equal(canSaveYouthPatrol(false, 'patrol-a', ''), true)
  assert.equal(canSaveYouthPatrol(false, 'patrol-a', 'patrol-b'), false)
  assert.equal(canSaveYouthPatrol(false, null, 'patrol-a'), false)
})

test('legacy post labels remain readable and null means ordinary member', () => {
  assert.equal(formatPatrolPost('C.P.'), 'C.P.')
  assert.equal(formatPatrolPost('S.P.'), 'S.P.')
  assert.equal(formatPatrolPost(null), 'Membre')
  assert.equal(formatPatrolPost('#N/A'), '#N/A')
  assert.equal(formatPatrolPost('Photographe'), 'Photographe')
})

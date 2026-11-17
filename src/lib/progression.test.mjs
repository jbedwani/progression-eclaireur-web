import assert from 'node:assert/strict'
import test from 'node:test'
import { activeTotals, badgeProgress, labelPrerequisites, positiveInteger, progressionDate } from './progression.ts'

test('requires strictly positive whole numbers without alternate numeric notation', () => {
  assert.equal(positiveInteger('12'), 12)
  for (const value of ['', '0', '-1', '1.5', '1e2', 'Infinity', 'NaN', '9007199254740992']) {
    assert.throws(() => positiveInteger(value), /entier strictement positif/)
  }
})

test('recognition dates preserve legacy UTC midnight and Montreal dates across DST changes', () => {
  for (const [timestamp, expected] of [
    ['2026-02-03T00:00:00+00:00', '2026-02-03'],
    ['2026-07-12T04:00:00Z', '2026-07-12'],
    ['2026-11-12T05:00:00Z', '2026-11-12'],
    ['2026-03-08T05:00:00Z', '2026-03-08'],
    ['2026-11-01T04:00:00Z', '2026-11-01'],
  ]) {
    assert.equal(progressionDate(timestamp), expected)
  }
  assert.equal(progressionDate(null), '')
  assert.throws(() => progressionDate('not-a-date'), /invalide/)
})

test('current totals exclude archived entries without hiding historical values', () => {
  const entries = [
    { active: true, degrees: 25, hours: null },
    { active: true, degrees: null, hours: 2 },
    { active: false, degrees: 100, hours: 12 },
  ]
  assert.deepEqual(activeTotals(entries), { degrees: 25, hours: 2 })
  assert.equal(entries[2].hours, 12)
})

test('Colibri thresholds use independent active-hour totals at 15, 40 and 80 hours', () => {
  for (const [code, threshold] of [['Colibri 2', 15], ['Colibri 3', 40], ['Colibri 4', 80]]) {
    const entries = [
      { category: 'badge', badge_code: code, active: true, hours: threshold - 1 },
      { category: 'badge', badge_code: code, active: false, hours: 100 },
      { category: 'badge', badge_code: 'Other', active: true, hours: 100 },
    ]
    assert.deepEqual(badgeProgress(entries, code, threshold), { hours: threshold - 1, obtained: false })
    entries.push({ category: 'badge', badge_code: code, active: true, hours: 1 })
    assert.deepEqual(badgeProgress(entries, code, threshold), { hours: threshold, obtained: true })
  }
})

test('labels unlock only after all distinct challenges of every earlier label are actively recognized', () => {
  const labels = ['Brousse', 'Piste', 'Sentier', 'Route'].map((code, index) =>
    ({ code, sort_order: index + 1, active: true }))
  const recognition = (code, slot, active = true) =>
    ({ category: 'label', label_code: code, challenge_code: `Défi ${slot}`, active })
  const entries = [recognition('Brousse', 1), recognition('Brousse', 2),
    recognition('Brousse', 2), recognition('Brousse', 3, false)]
  assert.deepEqual(labelPrerequisites(entries, labels, 'Brousse'), [])
  assert.deepEqual(labelPrerequisites(entries, labels, 'Piste').map((l) => l.code), ['Brousse'])
  entries.push(recognition('Brousse', 3))
  assert.deepEqual(labelPrerequisites(entries, labels, 'Piste'), [])
  entries.push(...[1, 2, 3].map((slot) => recognition('Sentier', slot)))
  assert.deepEqual(labelPrerequisites(entries, labels, 'Route').map((l) => l.code), ['Piste'])
  entries.push(...[1, 2, 3].map((slot) => recognition('Piste', slot)))
  assert.deepEqual(labelPrerequisites(entries, labels, 'Route'), [])
  entries[0].active = false
  assert.deepEqual(labelPrerequisites(entries, labels, 'Route').map((l) => l.code), ['Brousse'])
})

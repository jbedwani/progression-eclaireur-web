import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const { outputText } = ts.transpileModule(
  readFileSync(new URL('./ProgressionService.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
)

function setup({ optionsError = null, mutationError = null, mutationResult = 'entry-id', options } = {}) {
  const calls = []
  const exports = {}
  const validOptions = {
    can_write: true, labels: [], markers: [], badges: [], responsibles: [],
  }
  const client = {
    from(table) {
      const call = { table, filters: [] }
      calls.push(call)
      const query = {
        select() { return query },
        eq(...filter) { call.filters.push(filter); return query },
        order() { return query },
        async returns() { return { data: [], error: null } },
      }
      return query
    },
    rpc(name, args) {
      calls.push({ name, args })
      return {
        async returns() {
          return name === 'progression_editor_options' ?
            { data: options ?? validOptions, error: optionsError } :
            { data: mutationResult, error: mutationError }
        },
      }
    },
  }
  runInNewContext(outputText, {
    exports, Error, Number,
    require(name) {
      assert.equal(name, './lib/supabase')
      return { supabase: client }
    },
  })
  return { service: exports, calls }
}

test('loading scopes entries to one youth and individual progression', async () => {
  const { service, calls } = setup()
  await service.loadProgression('youth-id')
  assert.deepEqual(calls[0].filters, [['youth_id', 'youth-id'], ['scope_type', 'youth']])
  assert.deepEqual(calls[1].filters, [['youth_id', 'youth-id']])
  assert.equal(calls[2].args.p_youth_id, 'youth-id')
})

test('catalogue and malformed response errors cannot become empty success states', async () => {
  const cases = [
    { optionsError: { message: 'Catalogue indisponible' } },
    { options: { can_write: true } },
    { options: { can_write: true, labels: [], markers: [], badges: [{ code: 'bad' }], responsibles: [] } },
  ]
  for (const options of cases) {
    await assert.rejects(setup(options).service.loadProgression('youth-id'), /incomplète|indisponible/)
  }
})

test('writes send the original revision and require the matching saved identifier', async () => {
  const input = {
    id: 'entry-id', revision: 7, category: 'marker', code: 'Nature', degrees: 25,
    hours: null, date: '2026-11-12', responsibleId: 'animator-id', description: null,
  }
  const { service, calls } = setup()
  await service.saveProgression('youth-id', input)
  assert.equal(calls[0].args.p_revision, 7)
  assert.equal(calls[0].args.p_youth_id, 'youth-id')
  for (const mutationResult of ['', 'different-id', { id: 'entry-id' }]) {
    await assert.rejects(setup({ mutationResult }).service.saveProgression('youth-id', input), /Confirmation/)
  }
  await assert.rejects(setup({ mutationError: { message: 'Conflit de révision' } }).service.saveProgression('youth-id', input), /Conflit/)
})

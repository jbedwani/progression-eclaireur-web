
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type Unit = {
  id: string
  name: string
  active: boolean
}

async function getErrorMessage(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError && error.context instanceof Response) {
    try {
      const body = await error.context.clone().json()
      if (typeof body.error === 'string') return body.error
    } catch {
      // Utiliser le message générique ci-dessous.
    }
  }

  return error instanceof Error
    ? error.message
    : 'Une erreur inattendue est survenue.'
}

export default function UnitAdmin({
  onUnitsChanged,
}: {
  onUnitsChanged: () => void
}) {
  const [units, setUnits] = useState<Unit[]>([])
  const [newName, setNewName] = useState('')
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    const { data, error: loadError } = await supabase
      .from('units')
      .select('id, name, active')
      .order('name')

    if (loadError) {
      console.error('Erreur de chargement des unités :', loadError)
      setError('Impossible de charger les unités.')
    } else {
      const loaded = data ?? []
      setUnits(loaded)
      setNames(Object.fromEntries(loaded.map((unit) => [unit.id, unit.name])))
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  async function runAction(
    action: 'create' | 'rename' | 'archive' | 'restore',
    unitId?: string,
    name?: string,
  ) {
    const key = unitId ?? 'create'
    setSaving(key)
    setError('')
    setMessage('')

    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        'manage-units',
        {
          body: { action, ...(unitId ? { unitId } : {}), ...(name !== undefined ? { name } : {}) },
        },
      )

      if (functionError) throw functionError
      if (data?.error) throw new Error(data.error)

      const labels = {
        create: 'Unité créée.',
        rename: 'Nom de l’unité modifié.',
        archive: 'Unité archivée.',
        restore: 'Unité réactivée.',
      }

      setMessage(labels[action])
      if (action === 'create') setNewName('')
      await loadData()
      onUnitsChanged()
    } catch (cause) {
      console.error(`Erreur manage-units (${action}) :`, cause)
      setError(await getErrorMessage(cause))
    } finally {
      setSaving(null)
    }
  }

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = newName.trim()

    if (!name || name.length > 100) {
      setError('Le nom doit contenir entre 1 et 100 caractères.')
      return
    }

    void runAction('create', undefined, name)
  }

  function handleRename(unit: Unit) {
    const name = (names[unit.id] ?? '').trim()

    if (!name || name.length > 100) {
      setError('Le nom doit contenir entre 1 et 100 caractères.')
      return
    }

    if (name === unit.name) {
      setError('Le nom est inchangé.')
      return
    }

    void runAction('rename', unit.id, name)
  }

  function handleArchive(unit: Unit) {
    if (!window.confirm(`Archiver l’unité « ${unit.name} » ?`)) return
    void runAction('archive', unit.id)
  }

  const activeUnits = units.filter((unit) => unit.active)
  const inactiveUnits = units.filter((unit) => !unit.active)

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Gestion des unités</h2>
          <p>Créer, modifier, archiver et réactiver les unités.</p>
        </div>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success" role="status">{message}</p>}

      <form className="unit-create-form" onSubmit={handleCreate}>
        <label htmlFor="new-unit-name">Nouvelle unité</label>
        <div className="unit-form-row">
          <input
            id="new-unit-name"
            type="text"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            maxLength={100}
            placeholder="Nom de l’unité"
            required
          />
          <button className="primary-action" type="submit" disabled={saving !== null}>
            {saving === 'create' ? 'Création…' : 'Créer'}
          </button>
        </div>
      </form>

      {loading ? (
        <div className="empty-table">Chargement des unités…</div>
      ) : (
        <>
          <div className="unit-list-heading">
            <h3>Unités actives ({activeUnits.length})</h3>
          </div>

          {activeUnits.length === 0 ? (
            <p className="empty-table">Aucune unité active.</p>
          ) : (
            <div className="unit-list">
              {activeUnits.map((unit) => (
                <article className="unit-admin-row" key={unit.id}>
                  <div className="unit-admin-fields">
                    <input
                      aria-label={`Nom de l’unité ${unit.name}`}
                      value={names[unit.id] ?? ''}
                      onChange={(event) =>
                        setNames((current) => ({ ...current, [unit.id]: event.target.value }))
                      }
                      maxLength={100}
                    />
                    <span className="status-active">Active</span>
                  </div>
                  <div className="unit-admin-actions">
                    <button
                      type="button"
                      onClick={() => handleRename(unit)}
                      disabled={saving !== null}
                    >
                      Enregistrer
                    </button>
                    <button
                      type="button"
                      onClick={() => handleArchive(unit)}
                      disabled={saving !== null}
                    >
                      {saving === unit.id ? 'Traitement…' : 'Archiver'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="unit-list-heading">
            <h3>Unités archivées ({inactiveUnits.length})</h3>
          </div>

          {inactiveUnits.length === 0 ? (
            <p className="empty-table">Aucune unité archivée.</p>
          ) : (
            <div className="unit-list">
              {inactiveUnits.map((unit) => (
                <article className="unit-admin-row unit-inactive" key={unit.id}>
                  <div className="unit-admin-fields">
                    <strong>{unit.name}</strong>
                    <span className="status-inactive">Inactive</span>
                  </div>
                  <div className="unit-admin-actions">
                    <button
                      type="button"
                      onClick={() => void runAction('restore', unit.id)}
                      disabled={saving !== null}
                    >
                      {saving === unit.id ? 'Traitement…' : 'Réactiver'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

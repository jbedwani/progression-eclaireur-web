import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

type Animator = {
  id: string
  display_name: string | null
  email: string | null
}

type Unit = {
  id: string
  name: string
}

type Assignment = {
  user_id: string
  unit_id: string
  active: boolean
}

export default function AnimatorAssignmentAdmin({
  refreshKey,
}: {
  refreshKey: number
}) {
  const [animators, setAnimators] = useState<Animator[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [savingName, setSavingName] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [
        { data: animatorData, error: animatorError },
        { data: unitData, error: unitError },
        { data: assignmentData, error: assignmentError },
      ] = await Promise.all([
          supabase.rpc('list_active_animators_with_email'),
          supabase
          .from('units')
          .select('id, name')
          .eq('active', true)
          .order('name'),
        supabase
          .from('animator_assignments')
          .select('user_id, unit_id, active'),
      ])

      if (animatorError) throw animatorError
      if (unitError) throw unitError
      if (assignmentError) throw assignmentError

      const animatorRows = (animatorData ?? []) as {
        animator_id: string
        display_name: string | null
        email: string | null
      }[]

      const loadedAnimators: Animator[] = animatorRows.map((animator) => ({
        id: animator.animator_id,
        display_name: animator.display_name,
        email: animator.email,
      }))

      setAnimators(loadedAnimators)
      setUnits(unitData ?? [])
      setAssignments(assignmentData ?? [])
      setNames(
        Object.fromEntries(
          loadedAnimators.map((animator) => [
            animator.id,
            animator.display_name ?? '',
          ]),
        ),
      )
    } catch (cause) {
      console.error('Erreur de chargement des affectations :', cause)
      setError(
        'Impossible de charger les affectations. Vérifie tes droits administrateur et réessaie.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData, refreshKey])

  function isAssigned(animatorId: string, unitId: string) {
    return assignments.some(
      (assignment) =>
        assignment.user_id === animatorId &&
        assignment.unit_id === unitId &&
        assignment.active,
    )
  }

  async function handleNameSave(animator: Animator) {
    const displayName = (names[animator.id] ?? '').trim()

    if (!displayName) {
      setError('Le prénom et le nom sont obligatoires.')
      return
    }

    if (displayName.length > 100) {
      setError('Le nom ne peut pas dépasser 100 caractères.')
      return
    }

    setSavingName(animator.id)
    setError('')
    setMessage('')

    try {
      const { error: rpcError } = await supabase.rpc(
        'set_animator_display_name',
        {
          p_animator_id: animator.id,
          p_display_name: displayName,
        },
      )

      if (rpcError) throw rpcError

      setAnimators((current) =>
        current.map((item) =>
          item.id === animator.id
            ? { ...item, display_name: displayName }
            : item,
        ),
      )

      setMessage(`Nom de ${displayName} enregistré.`)
    } catch (cause) {
      console.error('Erreur de modification du nom :', cause)
      setError(
        cause instanceof Error
          ? cause.message
          : 'Impossible d’enregistrer ce nom.',
      )
    } finally {
      setSavingName(null)
    }
  }

  async function handleAssignmentChange(
    animatorId: string,
    unitId: string,
    active: boolean,
  ) {
    const key = `${animatorId}-${unitId}`

    setSaving(key)
    setError('')
    setMessage('')

    try {
      const { error: rpcError } = await supabase.rpc(
        'set_animator_unit_assignment',
        {
          p_animator_id: animatorId,
          p_unit_id: unitId,
          p_active: active,
        },
      )

      if (rpcError) throw rpcError

      setMessage(
        active
          ? 'Affectation activée.'
          : 'Affectation désactivée.',
      )

      await loadData()
    } catch (cause) {
      console.error('Erreur de modification de l’affectation :', cause)
      setError(
        cause instanceof Error
          ? cause.message
          : 'Impossible de modifier cette affectation.',
      )
    } finally {
      setSaving(null)
    }
  }

  return (
    <section
      className="assignment-admin"
      aria-labelledby="assignments-title"
    >
      <div className="assignment-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h2 id="assignments-title">
            Affectations des animateurs
          </h2>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() => void loadData()}
          disabled={loading || saving !== null || savingName !== null}
        >
          {loading ? 'Actualisation…' : 'Actualiser'}
        </button>
      </div>

      {error && (
        <p className="login-message" role="alert">
          {error}
        </p>
      )}

      {message && (
        <p className="invitation-message" role="status">
          {message}
        </p>
      )}

      {loading ? (
        <p>Chargement des affectations…</p>
      ) : animators.length === 0 ? (
        <p className="invitation-empty">
          Aucun animateur actif.
        </p>
      ) : units.length === 0 ? (
        <p className="invitation-empty">
          Aucune unité active.
        </p>
      ) : (
        <div className="assignment-table-wrapper">
          <table className="assignment-table">
            <thead>
              <tr>
                <th scope="col">Animateur</th>
                {units.map((unit) => (
                  <th scope="col" key={unit.id}>
                    {unit.name}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {animators.map((animator) => (
                <tr key={animator.id}>
                  <th scope="row">
                    <div className="assignment-animator-info">
                      <div className="assignment-animator-email">
                        {animator.email || 'Courriel indisponible'}
                      </div>

                      <div className="assignment-name-editor">
                        <input
                          type="text"
                          value={names[animator.id] ?? ''}
                          onChange={(event) =>
                            setNames((current) => ({
                              ...current,
                              [animator.id]: event.target.value,
                            }))
                          }
                          placeholder="Prénom et nom"
                          maxLength={100}
                          aria-label={`Nom de l’animateur ${animator.display_name ?? ''}`}
                          disabled={savingName !== null}
                        />

                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => void handleNameSave(animator)}
                          disabled={
                            savingName !== null ||
                            !(names[animator.id] ?? '').trim() ||
                            (names[animator.id] ?? '').trim() ===
                              (animator.display_name ?? '')
                          }
                        >
                          {savingName === animator.id ? 'Enregistrement…' : 'Enregistrer'}
                        </button>
                      </div>
                    </div>
                  </th>

                  {units.map((unit) => {
                    const key = `${animator.id}-${unit.id}`
                    const assigned = isAssigned(animator.id, unit.id)

                    return (
                      <td key={unit.id}>
                        <label className="assignment-checkbox">
                          <input
                            type="checkbox"
                            checked={assigned}
                            disabled={saving !== null}
                            onChange={(event) =>
                              void handleAssignmentChange(
                                animator.id,
                                unit.id,
                                event.target.checked,
                              )
                            }
                            aria-label={`${assigned ? 'Désactiver' : 'Activer'} l’affectation de ${animator.display_name || 'cet animateur'} à ${unit.name}`}
                          />

                          <span className="visually-hidden">
                            {assigned ? 'Affecté' : 'Non affecté'}
                          </span>
                        </label>

                        {saving === key && (
                          <span className="assignment-saving">
                            …
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
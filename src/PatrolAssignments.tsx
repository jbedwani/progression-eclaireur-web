import { useCallback, useEffect, useMemo, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type YouthOption = { id: string; name: string; unit_id: string | null; unitName: string; active: boolean }
type PatrolOption = { id: string; name: string; unit_id: string; unitName: string; active: boolean }
type Membership = { youth_id: string; patrol_id: string; school_year: string; post_name: string | null }
type HistoryEntry = {
  id: string; youth_id: string; school_year: string; old_patrol_id: string | null; new_patrol_id: string | null
  old_post_name: string | null; new_post_name: string | null; event_type: string; changed_at: string
}
type Draft = { patrolId: string; postName: string }

async function invokeError(error: unknown, fallback: string): Promise<Error> {
  if (error instanceof FunctionsHttpError) {
    const details = await error.context.json().catch(() => null)
    return new Error(typeof details?.error === 'string' ? details.error : error.message)
  }
  return new Error(error instanceof Error ? error.message : fallback)
}

export default function PatrolAssignments({ youth, patrols, onChanged }: {
  youth: YouthOption[]
  patrols: PatrolOption[]
  onChanged: () => Promise<void>
}) {
  const [schoolYear, setSchoolYear] = useState('')
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [savingYouth, setSavingYouth] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [unitFilter, setUnitFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data: yearResponse, error: yearError } = await supabase.functions.invoke<{ school_year?: string; error?: string }>('manage-patrols', { body: { action: 'current-year' } })
    if (yearError) {
      setError((await invokeError(yearError, 'Année scolaire courante introuvable.')).message)
      setLoading(false)
      return
    }
    const yearData = yearResponse?.school_year
    if (yearResponse?.error || typeof yearData !== 'string' || !yearData) {
      setError(yearResponse?.error ?? 'Année scolaire courante introuvable.')
      setLoading(false)
      return
    }
    setSchoolYear(yearData)
    const [membershipResult, historyResult] = await Promise.all([
      supabase.from('patrol_memberships').select('youth_id, patrol_id, school_year, post_name').eq('school_year', yearData),
      supabase.functions.invoke<{ history?: HistoryEntry[]; error?: string }>('manage-patrols', { body: { action: 'history' } }),
    ])
    if (membershipResult.error) {
      setError(`Chargement des affectations impossible : ${membershipResult.error.message}`)
      setLoading(false)
      return
    }
    if (historyResult.error) {
      setError((await invokeError(historyResult.error, 'Lecture de l’historique impossible.')).message)
    } else if (historyResult.data?.error) {
      setError(historyResult.data.error)
    }
    const rows = (membershipResult.data ?? []) as Membership[]
    setMemberships(rows)
    setDrafts(Object.fromEntries(rows.map((row) => [row.youth_id, {
      patrolId: row.patrol_id,
      postName: row.post_name === 'C.P.' || row.post_name === 'S.P.' ? row.post_name : 'member',
    }])))
    setHistory(historyResult.data?.history ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load, patrols])

  const units = useMemo(() => [...new Map(youth.filter((item) => item.unit_id).map((item) => [item.unit_id!, { id: item.unit_id!, name: item.unitName }])).values()].sort((a, b) => a.name.localeCompare(b.name, 'fr')), [youth])
  const visibleYouth = useMemo(() => youth.filter((item) => item.unit_id && (!unitFilter || item.unit_id === unitFilter)).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'fr')), [youth, unitFilter])
  const membershipByYouth = useMemo(() => new Map(memberships.map((item) => [item.youth_id, item])), [memberships])
  const youthNames = useMemo(() => new Map(youth.map((item) => [item.id, item.name])), [youth])
  const patrolNames = useMemo(() => new Map(patrols.map((item) => [item.id, item.name])), [patrols])

async function save(youthItem: YouthOption) {
    if (!youthItem.active) {
      setError('Un jeune inactif ne peut pas être modifié ou désaffecté.')
      return
    }
    if (savingYouth) return
    const draft = drafts[youthItem.id] ?? { patrolId: '', postName: 'member' }
    const existing = membershipByYouth.get(youthItem.id)
    if (!draft.patrolId && !existing) return
    setSavingYouth(youthItem.id)
    setError('')
    setMessage('')
    try {
      const action = draft.patrolId ? 'assign' : 'remove'
      const { data, error: requestError } = await supabase.functions.invoke<{ result?: { status?: string }; error?: string }>('manage-patrols', {
        body: {
          action,
          youth_id: youthItem.id,
          patrol_id: draft.patrolId || null,
          school_year: schoolYear,
          post_name: draft.postName,
        },
      })
      if (requestError) throw await invokeError(requestError, 'Enregistrement impossible.')
      if (data?.error) throw new Error(data.error)
      if (!data?.result) throw new Error('L’enregistrement de l’affectation n’a pas été confirmé.')
      setMessage(`${youthItem.name} : affectation mise à jour.`)
      await load()
      await onChanged()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enregistrement de l’affectation impossible.')
    } finally {
      setSavingYouth(null)
    }
  }

  const eventLabels: Record<string, string> = {
    assigned: 'Affectation créée', changed: 'Affectation modifiée', removed: 'Affectation retirée', patrol_replaced: 'Patrouille remplacée',
  }

  return <div className="patrol-assignment-panel">
    <div className="panel-heading"><div><h2>Affectations · {schoolYear || '…'}</h2><p>Une affectation active par jeune pour l’année scolaire courante. Les changements sont consignés dans l’historique.</p></div><button type="button" onClick={() => void load()} disabled={loading}>Actualiser</button></div>
    {error && <p className="youth-create-error" role="alert">{error}</p>}
    {message && <p className="youth-create-message" role="status">{message}</p>}
    <div className="patrol-assignment-filter"><label>Unité<select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)}><option value="">Toutes les unités</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select></label></div>
    {loading ? <div className="empty-table">Chargement des affectations…</div> : visibleYouth.length === 0 ? <div className="empty-table">Aucun jeune avec une unité.</div> : <div className="patrol-assignment-list">
      {visibleYouth.map((item) => {
        const draft = drafts[item.id] ?? { patrolId: '', postName: 'member' }
        const existing = membershipByYouth.get(item.id)
        const canAssign = item.active
        const choices = patrols.filter((patrol) => patrol.unit_id === item.unit_id && (patrol.active || patrol.id === existing?.patrol_id))
        const normalizedExistingPost = existing?.post_name === 'C.P.' || existing?.post_name === 'S.P.' ? existing.post_name : 'member'
        const changed = existing ? draft.patrolId !== existing.patrol_id || draft.postName !== normalizedExistingPost : Boolean(draft.patrolId)
        return <div className="patrol-assignment-row" key={item.id}>
          <div className="patrol-assignment-youth"><strong>{item.name}</strong><span>{item.unitName}{!item.active ? ' · Ancien jeune' : ''}</span></div>
          <label>Patrouille
            <select
              value={draft.patrolId}
              onChange={(event) => setDrafts((current) => ({
                ...current,
                [item.id]: { ...draft, patrolId: event.target.value },
              }))}
              disabled={!canAssign}
            >
              <option value="">Non assigné</option>
              {choices.map((patrol) => (
                <option key={patrol.id} value={patrol.id}>{patrol.name}</option>
              ))}
            </select>
          </label>

          <label>Poste
            <select
              value={draft.postName}
              onChange={(event) => setDrafts((current) => ({
                ...current,
                [item.id]: { ...draft, postName: event.target.value },
              }))}
              disabled={!canAssign || !draft.patrolId}
            >
              <option value="member">Membre</option>
              <option value="C.P.">C.P.</option>
              <option value="S.P.">S.P.</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => void save(item)}
            disabled={!canAssign || savingYouth !== null || !changed}
          >
            {savingYouth === item.id ? 'Enregistrement…' : 'Enregistrer'}
          </button>        </div>
      })}
    </div>}
    <details className="patrol-history"><summary>Historique des changements ({history.length})</summary>
      {history.length === 0 ? <p>Aucun changement enregistré.</p> : <div className="patrol-history-list">{history.map((entry) => <div key={entry.id} className="patrol-history-row"><strong>{youthNames.get(entry.youth_id) ?? 'Jeune archivé'}</strong><span>{eventLabels[entry.event_type] ?? entry.event_type}</span><span>{entry.old_patrol_id ? patrolNames.get(entry.old_patrol_id) ?? 'Ancienne patrouille' : '—'} → {entry.new_patrol_id ? patrolNames.get(entry.new_patrol_id) ?? 'Nouvelle patrouille' : '—'}</span><span className="patrol-history-post">{entry.old_post_name || 'Membre'} → {entry.new_post_name || 'Membre'}</span><small>{entry.school_year} · {new Date(entry.changed_at).toLocaleString('fr-CA')}</small></div>)}</div>}
    </details>
  </div>
}

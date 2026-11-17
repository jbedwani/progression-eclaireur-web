import { useCallback, useEffect, useRef, useState } from 'react'
import type { Profile } from './types/profile'
import {
  activeTotals, badgeProgress, labelPrerequisites, progressionDate,
  type ProgressionEntry, type YouthChallenge,
} from './lib/progression'
import {
  deactivateProgression, loadProgression, recognizeChallenge, saveChallenge, saveProgression,
} from './ProgressionService'
import ProgressionForm, { ChallengeForm } from './ProgressionForm'

type ProgressionGroup = {
  title: string
  entries: ProgressionEntry[]
}

const categoryLabels: Record<string, string> = {
  marker: 'Repères',
  badge: 'Brevets',
}

function groupEntries(
  entries: ProgressionEntry[],
  getTitle: (entry: ProgressionEntry) => string | null,
  fallbackTitle: string,
): ProgressionGroup[] {
  const groups = new Map<string, ProgressionGroup>()
  entries.forEach((entry) => {
    const title = getTitle(entry) || fallbackTitle
    const group = groups.get(title)
    if (group) {
      group.entries.push(entry)
    } else {
      groups.set(title, { title, entries: [entry] })
    }
  })
  return [...groups.values()]
}

function formatDate(value: string | null) {
  if (!value) return 'Date non précisée'
  return progressionDate(value)
}

type Editor =
  | { kind: 'entry'; entry?: ProgressionEntry }
  | { kind: 'challenge'; label: string; slot: number; challenge?: YouthChallenge }
  | { kind: 'recognize'; challenge: YouthChallenge }

export default function YouthProgression({ youthId, profile, onChanged }: {
  youthId: string
  profile: Profile
  onChanged?: () => void
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof loadProgression>> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [deactivating, setDeactivating] = useState<ProgressionEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const mutating = useRef(false)
  const requests = useRef({ generation: 0 })
  const entries = data?.entries ?? []
  const canWrite = data?.options.can_write === true && profile.active &&
    (profile.role === 'admin' || profile.role === 'animator')

  const load = useCallback(async () => {
    const request = ++requests.current.generation
    setLoading(true)
    setError('')
    try {
      const next = await loadProgression(youthId)
      if (request === requests.current.generation) setData(next)
    } catch (cause) {
      if (request === requests.current.generation) {
        setError(cause instanceof Error ? cause.message : 'Chargement de la progression impossible.')
      }
    } finally {
      if (request === requests.current.generation) setLoading(false)
    }
  }, [youthId])

  useEffect(() => {
    let cancelled = false
    const requestState = requests.current
    queueMicrotask(() => { if (!cancelled) void load() })
    return () => { cancelled = true; requestState.generation++ }
  }, [load])

  async function mutate(operation: () => Promise<void>, confirmation: string) {
    if (mutating.current) throw new Error('Une opération est déjà en cours.')
    mutating.current = true
    setBusy(true)
    setMessage('')
    setError('')
    try {
      await operation()
      setEditor(null)
      setDeactivating(null)
      setMessage(confirmation)
      await load()
      onChanged?.()
    } finally {
      mutating.current = false
      setBusy(false)
    }
  }

  async function deactivate(entry: ProgressionEntry) {
    try {
      await mutate(() => deactivateProgression(youthId, entry),
        entry.category === 'label' ? 'Défi rouvert; la reconnaissance précédente est conservée dans l’historique.' : 'Entrée désactivée; historique conservé.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Désactivation impossible.')
    }
  }

  function refresh() {
    setEditor(null)
    setDeactivating(null)
    setMessage('')
    void load()
  }

  function renderConfirmation(entry: ProgressionEntry) {
    if (deactivating?.id !== entry.id) return null
    const reopening = entry.category === 'label'
    return <div className="progression-confirm" role="group"
      aria-label={reopening ? 'Confirmer la réouverture' : 'Confirmer la désactivation'}>
      <p>{reopening
        ? `Rouvrir ce défi? La reconnaissance du ${formatDate(entry.occurred_at)} restera dans l’historique, mais le défi redeviendra modifiable et devra être reconnu de nouveau avec une nouvelle date.`
        : `Désactiver cette réalisation du ${formatDate(entry.occurred_at)}? Elle restera dans l’historique, mais ne comptera plus dans la progression courante.`}</p>
      {error && <p role="alert">{error}</p>}
      <div className="progression-actions">
        <button type="button" disabled={busy} onClick={() => void deactivate(entry)}>
          {busy ? 'Enregistrement…' : reopening ? 'Confirmer la réouverture' : 'Confirmer la désactivation'}</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => setDeactivating(null)}>Annuler</button>
      </div>
    </div>
  }

  const labelEntries = entries.filter((entry) => entry.category === 'label')
  const grouped = {
    marker: groupEntries(entries.filter((entry) => entry.category === 'marker'), (entry) => entry.marker_code, 'Repère non précisé'),
    badge: groupEntries(entries.filter((entry) => entry.category === 'badge'), (entry) => entry.badge_code, 'Brevet non précisé'),
    other: entries.filter((entry) => !['label', 'marker', 'badge'].includes(entry.category)),
  }

  if (!data && loading) return <div className="progression-loading">Chargement du parcours individuel…</div>

  return (
    <section className="youth-progression" aria-label="Progression individuelle">
      <div className="progression-actions">
        {canWrite && <button type="button" disabled={busy || loading || !!editor || !!deactivating}
          onClick={() => setEditor({ kind: 'entry' })}>Ajouter un Repère ou un Brevet</button>}
        <button type="button" className="secondary-button" disabled={busy || loading} onClick={refresh}>
          {loading ? 'Actualisation…' : 'Actualiser la progression'}
        </button>
      </div>
      {message && <p role="status" className="youth-create-message">{message}</p>}
      {error && <div className="load-error" role="alert"><strong>Progression : opération interrompue</strong><p>{error}</p></div>}
      {data && <>
      {!canWrite && (profile.role === 'admin' || profile.role === 'animator') &&
        <p className="progression-empty">Consultation seulement : jeune inactif ou droits d’écriture indisponibles.</p>}
      {canWrite && editor && (editor.kind === 'challenge' ?
        <ChallengeForm key={`${editor.label}-${editor.slot}`} label={editor.label} slot={editor.slot}
          challenge={editor.challenge} onCancel={() => setEditor(null)}
          onSave={(id, text) => mutate(() => saveChallenge(youthId, editor.label, editor.slot, text, id,
            editor.challenge?.revision ?? null), 'Défi préparé. Sa réalisation peut maintenant être reconnue.')} /> :
        <ProgressionForm key={editor.kind === 'entry' ? editor.entry?.id ?? 'new' : editor.challenge.id}
          options={data.options} currentUserId={profile.id}
          entry={editor.kind === 'entry' ? editor.entry : undefined}
          challenge={editor.kind === 'recognize' ? editor.challenge : undefined}
          onCancel={() => setEditor(null)}
          onSave={(input) => mutate(async () => {
            if (editor.kind === 'recognize') {
              if (!input.responsibleId) throw new Error('Choisissez un responsable.')
              await recognizeChallenge(youthId, editor.challenge, input.id, input.date, input.responsibleId)
            } else {
              await saveProgression(youthId, input)
            }
          }, 'Progression enregistrée.')} />)}
      <section className="progression-category" aria-label="Labels et défis personnels">
        <h3>Labels — défis personnels</h3>
        <p className="progression-empty">Préparer le défi, puis reconnaître sa réalisation avec une date et un responsable.</p>
        {data.options.labels.filter((label) => label.active ||
          data.challenges.some((challenge) => challenge.label_code === label.code) ||
          labelEntries.some((entry) => entry.label_code === label.code)).map((label) => {
          const prerequisites = labelPrerequisites(labelEntries, data.options.labels, label.code)
          if (prerequisites.length > 0) return <div className="progression-label-challenges" key={label.code}>
            <div className="progression-label-locked" aria-disabled="true">
              <span aria-hidden="true">🔒</span> {label.code} — verrouillé
            </div>
            <p className="progression-empty">
              Les trois défis de {prerequisites.map((item) => item.code).join(', ')} doivent être reconnus avant d’accéder à ce Label.
            </p>
          </div>
          const mine = labelEntries.filter((entry) => entry.label_code === label.code)
          const slotCodes = [1, 2, 3].map((slot) => `Défi ${slot}`)
          const unmatched = mine.filter((entry) => entry.active &&
            (!entry.challenge_code || !slotCodes.includes(entry.challenge_code)))
          const archived = mine.filter((entry) => !entry.active)
          const busyAny = busy || loading || !!editor || !!deactivating
          return <details className="progression-label-challenges" key={label.code}>
            <summary>{label.code}{!label.active ? ' (inactif)' : ''}</summary>
            {[1, 2, 3].map((slot) => {
              const challenge = data.challenges.find((item) => item.label_code === label.code && item.challenge_slot === slot)
              const recognitions = mine.filter((entry) => entry.active && entry.challenge_code === `Défi ${slot}`)
              const recognition = recognitions[0]
              const recognized = challenge?.completed_at != null || recognitions.length > 0
              const text = challenge?.challenge_text || recognition?.description
              return <article className="progression-challenge" key={slot}>
                <strong>Défi {slot}{recognized ? ' — Réalisé' : ''}</strong>
                <p>{text || 'Défi à définir.'}</p>
                {recognition && <small>
                  Reconnu le {formatDate(recognition.occurred_at)}{recognition.responsible ? ` · ${recognition.responsible}` : ''}
                </small>}
                {!recognition && challenge?.completed_at && <small>Reconnu le {formatDate(challenge.completed_at)}</small>}
                {recognitions.length > 1 && <p role="note">
                  Plusieurs reconnaissances actives pour ce défi : un administrateur doit corriger les doublons.
                </p>}
                {canWrite && !recognition && challenge?.completed_at && <p role="note">
                  Reconnaissance sans entrée active correspondante. Un administrateur doit vérifier ce dossier.
                </p>}
                {canWrite && <div className="progression-actions">
                  {recognition && recognitions.length === 1 && <button type="button" disabled={busyAny}
                    onClick={() => setEditor({ kind: 'entry', entry: recognition })}>Modifier</button>}
                  {recognition && recognitions.length === 1 && challenge && <button type="button"
                    className="secondary-button" disabled={busyAny}
                    onClick={() => setDeactivating(recognition)}>Rouvrir le défi</button>}
                  {!recognized && label.active && <button type="button" disabled={busyAny}
                    onClick={() => setEditor({ kind: 'challenge', label: label.code, slot, challenge })}>
                    {challenge ? 'Modifier le texte' : 'Préparer le défi'}
                  </button>}
                  {!recognized && label.active && challenge?.challenge_text?.trim() && <button type="button" disabled={busyAny}
                    onClick={() => setEditor({ kind: 'recognize', challenge })}>Reconnaître la réalisation</button>}
                </div>}
                {recognition && renderConfirmation(recognition)}
              </article>
            })}
            {unmatched.length > 0 && <article className="progression-challenge">
              <strong>Autres reconnaissances</strong>
              {unmatched.map((entry) => <div key={entry.id}>
                <p>{[entry.challenge_code, entry.description].filter(Boolean).join(' — ') || 'Reconnaissance'}</p>
                <small>{formatDate(entry.occurred_at)}{entry.responsible ? ` · ${entry.responsible}` : ''}</small>
                {canWrite && <div className="progression-actions"><button type="button" disabled={busyAny}
                  onClick={() => setEditor({ kind: 'entry', entry })}>Modifier</button></div>}
              </div>)}
            </article>}
            {archived.length > 0 && <details className="progression-challenge">
              <summary>Historique ({archived.length})</summary>
              {archived.map((entry) => <div key={entry.id} className="progression-entry-archived">
                <p>{[entry.challenge_code, entry.description].filter(Boolean).join(' — ')}</p>
                <small>Archivée · {formatDate(entry.occurred_at)}{entry.responsible ? ` · ${entry.responsible}` : ''}</small>
              </div>)}
            </details>}
          </details>
        })}
      </section>
      <div className="progression-summary">
        <div><strong>{entries.length}</strong><span>Entrées au dossier</span></div>
        <div><strong>{entries.filter((entry) => entry.active).length}</strong><span>Actives</span></div>
        <div><strong>{entries.filter((entry) => !entry.active).length}</strong><span>Archivées</span></div>
      </div>
      {(['marker', 'badge'] as const).map((category) => (
        <section className="progression-category" key={category}>
          <div className="progression-category-heading"><h3>{categoryLabels[category]}</h3><span>{grouped[category].reduce((count, group) => count + group.entries.length, 0)}</span></div>
          {grouped[category].length === 0 ? <p className="progression-empty">Aucune entrée enregistrée.</p> : (
            <div className="progression-subgroups">
              {grouped[category].map((group) => {
                const totals = activeTotals(group.entries)
                const required = category === 'badge' ?
                  data.options.badges.find((badge) => badge.code === group.title)?.required_hours : null
                const progress = required != null ? badgeProgress(group.entries, group.title, required) : null
                return (
                <section className="progression-subgroup" key={group.title}>
                  <div className="progression-subgroup-heading">
                    <h4>{group.title}</h4>
                    <div className="progression-subgroup-totals">
                      {group.entries.some((entry) => entry.degrees !== null) && (
                        <span>Total actif : {totals.degrees}°</span>
                      )}
                      {group.entries.some((entry) => entry.hours !== null) && (
                        <span>Total actif : {totals.hours} h</span>
                      )}
                      {progress && <span>{progress.obtained ? 'Obtenu' : 'En cours'} · seuil {required} h</span>}
                    </div>
                  </div>
                  <div className="progression-entry-list">
                    {group.entries.map((entry) => {
                      return (
                        <article className={`progression-entry${entry.active ? '' : ' progression-entry-archived'}`} key={entry.id}>
                          <div className="progression-entry-main">
                            {!entry.active && (
                              <div className="progression-entry-title">
                                <span className="status-inactive">Archivée</span>
                              </div>
                            )}
                            {entry.description && <p>{entry.description}</p>}
                            <small>{formatDate(entry.occurred_at)}{entry.responsible ? ` · ${entry.responsible}` : ''}</small>
                            {canWrite && entry.active && <div className="progression-actions">
                              <button type="button" disabled={busy || loading || !!editor || !!deactivating}
                                onClick={() => setEditor({ kind: 'entry', entry })}>Modifier</button>
                              <button type="button" className="secondary-button" disabled={busy || loading || !!editor || !!deactivating}
                                onClick={() => setDeactivating(entry)}>Désactiver</button>
                            </div>}
                            {renderConfirmation(entry)}
                          </div>
                          <div className="progression-entry-value">
                            {entry.degrees !== null && <strong>{entry.degrees}°</strong>}
                            {entry.hours !== null && <strong>{entry.hours} h</strong>}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </section>
                )
              })}
            </div>
          )}
        </section>
      ))}
      {grouped.other.length > 0 && <section className="progression-category"><div className="progression-category-heading"><h3>Autres entrées</h3><span>{grouped.other.length}</span></div><div className="progression-entry-list">{grouped.other.map((entry) => <article className="progression-entry" key={entry.id}><div className="progression-entry-main"><strong>{entry.category}</strong>{entry.description && <p>{entry.description}</p>}<small>{formatDate(entry.occurred_at)}</small></div></article>)}</div></section>}
      </>}
    </section>
  )
}

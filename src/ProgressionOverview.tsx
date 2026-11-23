
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Profile } from './types/profile'
import YouthProgression from './YouthProgression'
import { badgeProgress } from './lib/progression'
import {
  loadProgressionOverview,
  type ProgressionOverviewEntry,
  type ProgressionOverviewChallenge,
} from './ProgressionOverviewService'

type OverviewYouth = {
  id: string
  name: string
  active: boolean
  patrol: string
  unitName: string
}

type OverviewData = Awaited<ReturnType<typeof loadProgressionOverview>>
type Status = 'completed' | 'progress' | 'not-started'

type ProgressItem = {
  code: string
  status: Status
  percent: number
  color: string
  colibri?: boolean
}

function normalizeCode(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-CA')
    .replace(/[^a-z0-9]/g, '')
}

function getProgressStyle(code: string): { color: string; colibri: boolean } {
  const normalized = normalizeCode(code)

  const colors: Record<string, string> = {
    nature: '#029883',
    orientation: '#30449e',
    expression: '#cf0c07',
    pleinair: '#3b6b30',
    securite: '#5a3572',
    sport: '#f97c12',
    technique: '#b38b77',
    oplegerfixe: '#be008a',
    oplourd: '#25b3b9',
    oplegeritinerant: '#0f54db',
  }

  if (normalized.includes('colibri')) {
    return { color: '#4e3892', colibri: true }
  }

  return {
    color: colors[normalized] ?? '#68766e',
    colibri: false,
  }
}

type YouthSummary = {
  youth: OverviewYouth
  currentLabel: string
  currentLabelDisplay: string
  recognizedChallenges: number
  definedChallenges: number
  markers: ProgressItem[]
  badges: ProgressItem[]
}

function summarizeYouth(
  youth: OverviewYouth,
  entries: ProgressionOverviewEntry[],
  challenges: ProgressionOverviewChallenge[],
  labels: OverviewData['catalogs']['labels'],
  markers: OverviewData['catalogs']['markers'],
  badges: OverviewData['catalogs']['badges'],
): YouthSummary {
  const youthEntries = entries.filter((entry) => entry.youth_id === youth.id)
  const activeEntries = youthEntries.filter((entry) => entry.active)
  const youthChallenges = challenges.filter((item) => item.youth_id === youth.id)


const challengeProgress = (labelCode: string) => {
  const defined = [1, 2, 3].filter((slot) => {
  const challenge = youthChallenges.find(
      (item) => item.label_code === labelCode && item.challenge_slot === slot,
  )

  const recognition = activeEntries.find(
      (entry) =>
      entry.category === 'label' &&
      entry.label_code === labelCode &&
      entry.challenge_code === `Défi ${slot}`,
  )

  return (
      !!challenge?.challenge_text?.trim() ||
      challenge?.completed_at != null ||
      !!recognition?.description?.trim() ||
      !!recognition
  )
  })

  const recognized = [1, 2, 3].filter((slot) => {
    const prepared = youthChallenges.some(
      (item) =>
        item.label_code === labelCode &&
        item.challenge_slot === slot &&
        item.completed_at !== null,
    )

    const recognition = activeEntries.some(
      (entry) =>
        entry.category === 'label' &&
        entry.label_code === labelCode &&
        entry.challenge_code === `Défi ${slot}`,
    )

    return prepared || recognition
  })

  return {
    defined: defined.length,
    recognized: recognized.length,
  }
}

  const orderedLabels = [...labels].sort((a, b) => a.sort_order - b.sort_order)
  let currentLabel = '—'
  let currentLabelDisplay = '—'

  for (const label of orderedLabels) {
    if (challengeProgress(label.code).recognized < 3) {
      currentLabel = label.code
      currentLabelDisplay = label.code
      break
    }
  }

  if (currentLabel === '—' && orderedLabels.length > 0) {
    currentLabel = orderedLabels[orderedLabels.length - 1].code
    currentLabelDisplay = `${currentLabel} · terminé`
  }

  const current = orderedLabels.find((label) => label.code === currentLabel)
  const currentChallenges = current
    ? challengeProgress(current.code)
    : { defined: 0, recognized: 0 }

  const markerItems: ProgressItem[] = markers
    .filter((marker) =>
      marker.active ||
      activeEntries.some((entry) => entry.category === 'marker' && entry.marker_code === marker.code),
    )
    .map((marker) => {
      const degrees = activeEntries
        .filter((entry) => entry.category === 'marker' && entry.marker_code === marker.code)
        .reduce((sum, entry) => sum + (entry.degrees ?? 0), 0)

      const percent = Math.min(100, Math.max(0, degrees / 360 * 100))

      const visual = getProgressStyle(marker.code)

      return {
        code: marker.code,
        status: degrees >= 360 ? 'completed' : degrees > 0 ? 'progress' : 'not-started',
        percent,
        color: visual.color,
        colibri: visual.colibri,
      }
    })

  const badgeItems: ProgressItem[] = badges
    .filter((badge) =>
      badge.active ||
      activeEntries.some((entry) => entry.category === 'badge' && entry.badge_code === badge.code),
    )
    .map((badge) => {
      const badgeEntries = activeEntries.filter(
        (entry) => entry.category === 'badge' && entry.badge_code === badge.code,
      )

      const visual = getProgressStyle(badge.code)

      // Brevets sans seuil d'heures : reconnaissance binaire.
      if (badge.required_hours == null) {
        return {
          color: visual.color,
          colibri: visual.colibri,
          code: badge.code,
          status: badgeEntries.length > 0 ? 'completed' : 'not-started',
          percent: badgeEntries.length > 0 ? 100 : 0,
        }
      }

      const progress = badgeProgress(badgeEntries, badge.code, badge.required_hours)
      const percent = Math.min(
        100,
        Math.max(0, progress.hours / badge.required_hours * 100),
      )

      return {
        color: visual.color,
        colibri: visual.colibri,
        code: badge.code,
        status: progress.obtained ? 'completed' : progress.hours > 0 ? 'progress' : 'not-started',
        percent,
      }
    })

  return {
    youth,
    currentLabel,
    currentLabelDisplay,
    recognizedChallenges: currentChallenges.recognized,
    definedChallenges: currentChallenges.defined,
    markers: markerItems,
    badges: badgeItems,
  }
}

function ProgressDots({ items, kind }: {
  items: ProgressItem[]
  kind: 'marker' | 'badge'
}) {
  if (items.length === 0) return <span className="overview-no-items">—</span>

  return (
    <div className="overview-dots" aria-label={kind === 'marker' ? 'Progression des Repères' : 'Progression des Brevets'}>
      {items.map((item) => {
        const label =
          item.status === 'completed' ? 'Complété' :
          item.status === 'progress' ? 'En cours' : 'Non débuté'

        const style = {
        '--progress': `${item.percent}%`,
        '--badge-color': item.color,
        } as CSSProperties

        const colibriClass = item.colibri ? ' overview-dot-colibri' : ''

        return (
          <span
            key={item.code}
            className={`overview-dot overview-dot-${item.status}${colibriClass}`}
            style={style}
            title={`${item.code} : ${label}`}
            role="img"
            aria-label={`${item.code} : ${label}`}
          >
            {item.status === 'completed' ? '✓' : ''}
          </span>
        )
      })}
    </div>
  )
}

export default function ProgressionOverview({
  youth,
  profile,
}: {
  youth: OverviewYouth[]
  profile: Profile
}) {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedYouthId, setSelectedYouthId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [patrolFilter, setPatrolFilter] = useState('')
  const [labelFilter, setLabelFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current
    setLoading(true)
    setError('')

    try {
      const result = await loadProgressionOverview()

      if (currentRequest !== requestId.current) return

      setData(result)
    } catch (cause) {
      if (currentRequest !== requestId.current) return

      setError(
        cause instanceof Error
          ? cause.message
          : 'Chargement de la progression collective impossible.',
      )
    } finally {
      if (currentRequest === requestId.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void load()

    return () => {
      requestId.current++
    }
  }, [load])

  const summaries = useMemo(() => {
    if (!data) return []

    return youth.map((item) =>
      summarizeYouth(
        item,
        data.entries,
        data.challenges,
        data.catalogs.labels,
        data.catalogs.markers,
        data.catalogs.badges,
      ),
    )
  }, [data, youth])

  const patrols = useMemo(
    () => [...new Set(youth.map((item) => item.patrol).filter((item) => item && item !== '—'))].sort(),
    [youth],
  )

  const filtered = useMemo(() => summaries.filter((item) => {
    if (statusFilter === 'active' && !item.youth.active) return false
    if (statusFilter === 'inactive' && item.youth.active) return false
    if (patrolFilter && item.youth.patrol !== patrolFilter) return false
    if (labelFilter && item.currentLabel !== labelFilter) return false

    const term = search.trim().toLocaleLowerCase('fr-CA')
    if (term && !item.youth.name.toLocaleLowerCase('fr-CA').includes(term)) return false

    return true
  }), [summaries, statusFilter, patrolFilter, labelFilter, search])

  const totals = useMemo(() => {
    const active = summaries.filter((item) => item.youth.active)

    return {
      youth: summaries.length,
      activeYouth: active.length,
      markersCompleted: active.reduce(
        (sum, item) => sum + item.markers.filter((marker) => marker.status === 'completed').length,
        0,
      ),
      markersInProgress: active.reduce(
        (sum, item) => sum + item.markers.filter((marker) => marker.status === 'progress').length,
        0,
      ),
      badgesCompleted: active.reduce(
        (sum, item) => sum + item.badges.filter((badge) => badge.status === 'completed').length,
        0,
      ),
      badgesInProgress: active.reduce(
        (sum, item) => sum + item.badges.filter((badge) => badge.status === 'progress').length,
        0,
      ),
    }
  }, [summaries])

  const selectedYouth = youth.find((item) => item.id === selectedYouthId)

  if (selectedYouth) {
    return (
      <section className="progression-overview">
        <div className="progression-overview-toolbar">
          <button
            type="button"
            className="secondary-button"
            onClick={() => setSelectedYouthId(null)}
          >
            ← Retour au tableau collectif
          </button>
          <strong>{selectedYouth.name}</strong>
        </div>
        <YouthProgression
          youthId={selectedYouth.id}
          profile={profile}
          onChanged={() => { void load() }}
        />
      </section>
    )
  }

  return (
    <section className="progression-overview" aria-label="Progression collective">
      <div className="progression-overview-toolbar">
        <div>
          <h2>Progression de l’unité</h2>
          <p>Vue collective des réalisations et des parcours individuels.</p>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? 'Actualisation…' : 'Actualiser'}
        </button>
      </div>

      {error && <div className="load-error" role="alert">{error}</div>}

      {loading && !data ? (
        <p className="progression-loading">Chargement de la progression collective…</p>
      ) : data && <>
        <div className="progression-overview-stats">
          <article>
            <strong>{totals.activeYouth}</strong>
            <span>Jeunes actifs</span>
          </article>
          <article>
            <strong>{totals.markersCompleted}</strong>
            <span>Repères complétés</span>
          </article>
          <article>
            <strong>{totals.markersInProgress}</strong>
            <span>Repères en cours</span>
          </article>
          <article>
            <strong>{totals.badgesCompleted}</strong>
            <span>Brevets complétés</span>
          </article>
          <article>
            <strong>{totals.badgesInProgress}</strong>
            <span>Brevets en cours</span>
          </article>
        </div>

        <div className="progression-overview-filters">
          <label>
            Rechercher un jeune
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nom du jeune"
            />
          </label>
          <label>
            Patrouille
            <select value={patrolFilter} onChange={(event) => setPatrolFilter(event.target.value)}>
              <option value="">Toutes les patrouilles</option>
              {patrols.map((patrol) => <option key={patrol} value={patrol}>{patrol}</option>)}
            </select>
          </label>
          <label>
            Label actuel
            <select value={labelFilter} onChange={(event) => setLabelFilter(event.target.value)}>
              <option value="">Tous les Labels</option>
              {data.catalogs.labels.map((label) => (
                <option key={label.code} value={label.code}>{label.code}</option>
              ))}
              <option value="—">Aucun</option>
            </select>
          </label>
          <label>
            Statut
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="active">Jeunes actifs</option>
              <option value="inactive">Jeunes inactifs</option>
              <option value="all">Tous les jeunes</option>
            </select>
          </label>
        </div>

        <div className="progression-overview-table-wrap">
          <table className="progression-overview-table">
            <thead>
              <tr>
                <th>Jeune</th>
                <th>Patrouille</th>
                <th>Label actuel</th>
                <th>Défis</th>
                <th>Repères</th>
                <th>Brevets</th>
                <th aria-label="Consulter" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                key={item.youth.id}
                className={`overview-youth-row${!item.youth.active ? ' inactive-row' : ''}`}
                onClick={() => setSelectedYouthId(item.youth.id)}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setSelectedYouthId(item.youth.id)
                    }
                }}
                tabIndex={0}
                aria-label={`Consulter la progression de ${item.youth.name}`}
                >
                  <td data-label="Jeune">
                    <strong>{item.youth.name}</strong>
                    {!item.youth.active && <span className="status-inactive">Inactif</span>}
                  </td>
                  <td data-label="Patrouille">{item.youth.patrol}</td>
                  <td data-label="Label actuel">{item.currentLabelDisplay}</td>
                  <td data-label="Défis">
                    <strong className="overview-challenge-count">
                      {item.recognizedChallenges}/{item.definedChallenges}
                    </strong>
                  </td>
                  <td data-label="Repères"><ProgressDots items={item.markers} kind="marker" /></td>
                  <td data-label="Brevets"><ProgressDots items={item.badges} kind="badge" /></td>
                  <td data-label="Consulter">
                    <button
                      type="button"
                      className="row-action"
                      onClick={() => setSelectedYouthId(item.youth.id)}
                      aria-label={`Consulter la progression de ${item.youth.name}`}
                    >
                      →
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7}>Aucun jeune ne correspond aux filtres.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="progression-overview-count">
          {filtered.length} jeune(s) affiché(s) sur {totals.youth}.
        </p>
      </>}
    </section>
  )
}

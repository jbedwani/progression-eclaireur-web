import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import type { Profile } from './types/profile'
import { supabase } from './lib/supabase'
import InvitationAdmin from './InvitationAdmin'
import AnimatorAssignmentAdmin from './AnimatorAssignmentAdmin'
import YouthProgression from './YouthProgression'
import MyRecord from './MyRecord'
import PatrolAssignments from './PatrolAssignments'
import UnitAdmin from './UnitAdmin'
import ProgressionOverview from './ProgressionOverview'

type Section = 'overview' | 'youth' | 'patrols' | 'progression' | 'admin' | 'my-record'
type UnitRecord = { id: string; name: string; active: boolean }
type PatrolRecord = { id: string; name: string; active: boolean; unit_id: string; unitName: string }
type YouthRecord = {
  id: string
  name: string
  active: boolean
  unit_id: string | null
  unitName: string
  patrol: string
  schoolYear: string
  scoutYears: number | null
  promiseDate: string | null
}
type MembershipRecord = { youth_id: string; patrol_id: string; school_year: string; post_name: string | null }

const navByRole: Record<Profile['role'], { id: Section; label: string; icon: string }[]> = {
  admin: [
    { id: 'overview', label: 'Tableau de bord', icon: '▦' },
    { id: 'youth', label: 'Jeunes', icon: '♧' },
    { id: 'patrols', label: 'Patrouilles', icon: '⚑' },
    { id: 'progression', label: 'Progression', icon: '↗' },
    { id: 'admin', label: 'Administration', icon: '⚙' },
  ],
  animator: [
    { id: 'overview', label: 'Tableau de bord', icon: '▦' },
    { id: 'youth', label: 'Jeunes', icon: '♧' },
    { id: 'patrols', label: 'Patrouilles', icon: '⚑' },
    { id: 'progression', label: 'Progression', icon: '↗' },
  ],
  guardian: [{ id: 'my-record', label: 'Dossier de mon jeune', icon: '♧' }],
  youth: [{ id: 'my-record', label: 'Mon dossier', icon: '♧' }],
}

const roleLabels: Record<Profile['role'], string> = {
  admin: 'Administrateur', animator: 'Animateur', guardian: 'Parent ou tuteur', youth: 'Éclaireur',
}

export default function Dashboard({ profile, email, onSignOut, signingOut }: {
  profile: Profile
  email: string
  onSignOut: () => void
  signingOut: boolean
}) {
  const navigation = navByRole[profile.role]
  const [section, setSection] = useState<Section>(navigation[0].id)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [selectedYouth, setSelectedYouth] = useState<YouthRecord | null>(null)
  const [units, setUnits] = useState<UnitRecord[]>([])
  const [youth, setYouth] = useState<YouthRecord[]>([])
  const [patrols, setPatrols] = useState<PatrolRecord[]>([])
  const [progressionCount, setProgressionCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [unitsRevision, setUnitsRevision] = useState(0)
  const requests = useRef(0)

  const loadData = useCallback(async () => {
    const request = ++requests.current
    setLoading(true)
    setLoadError('')

    try {
      const { data: yearResponse, error: yearError } = await supabase.functions.invoke<{
        school_year?: string
        error?: string
      }>('manage-patrols', { body: { action: 'current-year' } })

      if (yearError instanceof FunctionsHttpError) {
        const details = await yearError.context.json().catch(() => null)
        throw new Error(
          `Impossible de récupérer l’année scolaire courante. ${
            details?.details ?? details?.error ?? yearError.message
          }${details?.code ? ` (code: ${details.code})` : ''}`
        )
      }

      if (yearError) {
        throw new Error(`Impossible de récupérer l’année scolaire courante. ${yearError.message}`)
      }
      const schoolYear = yearResponse?.school_year

      if (yearResponse?.error || typeof schoolYear !== 'string' || !schoolYear) {
        throw new Error(yearResponse?.error ?? 'Année scolaire courante introuvable.')
      }

      if (request !== requests.current) return

      const [unitsResult, youthResult, patrolsResult, membershipsResult, progressionResult] = await Promise.all([
        supabase.from('units').select('id, name, active').order('name'),
        supabase.from('youth').select('id, display_name, legacy_name, active, unit_id, scout_years, promise_date').order('display_name'),
        supabase.from('patrols').select('id, name, active, unit_id').order('name'),
        supabase.from('patrol_memberships').select('youth_id, patrol_id, school_year, post_name').eq('school_year', schoolYear),
        supabase.from('progression_entries').select('id', { count: 'exact', head: true }).eq('active', true),
      ])

      if (request !== requests.current) return

      const firstError = unitsResult.error || youthResult.error || patrolsResult.error || membershipsResult.error
      if (firstError) {
        setLoadError(`Impossible de charger les données. ${firstError.message}`)
        return
      }

      const unitRows = (unitsResult.data ?? []) as UnitRecord[]
      const unitNames = new Map(unitRows.map((unit) => [unit.id, unit.name]))
      const patrolRows = (patrolsResult.data ?? []) as Omit<PatrolRecord, 'unitName'>[]
      const patrolNames = new Map(patrolRows.map((patrol) => [patrol.id, patrol.name]))
      const membershipRows = (membershipsResult.data ?? []) as MembershipRecord[]
      const currentMembership = new Map<string, MembershipRecord>()

      for (const membership of membershipRows) {
        if (!currentMembership.has(membership.youth_id)) {
          currentMembership.set(membership.youth_id, membership)
        }
      }
      const youthRows = (youthResult.data ?? []) as {
        id: string; display_name: string | null; legacy_name: string | null; active: boolean
        unit_id: string | null; scout_years: number | null; promise_date: string | null
      }[]

      setUnits(unitRows)
      setPatrols(patrolRows.map((patrol) => ({
        ...patrol,
        unitName: unitNames.get(patrol.unit_id) ?? 'Unité non précisée',
      })).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'fr')))

      setYouth(youthRows.map((record) => {
        const membership = currentMembership.get(record.id)
        const patrol = membership ? patrolNames.get(membership.patrol_id) : undefined
        return {
          id: record.id,
          name: record.display_name?.trim() || record.legacy_name?.trim() || 'Nom non renseigné',
          active: record.active,
          unit_id: record.unit_id,
          unitName: record.unit_id ? unitNames.get(record.unit_id) ?? 'Unité non précisée' : 'Sans unité',
          patrol: patrol ?? 'Non assigné',
          schoolYear: membership?.school_year ?? '—',
          scoutYears: record.scout_years,
          promiseDate: record.promise_date,
        }
      }).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'fr')))

      setProgressionCount(progressionResult.error ? null : progressionResult.count ?? 0)
    } catch (cause) {
      if (request === requests.current) {
        setLoadError(cause instanceof Error
          ? `Impossible de charger les données. ${cause.message}`
          : 'Impossible de charger les données.')
      }
    } finally {
      if (request === requests.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
    return () => { requests.current++ }
  }, [loadData])


  const filteredYouth = useMemo(() => youth.filter((record) =>
    (showInactive || record.active) && `${record.name} ${record.patrol} ${record.unitName}`.toLocaleLowerCase('fr').includes(search.toLocaleLowerCase('fr')),
  ), [youth, search, showInactive])
  const activeYouthCount = youth.filter((record) => record.active).length
  const inactiveYouthCount = youth.length - activeYouthCount
  const activePatrolCount = patrols.filter((record) => record.active).length
  const currentTitle = navigation.find((item) => item.id === section)?.label ?? 'Tableau de bord'

  function selectSection(next: Section) {
    setSection(next)
    setSelectedYouth(null)
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="brand-lockup"><div className="brand-mark">PE</div><div><strong>Progression</strong><span>Éclaireur · 266e</span></div></div>
        <div className="sidebar-unit"><span className="sidebar-kicker">GROUPE SCOUT</span><strong>266e Pointe-de-l’Île</strong><span>Unité Éclaireur</span></div>
        <nav className="main-nav" aria-label="Navigation principale">
          {navigation.map((item) => <button key={item.id} type="button" className={section === item.id ? 'nav-item active' : 'nav-item'} onClick={() => selectSection(item.id)}><span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}</button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="profile-chip"><div className="avatar">{(profile.display_name || email || 'U').slice(0, 1).toUpperCase()}</div><div className="profile-chip-text"><strong>{profile.display_name || 'Utilisateur'}</strong><span>{roleLabels[profile.role]}</span></div></div>
          <button className="signout-button" type="button" onClick={onSignOut} disabled={signingOut}>{signingOut ? 'Déconnexion…' : '↪  Se déconnecter'}</button>
        </div>
      </aside>

      <main className="app-main">
          <header className="topbar"><div className="breadcrumb">Éclaireur <span>/</span> {currentTitle}</div><div className="topbar-right"><span className="season-pill">Saison 2026–2027</span></div></header>        <div className="page-content">
          <div className="page-heading"><div><p className="page-eyebrow">266e GROUPE SCOUT · POINTE-DE-L’ÎLE</p><h1>{selectedYouth ? selectedYouth.name : section === 'overview' ? 'Bonjour et bienvenue !' : currentTitle}</h1><p className="page-subtitle">{selectedYouth ? `${selectedYouth.patrol} · ${selectedYouth.unitName}` : section === 'overview' ? 'Aperçu des données actuellement accessibles.' : section === 'admin' ? 'Gestion des accès et des responsabilités.' : 'Suivi des jeunes et de leur parcours scout.'}</p></div>{section === 'youth' && <button className="primary-action" type="button" onClick={() => { setSearch(''); setShowInactive(false) }}>Réinitialiser les filtres</button>}</div>

          <div className="data-status"><span>SUPABASE</span><p>Les listes de jeunes, de patrouilles et les indicateurs ci-dessous proviennent de la base de données. Les données affichées respectent les autorisations du compte connecté.</p><button type="button" onClick={() => void loadData()} disabled={loading}>{loading ? 'Actualisation…' : 'Actualiser'}</button></div>
          {loadError && <div className="load-error" role="alert"><strong>Chargement interrompu</strong><p>{loadError}</p><button type="button" onClick={() => void loadData()}>Réessayer</button></div>}

          {section === 'overview' && (
            <>
              <section className="stat-grid">
                <article className="stat-card"><div className="stat-icon green">♧</div><span>Jeunes actifs</span><strong>{loading ? '…' : activeYouthCount}</strong><small>Dans les unités accessibles</small></article>
                <article className="stat-card"><div className="stat-icon gold">♧</div><span>Jeunes archivés</span><strong>{loading ? '…' : inactiveYouthCount}</strong><small>Historique conservé</small></article>
                <article className="stat-card"><div className="stat-icon blue">⚑</div><span>Patrouilles actives</span><strong>{loading ? '…' : activePatrolCount}</strong><small>Dans les unités accessibles</small></article>
                <article className="stat-card"><div className="stat-icon purple">✦</div><span>Entrées de progression</span><strong>{loading || progressionCount === null ? '—' : progressionCount}</strong><small>Entrées actives accessibles</small></article>
              </section>
              <section className="content-grid">
                <article className="panel panel-wide"><div className="panel-heading"><div><h2>Jeunes récemment importés</h2><p>Premiers dossiers de la liste accessible</p></div><button className="text-action" onClick={() => selectSection('youth')}>Tous les jeunes →</button></div>{loading ? <div className="empty-table">Chargement des jeunes…</div> : <YouthTable youth={youth.filter((record) => record.active).slice(0, 5)} onSelect={(record) => { setSelectedYouth(record); setSection('youth') }} />}</article>
                <article className="panel"><div className="panel-heading"><div><h2>Accès rapides</h2><p>Les outils de l’unité</p></div></div><div className="quick-links"><button onClick={() => selectSection('youth')}><span>♧</span><div><strong>Consulter les jeunes</strong><small>Liste et dossiers individuels</small></div><b>→</b></button><button onClick={() => selectSection('patrols')}><span>⚑</span><div><strong>Voir les patrouilles</strong><small>Patrouilles actives et archivées</small></div><b>→</b></button><button onClick={() => selectSection('progression')}><span>↗</span><div><strong>Suivre la progression</strong><small>Labels, repères et brevets</small></div><b>→</b></button></div></article>
              </section>
            </>
          )}

          {section === 'youth' && !selectedYouth && <section className="panel">
            {profile.role === 'admin' && <YouthCreateForm units={units.filter((unit) => unit.active)} loading={loading} onCreated={loadData} />}
            <div className="list-toolbar"><div><h2>Jeunes</h2><p>Les anciens jeunes restent consultables dans l’historique.</p></div><label className="search-box"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un jeune, une patrouille ou une unité…" /></label></div><label className="inactive-toggle"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} /> Afficher les anciens jeunes</label>{loading ? <div className="empty-table">Chargement des jeunes…</div> : <YouthTable youth={filteredYouth} onSelect={setSelectedYouth} />}</section>}

          {section === 'youth' && selectedYouth && (
            <section className="panel youth-detail">
              <button className="back-link" onClick={() => setSelectedYouth(null)}>← Retour à la liste</button>
              <div className="detail-header">
                <div className="large-avatar">{selectedYouth.name.slice(0, 1)}</div>
                <div><h2>{selectedYouth.name}</h2><p>{selectedYouth.patrol} · {selectedYouth.unitName}</p></div>
                <span className={selectedYouth.active ? 'status-active' : 'status-inactive'}>{selectedYouth.active ? 'Actif' : 'Ancien jeune'}</span>
              </div>
              {profile.role === 'admin' && <>
                <YouthEditForm youth={selectedYouth} units={units} onSaved={async () => { await loadData(); setSelectedYouth(null) }} />
                <YouthManagementActions youth={selectedYouth} onUpdated={loadData} onDone={() => setSelectedYouth(null)} />
              </>}
              <div className="detail-stats">
                <div><span>Années scoutes</span><strong>{selectedYouth.scoutYears ?? '—'}</strong></div>
                <div><span>Date de promesse</span><strong>{selectedYouth.promiseDate ? new Date(`${selectedYouth.promiseDate}T00:00:00`).toLocaleDateString('fr-CA') : '—'}</strong></div>
                <div><span>Affectation courante</span><strong>{selectedYouth.schoolYear}</strong></div>
              </div>
              <div className="progression-detail-heading"><h3>Parcours individuel</h3><p>Historique des réalisations et des entrées de progression.</p></div>
              <YouthProgression key={selectedYouth.id} youthId={selectedYouth.id} profile={profile} onChanged={() => void loadData()} />
            </section>
          )}

          {section === 'patrols' && (
            <section className="panel">
              {profile.role === 'admin' && <>
                <PatrolCreateForm units={units.filter((unit) => unit.active)} loading={loading} onCreated={loadData} />
                <PatrolAssignments
                  youth={youth.filter((record) => record.unit_id).map((record) => ({ id: record.id, name: record.name, unit_id: record.unit_id, unitName: record.unitName, active: record.active }))}
                  patrols={patrols.map((record) => ({ id: record.id, name: record.name, unit_id: record.unit_id, unitName: record.unitName, active: record.active }))}
                  onChanged={loadData}
                />
              </>}
              <div className="panel-heading"><div><h2>Patrouilles</h2><p>Patrouilles actives en premier; les patrouilles inactives restent consultables.</p></div></div>
              {loading ? <div className="empty-table">Chargement des patrouilles…</div> : patrols.length === 0 ? <div className="empty-table">Aucune patrouille accessible pour ce compte.</div> : (
                <div className="patrol-grid">
                  {patrols.map((patrol) => <article className={`panel patrol-card${patrol.active ? '' : ' patrol-inactive'}`} key={patrol.id}><div className="patrol-symbol">⚑</div><div><h2>{patrol.name}</h2><p>{patrol.unitName}</p>{profile.role === 'admin' && <PatrolManagementActions patrol={patrol} onUpdated={loadData} />}</div><span className={patrol.active ? 'status-active' : 'status-inactive'}>{patrol.active ? 'Active' : 'Inactive'}</span></article>)}
                </div>
              )}
            </section>
          )}

          {section === 'progression' && (
            <ProgressionOverview
              youth={youth}
              profile={profile}
            />
          )}

          {section === 'my-record' && <MyRecord profile={profile} />}

          {section === 'admin' && profile.role === 'admin' && (
            <div className="admin-layout">
              <section className="panel admin-intro">
                <h2>Administration de l’application</h2>
                <p>Les modules ci-dessous sont déjà connectés à Supabase. Les modifications qu’ils effectuent sont réelles.</p>
              </section>
              <UnitAdmin
                onUnitsChanged={async () => {
                  await loadData()
                  setUnitsRevision((value) => value + 1)
                }}
              />
              <InvitationAdmin
                youth={youth
                  .filter((record) => record.active)
                  .map((record) => ({ id: record.id, name: record.name }))}
              />
              <AnimatorAssignmentAdmin refreshKey={unitsRevision} />
            </div>
          )}
          <footer className="app-footer">Progression Éclaireur <span>·</span> 266e Pointe-de-l’Île <span>·</span> Données Supabase</footer>
        </div>
      </main>
    </div>
  )
}

type YouthCreateResponse = {
  youth?: { id: string }
  error?: string
}

type YouthManageAction = 'archive' | 'restore' | 'delete'
type YouthManageResponse = {
  youth?: { id: string; active: boolean }
  deleted?: boolean
  error?: string
}

function YouthEditForm({ youth, units, onSaved }: {
  youth: YouthRecord
  units: UnitRecord[]
  onSaved: () => Promise<void>
}) {
  const [displayName, setDisplayName] = useState(youth.name)
  const [unitId, setUnitId] = useState(youth.unit_id ?? '')
  const [scoutYears, setScoutYears] = useState(youth.scoutYears?.toString() ?? '')
  const [promiseDate, setPromiseDate] = useState(youth.promiseDate ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const { data, error: requestError } = await supabase.functions.invoke<{ youth?: { id: string }; error?: string }>('manage-youth', {
        body: {
          action: 'update',
          youth_id: youth.id,
          display_name: displayName.trim(),
          unit_id: unitId,
          scout_years: scoutYears === '' ? null : Number(scoutYears),
          promise_date: promiseDate || null,
        },
      })
      if (requestError) {
        if (requestError instanceof FunctionsHttpError) {
          const details = await requestError.context.json().catch(() => null)
          throw new Error(typeof details?.error === 'string' ? details.error : requestError.message)
        }
        throw new Error(requestError.message)
      }
      if (data?.error) throw new Error(data.error)
      if (!data?.youth?.id) throw new Error('La modification du dossier n’a pas été confirmée.')
      setMessage('Dossier mis à jour.')
      await onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Modification du dossier impossible.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="youth-create-panel">
      <div><h2>Modifier le dossier</h2><p>Ces renseignements ne modifient pas les affectations historiques.</p></div>
      <form className="youth-create-form" onSubmit={(event) => void handleSubmit(event)}>
        <label>Nom affiché<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={100} required disabled={saving} /></label>
        <label>
          Unité
          <select
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
            required
            disabled={saving}
          >
            <option value="">Sélectionner une unité</option>
            {units
              .filter((unit) => unit.active || unit.id === youth.unit_id)
              .map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}{unit.active ? '' : ' (inactive)'}
                </option>
              ))}
          </select>
        </label>
        <label>Années scoutes<input type="number" min="0" step="1" value={scoutYears} onChange={(event) => setScoutYears(event.target.value)} disabled={saving} /></label>
        <label>Date de promesse<input type="date" value={promiseDate} onChange={(event) => setPromiseDate(event.target.value)} disabled={saving} /></label>
        <button type="submit" disabled={saving || !displayName.trim() || !unitId}>{saving ? 'Enregistrement…' : 'Enregistrer les modifications'}</button>
      </form>
      {error && <p className="youth-create-error" role="alert">{error}</p>}
      {message && <p className="youth-create-message" role="status">{message}</p>}
    </div>
  )
}

function PatrolManagementActions({ patrol, onUpdated }: {
  patrol: PatrolRecord
  onUpdated: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(patrol.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function submit(action: 'rename' | 'restore' | 'archive' | 'replace', replacementName?: string) {
    if (saving) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const { data, error: requestError } = await supabase.functions.invoke<{ patrol?: { id: string }; result?: { patrol?: { id: string }; transferred_count?: number }; error?: string }>('manage-patrols', {
        body: { action, patrol_id: patrol.id, name: (replacementName ?? name).trim() },
      })
      if (requestError) {
        if (requestError instanceof FunctionsHttpError) {
          const details = await requestError.context.json().catch(() => null)
          throw new Error(typeof details?.error === 'string' ? details.error : requestError.message)
        }
        throw new Error(requestError.message)
      }
      if (data?.error) throw new Error(data.error)
      if (!(data?.patrol?.id || data?.result?.patrol?.id)) throw new Error('La modification de la patrouille n’a pas été confirmée.')
      if (action === 'replace') setMessage(`Nouvelle patrouille créée; ${data?.result?.transferred_count ?? 0} affectation(s) transférée(s).`)
      setEditing(false)
      await onUpdated()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Modification de la patrouille impossible.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="youth-management-actions">
    {patrol.active ? <>
      {!editing ? <>
        <button type="button" onClick={() => { setName(patrol.name); setEditing(true) }}>Renommer</button>
        <button type="button" onClick={() => {
          const replacementName = window.prompt(`Nom de la nouvelle patrouille qui remplacera « ${patrol.name} » :`)
          if (replacementName?.trim() && window.confirm(`Créer « ${replacementName.trim()} », transférer tous les jeunes de ${patrol.name} pour l’année courante et archiver l’ancienne patrouille ?`)) void submit('replace', replacementName)
        }} disabled={saving}>Remplacer + transférer</button>
        <button type="button" onClick={() => {
          if (window.confirm(`Archiver la patrouille « ${patrol.name} » ? Les jeunes actifs affectés pour l’année en cours doivent d’abord être transférés.`)) void submit('archive')
        }} disabled={saving}>Archiver</button>
      </> : <>
        <input aria-label="Nouveau nom de patrouille" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} disabled={saving} />
        <button type="button" onClick={() => void submit('rename')} disabled={saving || !name.trim()}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        <button type="button" onClick={() => setEditing(false)} disabled={saving}>Annuler</button>
      </>}
    </> : <button type="button" onClick={() => void submit('restore')} disabled={saving}>{saving ? 'Réactivation…' : 'Réactiver'}</button>}
    {error && <p className="youth-create-error" role="alert">{error}</p>}
    {message && <p className="youth-create-message" role="status">{message}</p>}
  </div>
}

function YouthCreateForm({ units, loading, onCreated }: {
  units: UnitRecord[]
  loading: boolean
  onCreated: () => Promise<void>
}) {
  const [displayName, setDisplayName] = useState('')
  const [unitId, setUnitId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setError('')
    setMessage('')
    setSaving(true)

    try {
      const { data, error: requestError } =
        await supabase.functions.invoke<YouthCreateResponse>('manage-youth', {
          body: {
            action: 'create',
            display_name: displayName.trim(),
            unit_id: unitId,
          },
        })

      if (requestError) {
        if (requestError instanceof FunctionsHttpError) {
          const details = await requestError.context.json().catch(() => null)
          throw new Error(
            typeof details?.error === 'string'
              ? details.error
              : `Erreur serveur : ${requestError.message}`,
          )
        }
        throw new Error(requestError.message)
      }

      if (data?.error) throw new Error(data.error)
      if (!data?.youth?.id) {
        throw new Error('Le dossier créé n’a pas été retourné.')
      }

      setDisplayName('')
      setMessage('Dossier jeune créé. L’invitation au compte reste une étape séparée.')
      await onCreated()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Création du dossier impossible.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="youth-create-panel">
      <div>
        <h2>Créer un dossier jeune</h2>
        <p>La création du dossier ne crée pas de compte et n’envoie pas d’invitation.</p>
      </div>
      {loading ? (
        <p className="youth-create-message" role="status">Chargement des unités…</p>
      ) : units.length === 0 ? (
        <p className="youth-create-error" role="alert">Aucune unité active n’est disponible pour créer un dossier.</p>
      ) : (
        <form className="youth-create-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Nom affiché
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={100}
              required
            />
          </label>
          <label>
            Unité
            <select value={unitId} onChange={(event) => setUnitId(event.target.value)} required>
              <option value="">Sélectionner une unité</option>
              {units.map((unit) => <option value={unit.id} key={unit.id}>{unit.name}</option>)}
            </select>
          </label>
          <button type="submit" disabled={saving || !unitId}>
            {saving ? 'Création…' : 'Créer le dossier'}
          </button>
        </form>
      )}
      {error && <p className="youth-create-error" role="alert">{error}</p>}
      {message && <p className="youth-create-message" role="status">{message}</p>}
    </div>
  )
}

function PatrolCreateForm({ units, loading, onCreated }: {
  units: UnitRecord[]
  loading: boolean
  onCreated: () => Promise<void>
}) {
  const [name, setName] = useState('')
  const [unitId, setUnitId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setError('')
    setMessage('')
    setSaving(true)

    try {
      const { data, error: requestError } =
        await supabase.functions.invoke<{ patrol?: { id: string }; error?: string }>('manage-patrols', {
          body: { action: 'create', name: name.trim(), unit_id: unitId },
        })

      if (requestError) {
        if (requestError instanceof FunctionsHttpError) {
          const details = await requestError.context.json().catch(() => null)
          throw new Error(
            typeof details?.error === 'string'
              ? details.error
              : `Erreur serveur : ${requestError.message}`,
          )
        }
        throw new Error(requestError.message)
      }

      if (data?.error) throw new Error(data.error)
      if (!data?.patrol?.id) {
        throw new Error('La patrouille créée n’a pas été retournée.')
      }

      setName('')
      setMessage('Patrouille créée. L’affectation des jeunes reste une étape séparée.')
      await onCreated()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Création de la patrouille impossible.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="youth-create-panel">
      <div>
        <h2>Créer une patrouille</h2>
        <p>La patrouille est créée active, sans affectation automatique de jeunes.</p>
      </div>
      {loading ? (
        <p className="youth-create-message" role="status">Chargement des unités…</p>
      ) : units.length === 0 ? (
        <p className="youth-create-error" role="alert">Aucune unité active n’est disponible pour créer une patrouille.</p>
      ) : (
        <form className="youth-create-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            Nom de la patrouille
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required disabled={saving} />
          </label>
          <label>
            Unité
            <select value={unitId} onChange={(event) => setUnitId(event.target.value)} required disabled={saving}>
              <option value="">Sélectionner une unité</option>
              {units.map((unit) => <option value={unit.id} key={unit.id}>{unit.name}</option>)}
            </select>
          </label>
          <button type="submit" disabled={saving || !unitId || !name.trim()}>
            {saving ? 'Création…' : 'Créer la patrouille'}
          </button>
        </form>
      )}
      {error && <p className="youth-create-error" role="alert">{error}</p>}
      {message && <p className="youth-create-message" role="status">{message}</p>}
    </div>
  )
}

function YouthManagementActions({ youth, onUpdated, onDone }: {
  youth: YouthRecord
  onUpdated: () => Promise<void>
  onDone: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function manageYouth(action: YouthManageAction) {
    if (action === 'delete' && !window.confirm(
      `Supprimer définitivement le dossier de ${youth.name} ? Cette action est possible uniquement si aucune donnée historique ou association n’existe.`,
    )) return

    setSaving(true)
    setError('')

    try {
      const { data, error: requestError } =
        await supabase.functions.invoke<YouthManageResponse>('manage-youth', {
          body: { action, youth_id: youth.id },
        })

      if (requestError) {
        if (requestError instanceof FunctionsHttpError) {
          const details = await requestError.context.json().catch(() => null)
          throw new Error(
            typeof details?.error === 'string'
              ? details.error
              : `Erreur serveur : ${requestError.message}`,
          )
        }
        throw new Error(requestError.message)
      }

      if (data?.error) throw new Error(data.error)
      if (action === 'delete' ? data?.deleted !== true : !data?.youth?.id) {
        throw new Error('La mise à jour du dossier n’a pas été confirmée.')
      }

      await onUpdated()
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Mise à jour du dossier impossible.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="youth-management-actions">
      <button type="button" onClick={() => void manageYouth(youth.active ? 'archive' : 'restore')} disabled={saving}>
        {saving ? 'Mise à jour…' : youth.active ? 'Archiver le dossier' : 'Réactiver le dossier'}
      </button>
      <button className="danger-action" type="button" onClick={() => void manageYouth('delete')} disabled={saving}>
        Supprimer définitivement
      </button>
      {error && <p className="youth-create-error" role="alert">{error}</p>}
    </div>
  )
}

function YouthTable({ youth, onSelect }: { youth: YouthRecord[]; onSelect: (youth: YouthRecord) => void }) {
  if (youth.length === 0) return <div className="empty-table">Aucun jeune ne correspond à la recherche.</div>

  return (
    <div className="table-scroll">
      <table className="youth-table">
        <thead>
          <tr>
            <th>Jeune</th>
            <th>Patrouille</th>
            <th>Unité</th>
            <th>Années scoutes</th>
            <th>Statut</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {youth.map((item) => (
            <tr key={item.id} className={!item.active ? 'inactive-row' : ''}>
              <td data-label="Jeune"><strong>{item.name}</strong></td>
              <td data-label="Patrouille">{item.patrol}</td>
              <td data-label="Unité">{item.unitName}</td>
              <td data-label="Années scoutes">{item.scoutYears ?? '—'}</td>
              <td data-label="Statut">
                <span className={item.active ? 'status-active' : 'status-inactive'}>
                  {item.active ? 'Actif' : 'Inactif'}
                </span>
              </td>
              <td data-label="Consulter">
                <button className="row-action" onClick={() => onSelect(item)} aria-label={`Consulter ${item.name}`}>→</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
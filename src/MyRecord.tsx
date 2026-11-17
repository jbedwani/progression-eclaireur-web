import { useEffect, useState } from 'react'
import type { Profile } from './types/profile'
import { supabase } from './lib/supabase'
import YouthProgression from './YouthProgression'

type AssociationRow = { youth_id: string }
type YouthRow = {
  id: string
  display_name: string | null
  active: boolean
  unit_id: string | null
  scout_years: number | null
  promise_date: string | null
}
type UnitRow = { id: string; name: string }
type MembershipRow = {
  youth_id: string
  patrol_id: string
  school_year: string
  post_name: string | null
}
type PatrolRow = { id: string; name: string }
type YouthDossier = YouthRow & {
  unitName: string
  memberships: Array<MembershipRow & { patrolName: string }>
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-CA')
}

function getErrorMessage(error: { message: string }) {
  return error.message
}

export default function MyRecord({ profile }: { profile: Profile }) {
  const [dossiers, setDossiers] = useState<YouthDossier[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      if (profile.role !== 'guardian' && profile.role !== 'youth') {
        setDossiers([])
        setError('Cette page est réservée aux parents et aux jeunes.')
        setLoading(false)
        return
      }

      const { data: associations, error: associationError } = await supabase
        .from('guardian_youth')
        .select('youth_id')
        .eq('user_id', profile.id)
        .eq('relationship', profile.role)
        .eq('active', true)

      if (cancelled) return
      if (associationError) {
        setError(`Impossible de vérifier les dossiers associés. ${getErrorMessage(associationError)}`)
        setDossiers([])
        setLoading(false)
        return
      }

      const youthIds = [...new Set(((associations ?? []) as AssociationRow[]).map((row) => row.youth_id))]
      if (youthIds.length === 0) {
        setDossiers([])
        setLoading(false)
        return
      }

      const { data: youthData, error: youthError } = await supabase
        .from('youth')
        .select('id, display_name, active, unit_id, scout_years, promise_date')
        .in('id', youthIds)
        .order('display_name')

      if (cancelled) return
      if (youthError) {
        setError(`Impossible de charger les renseignements des jeunes. ${getErrorMessage(youthError)}`)
        setDossiers([])
        setLoading(false)
        return
      }

      const youthRows = (youthData ?? []) as YouthRow[]
      if (youthRows.length === 0) {
        setDossiers([])
        setLoading(false)
        return
      }

      const visibleYouthIds = youthRows.map((row) => row.id)
      const unitIds = [...new Set(youthRows.flatMap((row) => row.unit_id ? [row.unit_id] : []))]
      const [unitsResult, membershipsResult] = await Promise.all([
        unitIds.length
          ? supabase.from('units').select('id, name').in('id', unitIds)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from('patrol_memberships')
          .select('youth_id, patrol_id, school_year, post_name')
          .in('youth_id', visibleYouthIds)
          .order('school_year', { ascending: false }),
      ])

      if (cancelled) return
      const supplementaryError = unitsResult.error
        ? `Impossible de charger les unités. ${getErrorMessage(unitsResult.error)}`
        : membershipsResult.error
          ? `Impossible de charger les affectations aux patrouilles. ${getErrorMessage(membershipsResult.error)}`
          : ''
      if (supplementaryError) {
        setError(supplementaryError)
        setDossiers([])
        setLoading(false)
        return
      }

      const membershipRows = (membershipsResult.data ?? []) as MembershipRow[]
      const patrolIds = [...new Set(membershipRows.map((row) => row.patrol_id))]
      const { data: patrolData, error: patrolError } = patrolIds.length
        ? await supabase.from('patrols').select('id, name').in('id', patrolIds)
        : { data: [], error: null }

      if (cancelled) return
      if (patrolError) {
        setError(`Impossible de charger les noms des patrouilles. ${getErrorMessage(patrolError)}`)
        setDossiers([])
        setLoading(false)
        return
      }

      const unitNames = new Map(((unitsResult.data ?? []) as UnitRow[]).map((unit) => [unit.id, unit.name]))
      const patrolNames = new Map(((patrolData ?? []) as PatrolRow[]).map((patrol) => [patrol.id, patrol.name]))

      setDossiers(youthRows.map((youth) => ({
        ...youth,
        unitName: youth.unit_id
          ? unitNames.get(youth.unit_id) ?? 'Unité non accessible'
          : 'Unité non précisée',
        memberships: membershipRows
          .filter((membership) => membership.youth_id === youth.id)
          .map((membership) => ({
            ...membership,
            patrolName: patrolNames.get(membership.patrol_id) ?? 'Patrouille non accessible',
          })),
      })))
      setLoading(false)
    }

    void load()
    return () => { cancelled = true }
  }, [profile.id, profile.role])

  if (loading) return <div className="my-record-loading">Chargement de votre dossier…</div>
  if (error) {
    return <div className="load-error" role="alert">
      <strong>Dossier indisponible</strong>
      <p>{error}</p>
    </div>
  }
  if (dossiers.length === 0) {
    return <section className="panel my-record-empty">
      <div className="empty-state">
        <span aria-hidden="true">♧</span>
        <h2>Aucun dossier accessible</h2>
        <p>Aucun jeune n’est associé à ce compte pour le moment. Contactez un responsable si vous pensez qu’il s’agit d’une erreur.</p>
      </div>
    </section>
  }

  return (
    <div className="my-record-list">
      {dossiers.map((dossier) => {
        const youthName = dossier.display_name?.trim() || 'Nom non renseigné'
        return (
          <section className="panel my-record-card" key={dossier.id}>
            <header className="my-record-header">
              <div className="large-avatar" aria-hidden="true">{youthName.slice(0, 1)}</div>
              <div className="my-record-heading">
                <h2>{youthName}</h2>
                <p>{dossier.unitName}</p>
              </div>
              <span className={dossier.active ? 'status-active' : 'status-inactive'}>
                {dossier.active ? 'Actif' : 'Inactif'}
              </span>
            </header>

            <section className="my-record-section" aria-label={`Renseignements de ${youthName}`}>
              <h3>Renseignements généraux</h3>
              <dl className="my-record-facts">
                <div><dt>Unité</dt><dd>{dossier.unitName}</dd></div>
                <div><dt>Années de scoutisme</dt><dd>{dossier.scout_years ?? '—'}</dd></div>
                <div><dt>Date de promesse</dt><dd>{formatDate(dossier.promise_date)}</dd></div>
              </dl>
            </section>

            <section className="my-record-section" aria-label={`Affectations de ${youthName}`}>
              <h3>Affectations aux patrouilles</h3>
              {dossier.memberships.length === 0
                ? <p className="my-record-muted">Aucune affectation accessible.</p>
                : <ul className="my-record-memberships">
                  {dossier.memberships.map((membership, index) => (
                    <li key={`${membership.patrol_id}-${membership.school_year}`}>
                      <strong>{membership.patrolName}</strong>
                      <span>{index === 0 ? 'Affectation la plus récente' : 'Historique'} · {membership.school_year}</span>
                      {membership.post_name && <small>{membership.post_name}</small>}
                    </li>
                  ))}
                </ul>}
            </section>

            <div className="progression-detail-heading">
              <h3>Parcours individuel</h3>
              <p>Historique des Labels, repères et brevets.</p>
            </div>
            <YouthProgression key={dossier.id} youthId={dossier.id} profile={profile} />
          </section>
        )
      })}
    </div>
  )
}

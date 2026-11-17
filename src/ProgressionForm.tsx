import { useRef, useState, type FormEvent } from 'react'
import {
  montrealToday, positiveInteger, progressionDate,
  type ProgressionCategory, type ProgressionEntry, type ProgressionInput,
  type ProgressionOptions, type YouthChallenge,
} from './lib/progression'

export default function ProgressionForm({ options, currentUserId, entry, challenge, onSave, onCancel }: {
  options: ProgressionOptions
  currentUserId: string
  entry?: ProgressionEntry
  challenge?: YouthChallenge
  onSave: (input: ProgressionInput) => Promise<void>
  onCancel: () => void
}) {
  const [id] = useState(() => entry?.id ?? crypto.randomUUID())
  const [category, setCategory] = useState<ProgressionCategory>(
    challenge || entry?.category === 'label' ? 'label' : entry?.category === 'badge' ? 'badge' : 'marker',
  )
  const [code, setCode] = useState(challenge?.label_code ??
    (entry?.category === 'label' ? entry.label_code : entry?.category === 'marker' ? entry.marker_code : entry?.badge_code) ?? '')
  const [degrees, setDegrees] = useState(entry?.degrees?.toString() ?? '')
  const [hours, setHours] = useState(entry?.hours?.toString() ?? '')
  const [date, setDate] = useState(entry ? progressionDate(entry.occurred_at) : montrealToday())
  const [responsibleId, setResponsibleId] = useState(entry?.responsible ? '' :
    options.responsibles.some((person) => person.id === currentUserId) ? currentUserId : '')
  const [description, setDescription] = useState(entry?.description ?? '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submitting = useRef(false)
  const choices = category === 'marker' ? options.markers : options.badges
  const badge = options.badges.find((item) => item.code === code)
  const needsHours = category === 'badge' && badge?.required_hours != null
  const labelMode = category === 'label'
  const missingHistoricalDegrees = entry?.category === 'marker' && entry.marker_code === code && entry.degrees === null
  const sameHistoricalBadge = entry?.category === 'badge' && entry.badge_code === code
  const missingHistoricalHours = sameHistoricalBadge && entry.hours === null
  const historicalHours = sameHistoricalBadge && !needsHours ? entry.hours : null

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setSaving(true)
    setError('')
    try {
      if (!date || !code || (!responsibleId && !entry?.responsible)) {
        throw new Error('Choisissez un élément, une date et un responsable.')
      }
      await onSave({
        id, revision: entry?.revision ?? null, category, code, date,
        degrees: category === 'marker' ?
          degrees === '' && missingHistoricalDegrees ? null : positiveInteger(degrees) : null,
        hours: needsHours ?
          hours === '' && missingHistoricalHours ? null : positiveInteger(hours) : historicalHours,
        responsibleId: responsibleId || null,
        description: labelMode ? entry?.description ?? null : description.trim() || null,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enregistrement impossible.')
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  return (
    <form className="progression-form" onSubmit={(event) => void submit(event)} aria-label={challenge ? 'Reconnaître le défi' : entry ? 'Modifier la progression' : 'Ajouter une progression'}>
      <h4>{challenge ? `Reconnaître ${challenge.label_code} — Défi ${challenge.challenge_slot}` :
        entry ? 'Modifier la réalisation' : 'Ajouter une progression'}</h4>
      <fieldset disabled={saving}>
        {labelMode ? <p>{challenge?.challenge_text ?? entry?.description ?? entry?.challenge_code}</p> : <>
          <label>Catégorie
            <select value={category} disabled={!!entry} onChange={(event) => {
              setCategory(event.target.value === 'badge' ? 'badge' : 'marker')
              setCode(''); setDegrees(''); setHours('')
            }}>
              <option value="marker">Repère</option>
              <option value="badge">Brevet</option>
            </select>
          </label>
          <label>{category === 'marker' ? 'Repère' : 'Brevet'}
            <select value={code} required onChange={(event) => { setCode(event.target.value); setHours('') }}>
              <option value="">Choisir…</option>
              {choices.filter((item) => item.active || item.code === code).map((item) =>
                <option key={item.code} value={item.code}>{item.display_name}{!item.active ? ' (inactif)' : ''}</option>)}
            </select>
          </label>
          {category === 'marker' && <label>Degrés
            <input type="number" min="1" step="1" required={!missingHistoricalDegrees} value={degrees} onChange={(event) => setDegrees(event.target.value)} />
            {missingHistoricalDegrees && <small>Valeur historique inconnue : peut rester vide.</small>}
          </label>}
          {needsHours && <label>Heures de cette activité
            <input type="number" min="1" step="1" required={!missingHistoricalHours} value={hours} onChange={(event) => setHours(event.target.value)} />
            <small>Seuil : {badge.required_hours} h, cumul propre à ce brevet.</small>
            {missingHistoricalHours && <small>Valeur historique inconnue : peut rester vide.</small>}
          </label>}
          {historicalHours != null && <p>Heures historiques : {historicalHours} h, conservées lors de cette correction.</p>}
        </>}
        <label>Date de reconnaissance
          <input type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>Responsable
          <select required={!entry?.responsible} value={responsibleId} onChange={(event) => setResponsibleId(event.target.value)}>
            <option value="">{entry?.responsible ? `Conserver : ${entry.responsible}` : 'Choisir un animateur…'}</option>
            {options.responsibles.map((person) =>
              <option key={person.id} value={person.id} disabled={!person.display_name?.trim()}>
                {person.display_name?.trim() || 'Animateur sans nom renseigné'}
              </option>)}
          </select>
        </label>
        {!labelMode && <label>Description
          <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
        </label>}
      </fieldset>
      {error && <p className="youth-create-error" role="alert">{error}</p>}
      <div className="progression-actions">
        <button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : challenge ? 'Marquer comme réalisé' : 'Enregistrer'}</button>
        <button type="button" className="secondary-button" disabled={saving} onClick={onCancel}>Annuler</button>
      </div>
    </form>
  )
}

export function ChallengeForm({ label, slot, challenge, onSave, onCancel }: {
  label: string
  slot: number
  challenge?: YouthChallenge
  onSave: (id: string, text: string) => Promise<void>
  onCancel: () => void
}) {
  const [id] = useState(() => challenge?.id ?? crypto.randomUUID())
  const [text, setText] = useState(challenge?.challenge_text ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setSaving(true)
    setError('')
    try {
      if (!text.trim()) throw new Error('Le texte du défi est obligatoire.')
      await onSave(id, text.trim())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Enregistrement du défi impossible.')
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  return <form className="progression-form" onSubmit={(event) => void submit(event)}>
    <h4>{label} — Préparer le défi {slot}</h4>
    <label>Texte du défi
      <textarea rows={4} required autoFocus disabled={saving} value={text} onChange={(event) => setText(event.target.value)} />
    </label>
    {error && <p className="youth-create-error" role="alert">{error}</p>}
    <div className="progression-actions">
      <button disabled={saving} type="submit">{saving ? 'Enregistrement…' : 'Enregistrer le défi'}</button>
      <button disabled={saving} className="secondary-button" type="button" onClick={onCancel}>Annuler</button>
    </div>
  </form>
}

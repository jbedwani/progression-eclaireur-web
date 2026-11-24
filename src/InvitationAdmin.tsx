import { useEffect, useState, type FormEvent } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type InvitationRole = 'guardian' | 'youth' | 'animator'

type YouthOption = {
  id: string
  name: string
}

type InvitationAdminProps = {
  youth: YouthOption[]
}

type Invitation = {
  id: string
  intended_email: string
  intended_role: InvitationRole
  expires_at: string
  redeemed_at: string | null
  revoked_at: string | null
  created_at: string
}

type InvitationResponse = {
  invitation?: Invitation
  invitations?: Invitation[]
  actionLink?: string
  error?: string
  success?: boolean
}

const roleLabels: Record<InvitationRole, string> = {
  guardian: 'Parent ou tuteur',
  youth: 'Éclaireur',
  animator: 'Animateur',
}

function invitationStatus(invitation: Invitation): string {
  if (invitation.revoked_at) return 'Révoquée'
  if (invitation.redeemed_at) return 'Utilisée'
  if (new Date(invitation.expires_at).getTime() <= Date.now()) {
    return 'Expirée'
  }
  return 'En attente'
}

export default function InvitationAdmin({ youth }: InvitationAdminProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InvitationRole>('guardian')
  const [expiresInDays, setExpiresInDays] = useState('7')
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [actionLink, setActionLink] = useState('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selectedYouthIds, setSelectedYouthIds] = useState<string[]>([])

  async function loadInvitations() {
    setLoading(true)
    setError('')

    try {
      const { data, error: requestError } =
        await supabase.functions.invoke<InvitationResponse>(
          'manage-invitations',
          { body: { action: 'list' } },
        )

      if (requestError) throw requestError
      if (data?.error) throw new Error(data.error)

      setInvitations(data?.invitations ?? [])
    } catch {
      setError(
        'Impossible de charger les invitations. Vérifie que la fonction locale est démarrée et que ton compte est administrateur.',
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadInvitations()
  }, [])

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setActionLink('')
    setCreating(true)

    try {
      const { data, error: requestError } =
        await supabase.functions.invoke<InvitationResponse>(
          'manage-invitations',
          {
            body: {
              action: 'create',
              email: email.trim(),
              role,
              expiresInDays: Number(expiresInDays),
              youthIds: selectedYouthIds,
            },
          },
        )

      if (requestError) throw requestError
      if (data?.error) throw new Error(data.error)
      if (!data?.actionLink) {
        throw new Error('Le lien d’invitation n’a pas été retourné.')
      }

      setActionLink(data.actionLink)
      setMessage(
        `Invitation créée pour ${email.trim()}. Copie le lien ci-dessous pour le transmettre.`,
      )
      setEmail('')
      setSelectedYouthIds([])
      await loadInvitations()
    } catch (cause) {
      if (cause instanceof FunctionsHttpError) {
        try {
          const details = await cause.context.json()
          setError(
            typeof details?.error === 'string'
              ? details.error
              : `Erreur serveur : ${cause.message}`,
          )
        } catch {
          setError(`Erreur serveur : ${cause.message}`)
        }
      } else {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Impossible de créer l’invitation.',
        )
      }
    } finally {
      setCreating(false)
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(actionLink)
      setMessage('Lien copié dans le presse-papiers.')
    } catch {
      setMessage(
        'La copie automatique a échoué. Sélectionne le lien et copie-le manuellement.',
      )
    }
  }

  async function handleRevoke(invitation: Invitation) {
    if (
      !window.confirm(
        `Révoquer l’invitation destinée à ${invitation.intended_email} ?`,
      )
    ) {
      return
    }

    setError('')
    setMessage('')

    try {
      const { data, error: requestError } =
        await supabase.functions.invoke<InvitationResponse>(
          'manage-invitations',
          {
            body: { action: 'revoke', id: invitation.id },
          },
        )

      if (requestError) throw requestError
      if (data?.error) throw new Error(data.error)
      if (!data?.success) throw new Error('La révocation a échoué.')

      setMessage(`Invitation de ${invitation.intended_email} révoquée.`)
      await loadInvitations()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Impossible de révoquer cette invitation.',
      )
    }
  }

  return (
    <section className="invitation-admin" aria-labelledby="invitations-title">
      <div className="invitation-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h2 id="invitations-title">Invitations de comptes</h2>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => void loadInvitations()}
          disabled={loading}
        >
          {loading ? 'Actualisation…' : 'Actualiser'}
        </button>
      </div>

      <form onSubmit={handleCreate} className="invitation-form">
        <label htmlFor="invitation-email">Adresse courriel</label>
        <input
          id="invitation-email"
          type="email"
          autoComplete="email"
          placeholder="nom@exemple.ca"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <label htmlFor="invitation-role">Type de compte</label>
        <select
          id="invitation-role"
          value={role}
          onChange={(event) => {
            setRole(event.target.value as InvitationRole)
            setSelectedYouthIds([])
          }}
        >
          <option value="guardian">Parent ou tuteur</option>
          <option value="youth">Éclaireur</option>
          <option value="animator">Animateur</option>
        </select>

        {role !== 'animator' && (
          <fieldset className="invitation-youth-selection">
            <legend>
              {role === 'guardian'
                ? 'Jeunes associés à ce parent'
                : 'Dossier de l’Éclaireur'}
            </legend>

            {youth.length === 0 ? (
              <p>Aucun dossier de jeune actif disponible.</p>
            ) : (
              youth.map((record) => (
                <label key={record.id} className="invitation-youth-option">
                  <input
                    className="invitation-youth-option-control"
                    type={role === 'youth' ? 'radio' : 'checkbox'}
                    name={role === 'youth' ? 'invitation-youth' : undefined}
                    checked={selectedYouthIds.includes(record.id)}
                    onChange={(event) => {
                      if (role === 'youth') {
                        setSelectedYouthIds([record.id])
                      } else {
                        setSelectedYouthIds((current) =>
                          event.target.checked
                            ? [...current, record.id]
                            : current.filter((id) => id !== record.id),
                        )
                      }
                    }}
                  />
                  <span>{record.name}</span>
                </label>
              ))
            )}
          </fieldset>
        )}

        <label htmlFor="invitation-expiry">Validité du lien</label>
        <select
          id="invitation-expiry"
          value={expiresInDays}
          onChange={(event) => setExpiresInDays(event.target.value)}
        >
          <option value="1">1 jour</option>
          <option value="3">3 jours</option>
          <option value="7">7 jours</option>
          <option value="14">14 jours</option>
          <option value="30">30 jours</option>
        </select>

        <button type="submit" disabled={creating}>
          {creating ? 'Création en cours…' : 'Créer une invitation'}
        </button>
      </form>

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

      {actionLink && (
        <div className="invitation-link">
          <label htmlFor="created-invitation-link">
            Lien d’action à transmettre
          </label>
          <input
            id="created-invitation-link"
            type="text"
            value={actionLink}
            readOnly
            onFocus={(event) => event.currentTarget.select()}
          />
          <button type="button" onClick={() => void handleCopyLink()}>
            Copier le lien
          </button>
          <p className="login-note">
            Ce lien permet au destinataire de poursuivre son inscription.
            Transmets-le uniquement à la personne prévue.
          </p>
        </div>
      )}

      <div className="invitation-list-heading">
        <h3>Invitations existantes</h3>
        <span>{invitations.length}</span>
      </div>

      {loading && invitations.length === 0 ? (
        <p>Chargement des invitations…</p>
      ) : invitations.length === 0 ? (
        <p className="invitation-empty">Aucune invitation enregistrée.</p>
      ) : (
        <ul className="invitation-list">
          {invitations.map((invitation) => {
            const status = invitationStatus(invitation)
            const canRevoke = status === 'En attente'

            return (
              <li key={invitation.id} className="invitation-item">
                <div className="invitation-item-details">
                  <strong>{invitation.intended_email}</strong>
                  <span>{roleLabels[invitation.intended_role]}</span>
                  <span>
                    Échéance :{' '}
                    {new Date(invitation.expires_at).toLocaleString('fr-CA')}
                  </span>
                  <span className={`invitation-status status-${status.toLowerCase().replace('é', 'e')}`}>
                    {status}
                  </span>
                </div>

                {canRevoke && (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => void handleRevoke(invitation)}
                  >
                    Révoquer
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

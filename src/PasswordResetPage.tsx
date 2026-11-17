import { useState, type FormEvent } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './contexts/AuthContext'

const requirements = [
  { label: 'Au moins 12 caractères', test: (v: string) => v.length >= 12 },
  { label: 'Au moins une lettre minuscule', test: (v: string) => /[a-z]/.test(v) },
  { label: 'Au moins une lettre majuscule', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'Au moins un chiffre', test: (v: string) => /[0-9]/.test(v) },
  { label: 'Au moins un caractère spécial', test: (v: string) => /[^A-Za-z0-9]/.test(v) },
]

export default function PasswordResetPage() {
  const { session, loading } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const valid = requirements.every((r) => r.test(password))

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!valid) {
      setError('Le mot de passe ne respecte pas toutes les exigences.')
      return
    }

    if (password !== confirmation) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }

    setSaving(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })

      if (updateError) {
        setError(
          updateError.status === 429
            ? 'Trop de tentatives. Patientez quelques instants avant de réessayer.'
            : 'Impossible de changer le mot de passe. Réessayez ou demandez un nouveau lien.',
        )
        return
      }

      const { error: signOutError } = await supabase.auth.signOut()

      if (signOutError) {
        setError(
          'Votre mot de passe a été modifié, mais la déconnexion automatique a échoué. Vous pouvez retourner à la connexion.',
        )
        return
      }

      setDone(true)
    } catch {
      setError('Une erreur est survenue. Réessayez.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="login-page">
        <section className="login-card" aria-live="polite">
          <h1>Vérification du lien…</h1>
        </section>
      </main>
    )
  }

  if (done) {
    return (
      <main className="login-page">
        <section className="login-card">
          <h1>Mot de passe modifié</h1>
          <p>Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</p>
          <button type="button" onClick={() => window.location.assign('/')}>
            Aller à la connexion
          </button>
        </section>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="login-page">
        <section className="login-card">
          <h1>Lien invalide ou expiré</h1>
          <p className="login-message" role="alert">
            Ouvrez le lien complet reçu par courriel, ou demandez-en un nouveau depuis la page de connexion.
          </p>
          <button type="button" onClick={() => window.location.assign('/')}>
            Retour à la connexion
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <h1>Nouveau mot de passe</h1>
        <p className="intro">Choisissez un nouveau mot de passe pour votre compte.</p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="reset-password">Nouveau mot de passe</label>
          <input
            id="reset-password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              setError('')
            }}
          />

          <ul className="password-requirements" aria-live="polite">
            {requirements.map((r) => {
              const ok = r.test(password)

              return (
                <li key={r.label} className={ok ? 'password-requirement is-valid' : 'password-requirement'}>
                  <span aria-hidden="true">{ok ? '✓' : '○'}</span>
                  {r.label}
                </li>
              )
            })}
          </ul>

          <label htmlFor="reset-confirmation">Confirmer le mot de passe</label>
          <input
            id="reset-confirmation"
            type="password"
            autoComplete="new-password"
            minLength={12}
            required
            value={confirmation}
            onChange={(event) => {
              setConfirmation(event.target.value)
              setError('')
            }}
          />

          {confirmation.length > 0 && (
            <p className={password === confirmation ? 'password-match' : 'password-mismatch'}>
              {password === confirmation
                ? 'Les mots de passe correspondent.'
                : 'Les mots de passe ne correspondent pas.'}
            </p>
          )}

          {error && <p className="login-message" role="alert">{error}</p>}

          <button type="submit" disabled={saving || !valid || password !== confirmation}>
            {saving ? 'Enregistrement…' : 'Changer le mot de passe'}
          </button>
        </form>
      </section>
    </main>
  )
}

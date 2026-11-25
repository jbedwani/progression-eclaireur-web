
import { useState, type FormEvent } from 'react'
import { supabase } from './lib/supabase'
import { useAuth } from './contexts/AuthContext'
import Dashboard from './Dashboard'
import PasswordResetPage from './PasswordResetPage'
import './App.css'


function getPasswordErrorMessage(error: {
  message: string
  code?: string
  status?: number
}): string {
  const message = error.message.toLowerCase()
  const code = error.code?.toLowerCase() ?? ''

  if (
    code === 'weak_password' ||
    message.includes('weak password') ||
    message.includes('password should')
  ) {
    if (
      message.includes('12 characters') ||
      message.includes('at least 12')
    ) {
      return 'Le mot de passe doit contenir au moins 12 caractères.'
    }

    if (message.includes('lowercase')) {
      return 'Le mot de passe doit contenir au moins une lettre minuscule.'
    }

    if (message.includes('uppercase')) {
      return 'Le mot de passe doit contenir au moins une lettre majuscule.'
    }

    if (message.includes('number') || message.includes('digit')) {
      return 'Le mot de passe doit contenir au moins un chiffre.'
    }

    if (message.includes('special') || message.includes('symbol')) {
      return 'Le mot de passe doit contenir au moins un caractère spécial.'
    }

    return 'Le mot de passe ne respecte pas les exigences de sécurité. Vérifiez les cinq critères affichés.'
  }

  if (error.status === 429) {
    return 'Trop de tentatives. Veuillez patienter quelques instants avant de réessayer.'
  }

  if (
    error.status === 0 ||
    error.message.toLowerCase().includes('fetch')
  ) {
    return 'Impossible de joindre le service. Vérifiez votre connexion Internet et réessayez.'
  }

  return 'Impossible de définir le mot de passe pour le moment. Réessayez ou contactez un animateur si le problème persiste.'
}

function InvitationPage({
  authLoading,
}: {
  authLoading: boolean
}) {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token') ?? ''
  const tokenHash = params.get('token_hash') ?? ''
  const rawType = params.get('type')
  const otpType =
    rawType === 'invite' || rawType === 'magiclink'
      ? rawType
      : null

  const [stage, setStage] = useState<'ready' | 'password' | 'success'>('ready')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [acceptedExistingAccount, setAcceptedExistingAccount] = useState(false)

  const passwordRequirements = [
    {
      label: 'Au moins 12 caractères',
      test: (value: string) => value.length >= 12,
    },
    {
      label: 'Au moins une lettre minuscule',
      test: (value: string) => /[a-z]/.test(value),
    },
    {
      label: 'Au moins une lettre majuscule',
      test: (value: string) => /[A-Z]/.test(value),
    },
    {
      label: 'Au moins un chiffre',
      test: (value: string) => /[0-9]/.test(value),
    },
    {
      label: 'Au moins un caractère spécial',
      test: (value: string) => /[^A-Za-z0-9]/.test(value),
    },
  ]

  const passwordIsValid = passwordRequirements.every(
    (requirement) => requirement.test(password),
  )

  async function handleConfirmInvitation() {
    setError('')

    if (
      !token ||
      token.length < 32 ||
      token.length > 256 ||
      !tokenHash ||
      !otpType
    ) {
      setError(
        'Lien invalide ou incomplet. Demandez une nouvelle invitation à votre responsable.',
      )
      return
    }

    setLoading(true)

    try {
      // La vérification du lien n'a lieu qu'après le clic de l'utilisateur.
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType,
      })

      if (verifyError) {
        setError(
          'Ce lien de confirmation est invalide ou a expiré. Demandez une nouvelle invitation à votre responsable.',
        )
        return
      }

      const { data, error: acceptError } =
        await supabase.functions.invoke('manage-invitations', {
          body: { action: 'accept', token },
        })

      if (acceptError) {
        setError(
          'Cette invitation a été révoquée, expirée ou n’est plus valide. Demandez une nouvelle invitation à votre responsable.',
        )
        return
      }

      if (typeof data?.requiresPassword !== 'boolean') {
        setError(
          'La réponse du service est incomplète. Contactez votre responsable avant de réessayer.',
        )
        return
      }

      setAcceptedExistingAccount(!data.requiresPassword)

      // Rafraîchir la session afin que le profil activé soit rechargé.
      await supabase.auth.refreshSession()

      if (data.requiresPassword) {
        setStage('password')
      } else {
        setStage('success')
      }
    } catch {
      setError('Une erreur est survenue. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (!passwordIsValid) {
      setError('Le mot de passe ne respecte pas toutes les exigences.')
      return
    }

    if (password !== confirmation) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }

    setLoading(true)

    try {
      const { error: passwordError } = await supabase.auth.updateUser({
        password,
      })

      if (passwordError) {
        setError(getPasswordErrorMessage(passwordError))
        return
      }

      setStage('success')
    } catch {
      setError('Une erreur est survenue. Réessayez.')
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) {
    return (
      <main className="login-page">
        <section className="login-card">
          <h1>Vérification de l’invitation…</h1>
        </section>
      </main>
    )
  }

  if (stage === 'success') {
    return (
      <main className="login-page">
        <section className="login-card">
          <h1>
            {acceptedExistingAccount
              ? 'Dossiers associés !'
              : 'Compte activé !'}
          </h1>
          <p>
            {acceptedExistingAccount
              ? 'Les dossiers ont été associés à votre compte.'
              : 'Votre mot de passe est défini et votre compte est activé.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.assign('/')}
          >
            Accéder à mon espace
          </button>
        </section>
      </main>
    )
  }

  if (stage === 'password') {
    return (
      <main className="login-page">
        <section className="login-card">
          <h1>Terminer votre inscription</h1>
          <p className="intro">
            Votre invitation est acceptée. Choisissez maintenant un mot de
            passe pour votre espace scout.
          </p>

          <form onSubmit={handleSetPassword}>
            <label htmlFor="new-password">Nouveau mot de passe</label>
            <input
              id="new-password"
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
              {passwordRequirements.map((requirement) => {
                const satisfied = requirement.test(password)

                return (
                  <li
                    key={requirement.label}
                    className={
                      satisfied
                        ? 'password-requirement is-valid'
                        : 'password-requirement'
                    }
                  >
                    <span aria-hidden="true">
                      {satisfied ? '✓' : '○'}
                    </span>
                    {requirement.label}
                  </li>
                )
              })}
            </ul>

            <label htmlFor="confirm-password">
              Confirmer le mot de passe
            </label>
            <input
              id="confirm-password"
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
              <p
                className={
                  password === confirmation
                    ? 'password-match'
                    : 'password-mismatch'
                }
              >
                {password === confirmation
                  ? 'Les mots de passe correspondent.'
                  : 'Les mots de passe ne correspondent pas.'}
              </p>
            )}

            {error && (
              <p className="login-message" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                !passwordIsValid ||
                password !== confirmation
              }
            >
              {loading
                ? 'Enregistrement…'
                : 'Définir mon mot de passe'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <h1>Invitation à rejoindre votre espace scout</h1>
        <p className="intro">
          Cliquez sur le bouton ci-dessous pour confirmer votre invitation
          et activer votre accès.
        </p>

        {error && (
          <p className="login-message" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleConfirmInvitation}
          disabled={loading}
        >
          {loading ? 'Confirmation en cours…' : 'Confirmer mon invitation'}
        </button>
      </section>
    </main>
  )
}

function App() {
  const { session, profile, loading: authLoading, profileError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [signOutLoading, setSignOutLoading] = useState(false)
  const [resetNotice, setResetNotice] = useState('')

  if (window.location.pathname === '/invite') {
    return (
      <InvitationPage authLoading={authLoading} />
    )
  }

  if (window.location.pathname === '/reset-password') {
    return <PasswordResetPage />
  }

  async function handleForgotPassword() {
    setLoginError('')
    setResetNotice('')

    if (!email.trim()) {
      setLoginError('Saisissez votre adresse courriel, puis cliquez sur « Mot de passe oublié ».')
      return
    }

    setLoginLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) {
        throw error
      }

      setResetNotice(
        'Si un compte correspond à cette adresse, un courriel contenant un lien de réinitialisation vient d’être envoyé.',
      )
    } catch {
      setLoginError('Impossible de joindre le service. Réessayez plus tard.')
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoginError('')
    setLoginLoading(true)

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        setLoginError(
          'Connexion impossible. Vérifiez votre courriel et votre mot de passe.',
        )
      }
    } catch {
      setLoginError('Impossible de joindre le service. Réessayez plus tard.')
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleSignOut() {
    setSignOutLoading(true)

    try {
      const { error } = await supabase.auth.signOut()

      if (error) {
        setLoginError('La déconnexion a échoué. Réessayez.')
      }
    } catch {
      setLoginError('Impossible de joindre le service. Réessayez plus tard.')
    } finally {
      setSignOutLoading(false)
    }
  }

  if (authLoading) {
    return (
      <main className="login-page">
        <section className="login-card" aria-live="polite">
          <p className="eyebrow">SCOUTISME · PROGRESSION</p>
          <h1>Progression Éclaireur</h1>
          <p className="intro">Vérification de votre session et de votre profil…</p>
        </section>
      </main>
    )
  }

  if (session && profile && !profileError) {
    return (
      <Dashboard
        profile={profile}
        email={session.user.email ?? ''}
        onSignOut={() => void handleSignOut()}
        signingOut={signOutLoading}
      />
    )
  }

  if (session && profileError) {
    return (
      <main className="login-page">
        <section className="login-card" aria-labelledby="access-title">
          <div className="app-mark" aria-hidden="true">
            PE
          </div>

          <p className="eyebrow">SCOUTISME · PROGRESSION</p>
          <h1 id="access-title">Accès non autorisé</h1>
          <p className="login-message" role="alert">
            {profileError}
          </p>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={signOutLoading}
          >
            {signOutLoading ? 'Déconnexion en cours…' : 'Se déconnecter'}
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="app-mark" aria-hidden="true">
          PE
        </div>

        <p className="eyebrow">SCOUTISME · PROGRESSION</p>
        <h1 id="login-title">Progression Éclaireur</h1>
        <p className="intro">
          Bienvenue ! Connectez-vous pour accéder à votre espace scout.
        </p>

        <form onSubmit={handleLogin}>
          <label htmlFor="email">Adresse courriel</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nom@exemple.ca"
            required
          />

          <label htmlFor="password">Mot de passe</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Votre mot de passe"
            required
          />

          {loginError && (
            <p className="login-message" role="alert">
              {loginError}
            </p>
          )}

          {resetNotice && (
            <p className="password-match" role="status">{resetNotice}</p>
          )}

          <button type="submit" disabled={loginLoading}>
            {loginLoading ? 'Connexion en cours…' : 'Se connecter'}
          </button>
          <button
            type="button"
            className="link-button"
            onClick={() => void handleForgotPassword()}
            disabled={loginLoading}
          >
            Mot de passe oublié
          </button>
        </form>

        <p className="login-note">
          L’accès est réservé aux personnes disposant d’un compte autorisé.
        </p>
      </section>
    </main>
  )
}

export default App


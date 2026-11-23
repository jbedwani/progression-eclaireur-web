
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/profile'

type AuthState = {
  session: Session | null
  user: User | null
  profile: Profile | null
  loading: boolean
  profileError: string | null
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let profileRequest = 0

    async function loadProfile(userId: string) {
      const request = ++profileRequest
      setProfile(null)
      setProfileError(null)

      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, role, active, created_at')
        .eq('id', userId)
        .maybeSingle()

      if (!active || request !== profileRequest) return

      if (error) {
        setProfileError('Impossible de vérifier votre profil.')
        return
      }

      if (!data) {
        setProfileError(
          'Aucun profil autorisé n’est associé à ce compte. Contactez votre responsable.',
        )
        return
      }

      if (!data.active) {
        setProfileError(
          'Ce compte est désactivé. Contactez votre responsable.',
        )
        return
      }

      setProfile(data as Profile)
    }

    async function initialize() {
      const { data, error } = await supabase.auth.getSession()

      if (!active) return

      if (error) {
        setProfileError('Impossible de vérifier la session.')
        setLoading(false)
        return
      }

      setSession(data.session)

      if (data.session?.user) {
        await loadProfile(data.session.user.id)
      }

      if (active) setLoading(false)
    }

    void initialize()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      profileRequest++

      if (!nextSession) {
        setProfile(null)
        setProfileError(null)
        setLoading(false)
        return
      }

      // La lecture du profil se fait hors du callback d’authentification.
      setLoading(true)
      setTimeout(() => {
        if (active) {
          void loadProfile(nextSession.user.id).finally(() => {
            if (active) setLoading(false)
          })
        }
      }, 0)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        profileError,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider.')
  }

  return context
}


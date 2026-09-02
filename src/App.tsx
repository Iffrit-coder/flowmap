import { useEffect, useState } from 'react'
import AuthScreen from './components/AuthScreen'
import Dashboard from './components/Dashboard'
import Editor from './components/Editor'
import ResetScreen from './components/ResetScreen'
import SharedMap from './components/SharedMap'
import VerifyScreen from './components/VerifyScreen'
import { useAuthStore } from './authStore'

type Route =
  | { view: 'dashboard' }
  | { view: 'map'; id: string }
  | { view: 'reset'; token: string }
  | { view: 'verify'; token: string }
  | { view: 'shared'; token: string }

function parseRoute(hash: string): Route {
  // Tokens are base64url, so the character class has to allow - and _.
  const reset = hash.match(/^#\/reset\/([\w-]+)$/)
  if (reset) return { view: 'reset', token: reset[1] }
  const verify = hash.match(/^#\/verify\/([\w-]+)$/)
  if (verify) return { view: 'verify', token: verify[1] }
  const shared = hash.match(/^#\/shared\/([\w-]+)$/)
  if (shared) return { view: 'shared', token: shared[1] }
  const map = hash.match(/^#\/map\/([\w-]+)$/)
  return map ? { view: 'map', id: map[1] } : { view: 'dashboard' }
}

function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))
  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return route
}

export default function App() {
  const route = useRoute()
  const status = useAuthStore((s) => s.status)
  const checkSession = useAuthStore((s) => s.checkSession)

  useEffect(() => {
    checkSession()
  }, [checkSession])

  if (status === 'loading') return null

  // Both arrive as emailed links and must render regardless of session state —
  // someone resetting a password is by definition unable to sign in first.
  if (route.view === 'reset') return <ResetScreen token={route.token} />
  if (route.view === 'verify') return <VerifyScreen token={route.token} />

  // A share link is a credential in its own right, so this renders whether or
  // not anyone is signed in — the whole point is that the recipient needn't be.
  if (route.view === 'shared') return <SharedMap key={route.token} token={route.token} />

  if (status === 'signed-out') return <AuthScreen />
  if (route.view === 'map') return <Editor key={route.id} mapId={route.id} />
  return <Dashboard />
}

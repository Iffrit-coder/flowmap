import { useEffect, useState } from 'react'
import AuthScreen from './components/AuthScreen'
import Dashboard from './components/Dashboard'
import Editor from './components/Editor'
import { useAuthStore } from './authStore'

type Route = { view: 'dashboard' } | { view: 'map'; id: string }

function parseRoute(hash: string): Route {
  const match = hash.match(/^#\/map\/([\w-]+)$/)
  return match ? { view: 'map', id: match[1] } : { view: 'dashboard' }
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
  if (status === 'signed-out') return <AuthScreen />
  if (route.view === 'map') return <Editor key={route.id} mapId={route.id} />
  return <Dashboard />
}

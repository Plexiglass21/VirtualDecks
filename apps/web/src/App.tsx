import { useEffect, useMemo, useState } from 'react'
import { HomeScreen } from './components/home/HomeScreen'
import { TableSurface } from './components/table/TableSurface'

type AppScreen = 'home' | 'table'

function getScreenFromHash(): AppScreen {
  return window.location.hash === '#table'
    ? 'table'
    : 'home'
}

function App() {
  const initialScreen = useMemo(() => getScreenFromHash(), [])
  const [screen, setScreen] = useState<AppScreen>(initialScreen)

  useEffect(() => {
    const handleHashChange = () => {
      setScreen(getScreenFromHash())
    }

    window.addEventListener('hashchange', handleHashChange)

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  function openTable() {
    window.location.hash = 'table'
    setScreen('table')
  }

  function openHome() {
    window.location.hash = ''
    setScreen('home')
  }

  return screen === 'table'
    ? <TableSurface onBackHome={openHome} />
    : <HomeScreen onOpenTable={openTable} />
}

export default App

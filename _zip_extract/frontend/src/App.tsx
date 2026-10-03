import { AnimatePresence, motion } from 'motion/react'
import { WifiSlash } from '@phosphor-icons/react'
import { API_BASE } from './api/client'
import { DataProvider, useData } from './state/data'
import { TopBar } from './components/TopBar'
import { useRoute } from './lib/router'
import { Overview } from './views/Overview'
import { CustomersView } from './views/CustomersView'
import { CallsView } from './views/CallsView'
import { ActionsView } from './views/ActionsView'

function ConnectionBanner() {
  const { connection, error, refresh } = useData()
  if (connection !== 'error') return null
  return (
    <div className="note note-error banner" role="alert">
      <WifiSlash size={20} weight="bold" aria-hidden="true" />
      <div className="note-body">
        <p className="note-title">{error ?? `Can't reach the Aven API at ${API_BASE}`}</p>
        <p>
          Start the backend with <code>uvicorn app.main:app --port 8000</code> in <code>backend/</code>, or set{' '}
          <code>VITE_API_BASE_URL</code> in <code>frontend/.env</code>. The dashboard reconnects on its own.
        </p>
      </div>
      <button type="button" className="btn btn-sm" onClick={() => void refresh()}>
        Retry now
      </button>
    </div>
  )
}

function Shell() {
  const route = useRoute()
  return (
    <>
      <TopBar view={route.view} />
      <main className="main" id="main">
        <ConnectionBanner />
        {/* Views swap with a quick fade and lift: tabs are used often, so it stays near-imperceptible. */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={route.view}
            className="view"
            initial={{ opacity: 0, transform: 'translateY(8px)' }}
            animate={{ opacity: 1, transform: 'translateY(0px)' }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
          >
            {route.view === 'overview' && <Overview />}
            {route.view === 'customers' && <CustomersView param={route.param} />}
            {route.view === 'calls' && <CallsView param={route.param} />}
            {route.view === 'actions' && <ActionsView />}
          </motion.div>
        </AnimatePresence>
      </main>
    </>
  )
}

export default function App() {
  return (
    <DataProvider>
      <Shell />
    </DataProvider>
  )
}

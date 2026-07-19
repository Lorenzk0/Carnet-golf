import AuthGate from './AuthGate.jsx'
import GolfTracker from './GolfTracker.jsx'

function App() {
  return (
    <AuthGate>{(session) => <GolfTracker userEmail={session.user.email} />}</AuthGate>
  )
}

export default App

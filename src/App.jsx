import AuthGate from './AuthGate.jsx'
import GolfTracker from './GolfTracker.jsx'

function App() {
  return (
    <AuthGate>
      <GolfTracker />
    </AuthGate>
  )
}

export default App

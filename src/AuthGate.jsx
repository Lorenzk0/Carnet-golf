import { useEffect, useState } from 'react'
import { Flag, LogOut, X } from 'lucide-react'
import { supabase } from './lib/supabaseClient.js'
import { setStorageErrorHandler } from './lib/storage.js'

export default function AuthGate({ children }) {
  const [session, setSession] = useState(undefined) // undefined = chargement, null = déconnecté
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState('')
  const [storageErrors, setStorageErrors] = useState([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    setStorageErrorHandler((err) => setStorageErrors((prev) => [...prev, { ...err, id: Date.now() + Math.random() }]))
    return () => setStorageErrorHandler(null)
  }, [])

  function dismissStorageError(id) {
    setStorageErrors((prev) => prev.filter((e) => e.id !== id))
  }

  async function sendMagicLink(e) {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
    } else {
      setStatus('sent')
    }
  }

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 text-stone-500">
        Chargement…
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center px-5">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 text-emerald-900 mb-6 justify-center">
            <Flag size={22} />
            <span className="text-xl font-bold">Carnet de coups</span>
          </div>
          {status === 'sent' ? (
            <div className="bg-white rounded-2xl border border-stone-200 p-5 text-center space-y-2">
              <p className="font-medium">Lien envoyé !</p>
              <p className="text-sm text-stone-500">
                Vérifie ta boîte mail ({email}) et clique sur le lien de connexion.
              </p>
              <button onClick={() => setStatus('idle')} className="text-xs text-stone-400 underline">
                Utiliser une autre adresse
              </button>
            </div>
          ) : (
            <form onSubmit={sendMagicLink} className="bg-white rounded-2xl border border-stone-200 p-5 space-y-3">
              <div>
                <div className="text-xs font-semibold text-stone-500 uppercase mb-1.5">Adresse email</div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="toi@exemple.com"
                  className="w-full border border-stone-300 rounded-lg px-3 py-2"
                />
              </div>
              <button
                type="submit"
                disabled={status === 'sending'}
                className="w-full bg-emerald-900 disabled:bg-stone-300 text-white rounded-xl py-3 font-semibold active:scale-95 transition"
              >
                {status === 'sending' ? 'Envoi…' : 'Recevoir un lien de connexion'}
              </button>
              {status === 'error' && <p className="text-xs text-red-600">{errorMsg}</p>}
              <p className="text-xs text-stone-400">
                Pas de mot de passe : tu reçois un lien à usage unique par email pour te connecter.
              </p>
            </form>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      {storageErrors.length > 0 && (
        <div className="sticky top-0 z-30 space-y-1 p-2">
          {storageErrors.map((e) => (
            <div
              key={e.id}
              className="bg-red-600 text-white text-xs rounded-lg px-3 py-2 flex items-start justify-between gap-2 shadow-lg"
            >
              <div>
                <span className="font-semibold">Erreur de synchro</span> ({e.action} {e.key}) : {e.message}
              </div>
              <button onClick={() => dismissStorageError(e.id)} className="shrink-0">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        onClick={() => supabase.auth.signOut()}
        title="Se déconnecter"
        className="fixed bottom-3 right-3 z-20 bg-stone-900/80 text-white rounded-full p-2.5 shadow-lg active:scale-95 transition"
      >
        <LogOut size={16} />
      </button>
      {typeof children === 'function' ? children(session) : children}
    </div>
  )
}

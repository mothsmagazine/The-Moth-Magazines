import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function AdminLogin() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'same-origin' })
        if (!res.ok) return
        const data = await res.json()
        if (data.authenticated) {
          navigate('/admin', { replace: true })
        }
      } catch {
      }
    }

    checkSession()
  }, [navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password }),
      })

      if (!res.ok) {
        throw new Error('Invalid password')
      }

      navigate('/admin', { replace: true })
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="max-w-md mx-auto py-10 px-3 sm:px-4">
      <h1 className="text-3xl font-bold text-gray-100 mb-6">Admin Login</h1>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-900/30 border border-red-700 text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-300 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-100"
            placeholder="Enter admin password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 rounded-md bg-pink-600 hover:bg-pink-700 text-white font-semibold disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </section>
  )
}

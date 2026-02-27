import React, { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'

export default function ProtectedAdminRoute() {
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'same-origin' })
        if (!res.ok) {
          setIsAuthenticated(false)
          return
        }

        const data = await res.json()
        setIsAuthenticated(Boolean(data.authenticated))
      } catch {
        setIsAuthenticated(false)
      } finally {
        setIsLoading(false)
      }
    }

    checkSession()
  }, [])

  if (isLoading) {
    return (
      <section className="max-w-3xl mx-auto py-10 px-3 sm:px-4">
        <p className="text-gray-400">Checking admin session…</p>
      </section>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/admin/login" replace />
  }

  return <Outlet />
}

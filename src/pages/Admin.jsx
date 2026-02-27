import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Admin() {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    fetchPosts()
  }, [])

  async function fetchPosts() {
    try {
      const res = await fetch('/api/posts')
      if (!res.ok) throw new Error('Failed to load posts')
      const data = await res.json()
      setPosts(data.posts)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id, title) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/posts/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      setPosts((prev) => prev.filter((p) => p.id !== id))
    } catch (err) {
      alert(err.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="max-w-3xl mx-auto py-10 px-4">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-100">Admin Dashboard</h1>
        <button
          onClick={() => navigate('/admin/new')}
          className="px-5 py-2 rounded-lg bg-pink-600 hover:bg-pink-700 text-white font-semibold transition"
        >
          + New Post
        </button>
      </div>

      {loading && <p className="text-gray-400">Loading posts…</p>}
      {error && <p className="text-red-400">{error}</p>}

      {!loading && posts.length === 0 && (
        <p className="text-gray-500">No posts yet. Click "New Post" to create one.</p>
      )}

      <div className="space-y-3">
        {posts.map((post) => (
          <div
            key={post.id}
            className="flex items-center justify-between p-4 rounded-lg bg-gray-800/60 border border-gray-700"
          >
            <div className="min-w-0 flex-1 mr-4">
              <h2 className="text-lg font-semibold text-gray-100 truncate">{post.title}</h2>
              <p className="text-sm text-gray-400">
                By {post.author} &middot;{' '}
                {new Date(post.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </p>
            </div>

            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => navigate(`/admin/edit/${post.id}`)}
                className="px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm transition"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(post.id, post.title)}
                disabled={deletingId === post.id}
                className="px-3 py-1.5 rounded-md bg-red-800/60 hover:bg-red-700 text-red-200 text-sm transition disabled:opacity-50"
              >
                {deletingId === post.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

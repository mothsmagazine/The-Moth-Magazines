import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Read() {
  const navigate = useNavigate()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedPost, setSelectedPost] = useState(null)
  const [loadingPost, setLoadingPost] = useState(false)

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

  async function openPost(id) {
    setLoadingPost(true)
    try {
      const res = await fetch(`/api/posts/${id}`)
      if (!res.ok) throw new Error('Failed to load post')
      const data = await res.json()
      setSelectedPost(data.post)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingPost(false)
    }
  }

  function closePost() {
    setSelectedPost(null)
  }

  // Render body text with embedded images
  function renderBody(text) {
    if (!text) return null
    const parts = text.split(/(!\[.*?\]\(.*?\))/)
    return parts.map((part, i) => {
      const imgMatch = part.match(/^!\[(.*?)\]\((.*?)\)$/)
      if (imgMatch) {
        return (
          <img
            key={i}
            src={imgMatch[2]}
            alt={imgMatch[1]}
            className="max-w-full rounded-lg my-4"
            loading="lazy"
          />
        )
      }
      return part ? (
        <span key={i} className="whitespace-pre-wrap">
          {part}
        </span>
      ) : null
    })
  }

  // ——— Single post view ———
  if (selectedPost) {
    return (
      <section className="max-w-2xl mx-auto py-10 px-4">
        <button
          onClick={closePost}
          className="mb-6 text-sm text-pink-400 hover:text-pink-300 transition"
        >
          &larr; Back to all posts
        </button>

        <article>
          <h1 className="text-3xl font-bold text-gray-100 mb-2">{selectedPost.title}</h1>
          <p className="text-sm text-gray-400 mb-8">
            By {selectedPost.author} &middot;{' '}
            {new Date(selectedPost.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
          <button
            onClick={() => navigate(`/flash-read/${selectedPost.id}`)}
            className="mb-6 px-4 py-2 rounded-md bg-pink-600 hover:bg-pink-700 text-white text-sm font-semibold transition"
          >
            Read in Flash Mode
          </button>
          <div className="prose max-w-none text-gray-300 leading-relaxed">
            {renderBody(selectedPost.body)}
          </div>
        </article>
      </section>
    )
  }

  // ——— Posts list ———
  return (
    <section className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold mb-6 text-gray-100">Read</h1>

      {loading && <p className="text-gray-400">Loading posts…</p>}
      {error && <p className="text-red-400">{error}</p>}

      {!loading && posts.length === 0 && (
        <p className="text-gray-500">No posts yet.</p>
      )}

      <div className="space-y-4">
        {posts.map((post) => (
          <button
            key={post.id}
            onClick={() => openPost(post.id)}
            disabled={loadingPost}
            className="w-full text-left p-5 rounded-lg bg-gray-800/60 border border-gray-700 hover:border-pink-600/50 hover:bg-gray-800 transition cursor-pointer disabled:opacity-50"
          >
            <h2 className="text-xl font-semibold text-gray-100">{post.title}</h2>
            <p className="text-sm text-gray-400 mt-1">
              By {post.author} &middot;{' '}
              {new Date(post.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </button>
        ))}
      </div>
    </section>
  )
}

import React, { useState } from 'react'

export default function Write() {
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState(null) // 'sending' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')

    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, author, body }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to publish')
      }

      setStatus('success')
      setTitle('')
      setAuthor('')
      setBody('')
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message)
    }
  }

  return (
    <section className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold mb-6 text-gray-100">Write a Post</h1>

      {status === 'success' && (
        <div className="mb-6 p-4 rounded-lg bg-green-900/40 border border-green-700 text-green-300">
          Post published successfully!
        </div>
      )}

      {status === 'error' && (
        <div className="mb-6 p-4 rounded-lg bg-red-900/40 border border-red-700 text-red-300">
          {errorMsg || 'Something went wrong.'}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Title *</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            placeholder="Your post title"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Author</label>
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            placeholder="Anonymous"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Body *</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={14}
            className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-y"
            placeholder="Write your article here…"
          />
        </div>

        <button
          type="submit"
          disabled={status === 'sending'}
          className="px-6 py-2.5 rounded-lg bg-pink-600 hover:bg-pink-700 text-white font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'sending' ? 'Publishing…' : 'Publish'}
        </button>
      </form>
    </section>
  )
}

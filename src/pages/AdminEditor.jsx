import React, { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

export default function AdminEditor() {
  const { id } = useParams() // undefined when creating new
  const navigate = useNavigate()
  const textareaRef = useRef(null)

  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState(null) // 'loading' | 'saving' | 'uploading' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('')
  const [isEdit, setIsEdit] = useState(false)

  useEffect(() => {
    if (id) {
      setIsEdit(true)
      loadPost(id)
    }
  }, [id])

  async function loadPost(postId) {
    setStatus('loading')
    try {
      const res = await fetch(`/api/posts/${postId}`)
      if (!res.ok) throw new Error('Post not found')
      const data = await res.json()
      setTitle(data.post.title)
      setAuthor(data.post.author)
      setBody(data.post.body)
      setStatus(null)
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message)
    }
  }

  async function handleImageUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setStatus('uploading')
    setErrorMsg('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/images', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Image upload failed')

      const data = await res.json()
      const imageMarkdown = `![${file.name}](${data.url})`

      // Insert at cursor position in textarea
      const textarea = textareaRef.current
      if (textarea) {
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const before = body.slice(0, start)
        const after = body.slice(end)
        const newBody = before + '\n' + imageMarkdown + '\n' + after
        setBody(newBody)

        // Restore cursor after the inserted text
        requestAnimationFrame(() => {
          const newPos = start + imageMarkdown.length + 2
          textarea.selectionStart = newPos
          textarea.selectionEnd = newPos
          textarea.focus()
        })
      } else {
        setBody((prev) => prev + '\n' + imageMarkdown + '\n')
      }

      setStatus(null)
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message)
    }

    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('saving')
    setErrorMsg('')

    try {
      const endpoint = isEdit ? `/api/posts/${id}` : '/api/posts'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, author, body }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }

      setStatus('success')
      setTimeout(() => navigate('/admin'), 1000)
    } catch (err) {
      setStatus('error')
      setErrorMsg(err.message)
    }
  }

  // Render a live preview of the body with images
  function renderPreview(text) {
    if (!text) return null

    // Split by image markdown pattern: ![alt](url)
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
      // Render text, preserving whitespace
      return part ? (
        <span key={i} className="whitespace-pre-wrap">
          {part}
        </span>
      ) : null
    })
  }

  if (status === 'loading') {
    return (
      <section className="max-w-2xl mx-auto py-10 px-4">
        <p className="text-gray-400">Loading post…</p>
      </section>
    )
  }

  return (
    <section className="max-w-2xl mx-auto py-10 px-4">
      <button
        onClick={() => navigate('/admin')}
        className="mb-6 text-sm text-pink-400 hover:text-pink-300 transition"
      >
        &larr; Back to dashboard
      </button>

      <h1 className="text-3xl font-bold mb-6 text-gray-100">
        {isEdit ? 'Edit Post' : 'New Post'}
      </h1>

      {status === 'success' && (
        <div className="mb-6 p-4 rounded-lg bg-green-900/40 border border-green-700 text-green-300">
          {isEdit ? 'Post updated!' : 'Post published!'} Redirecting…
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
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-300">Body *</label>
            <label className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm cursor-pointer transition">
              {status === 'uploading' ? (
                'Uploading…'
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Insert Image
                </>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={status === 'uploading'}
                className="hidden"
              />
            </label>
          </div>
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={16}
            className="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-y font-mono text-sm"
            placeholder="Write your article here… Use the Insert Image button above to embed images."
          />
        </div>

        {/* Live preview */}
        {body && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Preview</label>
            <div className="p-5 rounded-lg bg-gray-800/40 border border-gray-700 text-gray-300 leading-relaxed">
              {renderPreview(body)}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={status === 'saving'}
            className="px-6 py-2.5 rounded-lg bg-pink-600 hover:bg-pink-700 text-white font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'saving' ? 'Saving…' : isEdit ? 'Update Post' : 'Publish'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="px-6 py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-200 font-semibold transition"
          >
            Cancel
          </button>
        </div>
      </form>
    </section>
  )
}

import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { extractFlashWords } from '../utils/flashWords'

const FONT_OPTIONS = [
  'inherit',
  'Arial, sans-serif',
  'Georgia, serif',
  'Times New Roman, serif',
  'Trebuchet MS, sans-serif',
  'Verdana, sans-serif',
  'Courier New, monospace',
]

export default function AdminFlashEditor() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [post, setPost] = useState(null)
  const [wordStyles, setWordStyles] = useState({})
  const [savedWordStyles, setSavedWordStyles] = useState({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [styleForm, setStyleForm] = useState({
    color: '#ffffff',
    fontSize: 56,
    bold: false,
    italic: false,
    fontFamily: 'inherit',
  })

  const words = useMemo(() => extractFlashWords(post?.body), [post?.body])
  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(wordStyles) !== JSON.stringify(savedWordStyles),
    [wordStyles, savedWordStyles],
  )

  useEffect(() => {
    async function loadPost() {
      try {
        const res = await fetch(`/api/posts/${id}`)
        if (!res.ok) throw new Error('Failed to load post')

        const data = await res.json()
        const styles = data.post.flashPresentation?.wordStyles || {}

        setPost(data.post)
        setWordStyles(styles)
        setSavedWordStyles(styles)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadPost()
  }, [id])

  useEffect(() => {
    const currentStyle = wordStyles[currentIndex] || {}

    setStyleForm({
      color: currentStyle.color || '#ffffff',
      fontSize: Number(currentStyle.fontSize) || 56,
      bold: currentStyle.fontWeight === '700',
      italic: currentStyle.fontStyle === 'italic',
      fontFamily: currentStyle.fontFamily || 'inherit',
    })
  }, [currentIndex, wordStyles])

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!hasUnsavedChanges) return
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [hasUnsavedChanges])

  function navigateWithUnsavedCheck(path) {
    if (hasUnsavedChanges) {
      const shouldLeave = confirm(
        'You have unsaved flash style changes. Please click "Save All Flash Styles" before leaving. Leave anyway?',
      )
      if (!shouldLeave) return
    }
    navigate(path)
  }

  function updateCurrentWordStyle(changes) {
    setStyleForm((prevForm) => {
      const nextForm = { ...prevForm, ...changes }

      const nextStyle = {
        color: nextForm.color,
        fontSize: Number(nextForm.fontSize),
        fontWeight: nextForm.bold ? '700' : '400',
        fontStyle: nextForm.italic ? 'italic' : 'normal',
        fontFamily: nextForm.fontFamily,
      }

      setWordStyles((prevStyles) => ({
        ...prevStyles,
        [currentIndex]: nextStyle,
      }))

      return nextForm
    })
  }

  function clearCurrentWordStyle() {
    setWordStyles((prev) => {
      const next = { ...prev }
      delete next[currentIndex]
      return next
    })
    setMessage(`Style cleared for word #${currentIndex + 1}`)
  }

  async function saveAllStyles() {
    setSaving(true)
    setError('')
    setMessage('')

    try {
      const res = await fetch(`/api/posts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          flashPresentation: {
            version: 1,
            wordStyles,
          },
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save styles')
      }

      setSavedWordStyles({ ...wordStyles })
      setMessage('Flash styles saved successfully.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <section className="max-w-3xl mx-auto py-10 px-4">
        <p className="text-gray-400">Loading flash style editor…</p>
      </section>
    )
  }

  if (error && !post) {
    return (
      <section className="max-w-3xl mx-auto py-10 px-4">
        <p className="text-red-400 mb-4">{error}</p>
        <button
          onClick={() => navigateWithUnsavedCheck('/admin')}
          className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-100"
        >
          Back to Admin
        </button>
      </section>
    )
  }

  const currentWord = words[currentIndex] || '(no word)'

  return (
    <section className="max-w-4xl mx-auto py-10 px-4 space-y-6">
      <div className="flex flex-row w-full justify-between">
          <button
            onClick={() => navigateWithUnsavedCheck(`/admin/edit/${id}`)}
            className="text-sm text-pink-400 hover:text-pink-300 transition"
          >
            &larr; Back to Post Editor
          </button>
          <button
            onClick={() => navigateWithUnsavedCheck(`/flash-read/${id}`)}
            className="text-sm px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition w-fit"
          >
            Preview Flash Reader
          </button>
      </div>

      {hasUnsavedChanges && (
        <div className="p-3 rounded-md bg-amber-900/30 border border-amber-700 text-amber-300">
          You have unsaved changes. Click "Save All Flash Styles" before leaving this page.
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold text-gray-100">Flash Word Style Editor</h1>
        <p className="text-gray-400 mt-1">{post?.title}</p>
      </div>

      <div className="p-6 rounded-lg bg-gray-800/60 border border-gray-700">
        <div className="flex items-center justify-between gap-3 mb-4">
          <button
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            className="px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200"
          >
            Prev Word
          </button>
          <p className="text-sm text-gray-400">
            Word {Math.min(currentIndex + 1, Math.max(words.length, 1))} / {Math.max(words.length, 1)}
          </p>
          <button
            onClick={() => setCurrentIndex((prev) => Math.min(words.length - 1, prev + 1))}
            className="px-3 py-1.5 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200"
          >
            Next Word
          </button>
        </div>

        <div className="mb-5 p-6 rounded-lg border border-gray-700 bg-gray-900/40 text-center min-h-32 flex items-center justify-center">
          <span
            style={{
              color: styleForm.color,
              fontSize: `${styleForm.fontSize}px`,
              fontWeight: styleForm.bold ? 700 : 400,
              fontStyle: styleForm.italic ? 'italic' : 'normal',
              fontFamily: styleForm.fontFamily,
            }}
            className="leading-none"
          >
            {currentWord}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Color</label>
            <input
              type="color"
              value={styleForm.color}
              onChange={(e) => updateCurrentWordStyle({ color: e.target.value })}
              className="w-full h-10 rounded bg-gray-700 border border-gray-600"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Font Size: {styleForm.fontSize}px</label>
            <input
              type="range"
              min="24"
              max="100"
              step="1"
              value={styleForm.fontSize}
              onChange={(e) => updateCurrentWordStyle({ fontSize: Number(e.target.value) })}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Font Family</label>
            <select
              value={styleForm.fontFamily}
              onChange={(e) => updateCurrentWordStyle({ fontFamily: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-100"
            >
              {FONT_OPTIONS.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-4 pb-2">
            <label className="inline-flex items-center gap-2 text-gray-300">
              <input
                type="checkbox"
                checked={styleForm.bold}
                onChange={(e) => updateCurrentWordStyle({ bold: e.target.checked })}
              />
              Bold
            </label>
            <label className="inline-flex items-center gap-2 text-gray-300">
              <input
                type="checkbox"
                checked={styleForm.italic}
                onChange={(e) => updateCurrentWordStyle({ italic: e.target.checked })}
              />
              Italic
            </label>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={clearCurrentWordStyle}
            className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200"
          >
            Clear Current Word
          </button>
          <button
            onClick={saveAllStyles}
            disabled={saving}
            className="px-4 py-2 rounded-md bg-green-700 hover:bg-green-600 text-white font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save All Flash Styles'}
          </button>
        </div>
      </div>

      {message && (
        <div className="p-3 rounded-md bg-green-900/30 border border-green-700 text-green-300">{message}</div>
      )}
      {error && (
        <div className="p-3 rounded-md bg-red-900/30 border border-red-700 text-red-300">{error}</div>
      )}
    </section>
  )
}

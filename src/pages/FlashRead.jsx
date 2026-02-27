import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

const DEFAULT_WPM = 300

function extractWords(text) {
  if (!text) return []

  const withoutImages = text.replace(/!\[(.*?)\]\((.*?)\)/g, ' $1 ')
  const withoutHtml = withoutImages.replace(/<[^>]+>/g, ' ')

  return withoutHtml
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
}

export default function FlashRead() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [wordIndex, setWordIndex] = useState(0)
  const [wpm, setWpm] = useState(DEFAULT_WPM)

  const intervalRef = useRef(null)

  useEffect(() => {
    async function loadPost() {
      try {
        const res = await fetch(`/api/posts/${id}`)
        if (!res.ok) throw new Error('Failed to load post')
        const data = await res.json()
        setPost(data.post)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadPost()
  }, [id])

  const words = useMemo(() => extractWords(post?.body), [post?.body])
  const delay = Math.max(50, Math.floor(60000 / wpm))

  useEffect(() => {
    if (!isPlaying || words.length === 0) return

    if (wordIndex >= words.length - 1) {
      setIsPlaying(false)
      return
    }

    intervalRef.current = setInterval(() => {
      setWordIndex((prev) => {
        if (prev >= words.length - 1) {
          setIsPlaying(false)
          return prev
        }
        return prev + 1
      })
    }, delay)

    return () => {
      clearInterval(intervalRef.current)
    }
  }, [isPlaying, delay, words.length, wordIndex])

  function stepBackward() {
    setWordIndex((prev) => Math.max(0, prev - 1))
  }

  function stepForward() {
    setWordIndex((prev) => Math.min(words.length - 1, prev + 1))
  }

  if (loading) {
    return (
      <section className="min-h-screen flex items-center justify-center px-4">
        <p className="text-gray-400">Loading flash reader…</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="min-h-screen flex flex-col items-center justify-center px-4 gap-4">
        <p className="text-red-400">{error}</p>
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-100"
        >
          Back to Read
        </button>
      </section>
    )
  }

  return (
    <section className="min-h-screen flex flex-col px-4 py-6">
      <div className="flex items-center justify-between max-w-4xl mx-auto w-full">
        <button
          onClick={() => navigate('/')}
          className="text-sm text-pink-400 hover:text-pink-300 transition"
        >
          &larr; Back to Read
        </button>
        <h1 className="text-base md:text-lg font-semibold text-gray-200 truncate max-w-[60%]">
          {post?.title}
        </h1>
        <span className="text-sm text-gray-400">{wordIndex + 1}/{Math.max(words.length, 1)}</span>
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="h-20 flex items-center justify-center">
            <span className="text-4xl md:text-6xl font-bold text-gray-100 tracking-wide">
              {words[wordIndex] || 'No words available'}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto w-full pb-4">
        <div className="mb-4">
          <label className="block text-xs text-gray-400 mb-2">Speed: {wpm} WPM</label>
          <input
            type="range"
            min="120"
            max="700"
            step="10"
            value={wpm}
            onChange={(e) => setWpm(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div className="rounded-xl border border-gray-700 bg-gray-800/70 p-3">
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={stepBackward}
              className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-100 font-medium"
            >
              ⏮ Back
            </button>
            <button
              onClick={() => setIsPlaying((prev) => !prev)}
              disabled={words.length === 0}
              className="px-5 py-2 rounded-md bg-pink-600 hover:bg-pink-700 text-white font-semibold disabled:opacity-50"
            >
              {isPlaying ? '⏸ Pause' : '▶ Play'}
            </button>
            <button
              onClick={stepForward}
              className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-100 font-medium"
            >
              Next ⏭
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

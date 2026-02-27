import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FaBackward, FaForward, FaPause, FaPlay } from 'react-icons/fa'
import { extractFlashWords } from '../utils/flashWords'

const FIXED_WPM = 300
const AUTO_HIDE_MS = 2500
const STYLE_KEYS = ['color', 'fontSize', 'rotation', 'fontWeight', 'fontStyle', 'fontFamily', 'fontUrl']

function normalizeWordStyle(wordStyle) {
  if (!wordStyle || typeof wordStyle !== 'object') {
    return { base: {}, segments: [] }
  }

  const baseFromRoot = {}
  STYLE_KEYS.forEach((key) => {
    if (wordStyle[key] !== undefined) {
      baseFromRoot[key] = wordStyle[key]
    }
  })

  const base = {
    ...(wordStyle.base && typeof wordStyle.base === 'object' ? wordStyle.base : {}),
    ...baseFromRoot,
  }

  const segments = Array.isArray(wordStyle.segments)
    ? wordStyle.segments
        .filter((segment) => segment && typeof segment === 'object')
        .map((segment) => ({
          start: Number(segment.start),
          end: Number(segment.end),
          style: segment.style && typeof segment.style === 'object' ? segment.style : {},
        }))
        .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start)
    : []

  return { base, segments }
}

function buildInlineStyle(style = {}) {
  return {
    color: style.color,
    fontSize: style.fontSize ? `${style.fontSize}px` : undefined,
    transform: style.rotation !== undefined ? `rotate(${style.rotation}deg)` : undefined,
    display: style.rotation !== undefined ? 'inline-block' : undefined,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    fontFamily: style.fontFamily,
  }
}

function collectGoogleFontUrls(wordStyles = {}) {
  const urls = new Set()

  Object.values(wordStyles).forEach((styleConfig) => {
    const { base, segments } = normalizeWordStyle(styleConfig)
    if (base.fontUrl) urls.add(base.fontUrl)

    segments.forEach((segment) => {
      if (segment.style?.fontUrl) {
        urls.add(segment.style.fontUrl)
      }
    })
  })

  return Array.from(urls)
}

export default function FlashRead() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  const [wordIndex, setWordIndex] = useState(0)
  const [showBottomControls, setShowBottomControls] = useState(true)

  const intervalRef = useRef(null)
  const hideControlsTimeoutRef = useRef(null)
  const wasPlayingBeforeScrubRef = useRef(false)

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

  const words = useMemo(() => extractFlashWords(post?.body), [post?.body])
  const currentWordStyle = post?.flashPresentation?.wordStyles?.[wordIndex] || {}
  const currentWord = words[wordIndex] || 'No words available'
  const effectiveWpm =
    Number.isFinite(Number(post?.flashPresentation?.wpm)) && Number(post?.flashPresentation?.wpm) > 0
      ? Number(post.flashPresentation.wpm)
      : FIXED_WPM
  const delay = Math.max(50, Math.floor(60000 / effectiveWpm))

  useEffect(() => {
    const urls = collectGoogleFontUrls(post?.flashPresentation?.wordStyles || {})

    urls.forEach((url) => {
      const selector = `link[data-google-font-url="${url.replace(/"/g, '\\"')}"]`
      const exists = document.head.querySelector(selector)
      if (!exists) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = url
        link.setAttribute('data-google-font-url', url)
        document.head.appendChild(link)
      }
    })
  }, [post])

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

  useEffect(() => {
    if (!isPlaying) {
      setShowBottomControls(true)
    }
  }, [isPlaying])

  useEffect(() => {
    return () => {
      if (hideControlsTimeoutRef.current) {
        clearTimeout(hideControlsTimeoutRef.current)
      }
    }
  }, [])

  function clearHideControlsTimer() {
    if (hideControlsTimeoutRef.current) {
      clearTimeout(hideControlsTimeoutRef.current)
      hideControlsTimeoutRef.current = null
    }
  }

  function startHideControlsTimer() {
    clearHideControlsTimer()
    if (!isPlaying) return

    hideControlsTimeoutRef.current = setTimeout(() => {
      setShowBottomControls(false)
    }, AUTO_HIDE_MS)
  }

  function handleUserInteraction() {
    setShowBottomControls(true)
    startHideControlsTimer()
  }

  function handleCenterClick(e) {
    // if (!isPlaying) return

    e.stopPropagation()

    setShowBottomControls((prev) => {
      const next = !prev
      if (next) {
        startHideControlsTimer()
      } else {
        clearHideControlsTimer()
      }
      return next
    })
  }

  function stepBackward() {
    setWordIndex((prev) => Math.max(0, prev - 1))
  }

  function stepForward() {
    setWordIndex((prev) => Math.min(words.length - 1, prev + 1))
  }

  function handleScrubStart() {
    wasPlayingBeforeScrubRef.current = isPlaying
    setIsPlaying(false)
    clearHideControlsTimer()
    setShowBottomControls(true)
  }

  function handleScrubChange(e) {
    setWordIndex(Number(e.target.value))
  }

  function handleScrubEnd() {
    if (wasPlayingBeforeScrubRef.current && wordIndex < words.length - 1) {
      setIsPlaying(true)
      startHideControlsTimer()
    }
    wasPlayingBeforeScrubRef.current = false
  }

  useEffect(() => {
    if (isPlaying) {
      startHideControlsTimer()
    } else {
      clearHideControlsTimer()
      setShowBottomControls(true)
    }
  }, [isPlaying])

  function renderStyledCurrentWord(word, styleConfig) {
    const { base, segments } = normalizeWordStyle(styleConfig)
    if (!word) return null

    if (segments.length === 0) {
      return (
        <span className="leading-none" style={buildInlineStyle(base)}>
          {word}
        </span>
      )
    }

    return word.split('').map((char, index) => {
      let mergedStyle = { ...base }
      segments.forEach((segment) => {
        if (index >= segment.start && index < segment.end) {
          mergedStyle = { ...mergedStyle, ...segment.style }
        }
      })

      return (
        <span key={`${char}-${index}`} className="leading-none inline-block" style={buildInlineStyle(mergedStyle)}>
          {char}
        </span>
      )
    })
  }

  if (loading) {
    return (
      <section className="min-h-screen flex items-center justify-center px-3 sm:px-4">
        <p className="text-gray-400">Loading flash reader…</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="min-h-screen flex flex-col items-center justify-center px-3 sm:px-4 gap-4">
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
    <section
      onMouseMove={handleUserInteraction}
      onClick={handleUserInteraction}
      onTouchStart={handleUserInteraction}
      className="min-h-screen flex flex-col px-3 sm:px-4 py-6"
    >
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

      <div
        onClick={handleCenterClick}
        className={`flex-1 flex items-center justify-center ${isPlaying ? 'cursor-pointer' : ''}`}
      >
        <div className="text-center">
          <div className="h-20 flex items-center justify-center">
            <span className="text-4xl md:text-6xl font-bold text-gray-100 tracking-wide">
              {renderStyledCurrentWord(currentWord, currentWordStyle)}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto w-full pb-4 h-40 relative">
        <div
          className={`absolute inset-x-0 bottom-4 transition-all transform
            ${showBottomControls 
              ? 'opacity-100 pointer-events-auto duration-250 ease-out' 
              : 'opacity-0 pointer-events-none duration-200 ease-in'
            }`}
        >
          <div className="mb-4">
            <label className="block text-xs text-gray-400 mb-2">
              Progress: {wordIndex + 1} / {Math.max(words.length, 1)}
            </label>
            <input
              type="range"
              min={0}
              max={Math.max(words.length - 1, 0)}
              step={1}
              value={Math.min(wordIndex, Math.max(words.length - 1, 0))}
              onPointerDown={handleScrubStart}
              onPointerUp={handleScrubEnd}
              onTouchStart={handleScrubStart}
              onTouchEnd={handleScrubEnd}
              onMouseDown={handleScrubStart}
              onMouseUp={handleScrubEnd}
              onChange={handleScrubChange}
              disabled={words.length === 0}
              className="w-full"
            />
          </div>

          <div className="rounded-xl border border-gray-700 bg-gray-800/70 p-3">
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={stepBackward}
                aria-label="Back"
                className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-100 font-medium"
              >
                <FaBackward />
              </button>
              <button
                onClick={() => setIsPlaying((prev) => !prev)}
                disabled={words.length === 0}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="px-5 py-2 rounded-md bg-pink-600 hover:bg-pink-700 text-white font-semibold disabled:opacity-50"
              >
                {isPlaying ? <FaPause /> : <FaPlay />}
              </button>
              <button
                onClick={stepForward}
                aria-label="Next"
                className="px-4 py-2 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-100 font-medium"
              >
                <FaForward />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

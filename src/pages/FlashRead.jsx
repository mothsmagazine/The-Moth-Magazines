import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FaBackward, FaForward, FaPause, FaPlay } from 'react-icons/fa'
import { extractFlashWords } from '../utils/flashWords'

const FIXED_WPM = 300
const AUTO_HIDE_MS = 2500
const SPRITZ_LEFT_COL_CH = 8
const SPRITZ_GUIDE_OFFSET_PX = 80
const DEFAULT_PIVOT_COLOR = '#ec4899'
function getThemeSafeDefaultWordColor() {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return '#e5e7eb'
  }
  return '#111827'
}

const DEFAULT_WORD_COLOR = getThemeSafeDefaultWordColor()

const STYLE_KEYS = [
  'pivotColor',
  'wordColor',
  'pivotIndexOneBased',
  'pivotLetter',
  'fontSize',
  'rotation',
  'fontWeight',
  'fontStyle',
  'fontFamily',
  'fontUrl',
]

function normalizeWordStyle(wordStyle) {
  if (!wordStyle || typeof wordStyle !== 'object') {
    return { base: {} }
  }

  const baseFromRoot = {}
  STYLE_KEYS.forEach((key) => {
    if (wordStyle[key] !== undefined) {
      baseFromRoot[key] = wordStyle[key]
    }
  })

  return {
    base: {
      ...(wordStyle.base && typeof wordStyle.base === 'object' ? wordStyle.base : {}),
      ...baseFromRoot,
    },
  }
}

function buildTextStyle(base = {}) {
  return {
    fontSize: Number(base.fontSize) ? `${Number(base.fontSize)}px` : undefined,
    transform: base.rotation !== undefined ? `rotate(${Number(base.rotation) || 0}deg)` : undefined,
    display: base.rotation !== undefined ? 'inline-block' : undefined,
    fontWeight: base.fontWeight,
    fontStyle: base.fontStyle,
    fontFamily: base.fontFamily,
  }
}

function getPivotIndex(word, pivotIndexOneBased = '', legacyPivotLetter = '') {
  const asNumber = Number(pivotIndexOneBased)
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= word.length) {
    return asNumber - 1
  }

  const normalizedLegacyLetter =
    typeof legacyPivotLetter === 'string' ? legacyPivotLetter.trim().charAt(0) : ''
  if (normalizedLegacyLetter) {
    const matchedIndex = word.toLowerCase().indexOf(normalizedLegacyLetter.toLowerCase())
    if (matchedIndex >= 0) {
      return matchedIndex
    }
  }

  const length = word.length
  if (length <= 2) return 0
  if (length <= 5) return 1
  if (length <= 9) return 2
  if (length <= 13) return 3
  return 4
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
  const lastCenterTouchAtRef = useRef(0)

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
  const currentWord = words[wordIndex] || 'No words available'
  const currentWordStyle = normalizeWordStyle(post?.flashPresentation?.wordStyles?.[wordIndex]).base
  const effectiveWpm =
    Number.isFinite(Number(post?.flashPresentation?.wpm)) && Number(post?.flashPresentation?.wpm) > 0
      ? Number(post.flashPresentation.wpm)
      : FIXED_WPM
  const pivotColor =
    typeof currentWordStyle.pivotColor === 'string' && currentWordStyle.pivotColor.trim()
      ? currentWordStyle.pivotColor
      : typeof post?.flashPresentation?.pivotColor === 'string' && post.flashPresentation.pivotColor.trim()
        ? post.flashPresentation.pivotColor
        : DEFAULT_PIVOT_COLOR
  const wordColor =
    typeof currentWordStyle.wordColor === 'string' && currentWordStyle.wordColor.trim()
      ? currentWordStyle.wordColor
      : typeof post?.flashPresentation?.wordColor === 'string' && post.flashPresentation.wordColor.trim()
        ? post.flashPresentation.wordColor
        : DEFAULT_WORD_COLOR
  const textStyle = buildTextStyle(currentWordStyle)
  const delay = Math.max(50, Math.floor(60000 / effectiveWpm))

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
    if (Date.now() - lastCenterTouchAtRef.current < 500) {
      return
    }

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

  function handleCenterTouchEnd(e) {
    e.preventDefault()
    e.stopPropagation()

    lastCenterTouchAtRef.current = Date.now()

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

  function renderSpritzWord(word) {
    if (!word) return null

    const pivotIndex = getPivotIndex(word, currentWordStyle.pivotIndexOneBased, currentWordStyle.pivotLetter)
    const left = word.slice(0, pivotIndex)
    const pivot = word.charAt(pivotIndex)
    const right = word.slice(pivotIndex + 1)

    return (
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center w-full max-w-lg">
        <span
          className="justify-self-end text-right"
          style={{ ...textStyle, minWidth: `${SPRITZ_LEFT_COL_CH}ch`, color: wordColor }}
        >
          {left}
        </span>
        <span className='z-100' style={{ ...textStyle, color: pivotColor, backgroundColor: 'var(--bg)' }}>
          {pivot}
        </span>
        <span className="justify-self-start text-left" style={{ ...textStyle, color: wordColor }}>
          {right}
        </span>
      </div>
    )
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
      className="fixed inset-0 overflow-hidden px-3 sm:px-4 py-6"
    >
      <div className="absolute top-6 inset-x-0 z-20 px-3 sm:px-4">
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
      </div>

      <div
        onClick={handleCenterClick}
        onTouchEnd={handleCenterTouchEnd}
        className={`absolute inset-0 flex items-center justify-center ${isPlaying ? 'cursor-pointer' : ''}`}
      >
        <div className="pointer-events-none absolute inset-0 z-0">
          <span
            className="absolute left-0 right-0 h-px bg-gray-500/70"
            style={{ top: `calc(50% - ${SPRITZ_GUIDE_OFFSET_PX}px)` }}
          />
          <span
            className="absolute left-0 right-0 h-px bg-gray-500/70"
            style={{ top: `calc(50% + ${SPRITZ_GUIDE_OFFSET_PX}px)` }}
          />
          <span 
            className="absolute left-1/2 -translate-x-1/2 w-px bg-gray-500/70" 
            style={{ top: `calc(50% - ${SPRITZ_GUIDE_OFFSET_PX}px)`, height: `${SPRITZ_GUIDE_OFFSET_PX * 2}px` }}
          />
        </div>

        <div className="overflow-visible w-full flex justify-center px-2">
          <div className="h-20 flex items-center justify-center overflow-visible text-4xl md:text-6xl font-bold text-gray-100 tracking-wide font-mono">
            {renderSpritzWord(currentWord)}
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 px-3 sm:px-4 pb-4 h-40">
        <div className="max-w-3xl mx-auto w-full relative h-full">
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
      </div>
    </section>
  )
}

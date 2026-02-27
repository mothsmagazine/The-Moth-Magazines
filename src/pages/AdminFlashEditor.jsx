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

function parseGoogleFontFamily(url) {
  try {
    const parsed = new URL(url)
    const familyParam = parsed.searchParams.get('family')
    if (!familyParam) return null

    const firstFamily = familyParam.split('|')[0]
    const rawName = firstFamily.split(':')[0]
    const decoded = decodeURIComponent(rawName).replace(/\+/g, ' ').trim()

    return decoded || null
  } catch {
    return null
  }
}

function extractGoogleFontStylesheetUrl(input) {
  // 1. Clean up the input: remove code blocks and handle smart quotes
  const raw = input
    .replace(/```[\s\S]*?\n?|```/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/&amp;/g, '&') // Normalize ampersands immediately
    .trim()

  if (!raw) return null

  // 2. Try to find a direct URL match first (this is the most reliable)
  // This regex specifically looks for the fonts.googleapis.com URL inside any text
  const directGoogleUrlMatch = raw.match(/https?:\/\/fonts\.googleapis\.com\/css2\?[^\s"'<>]+/i)
  if (directGoogleUrlMatch) {
    return directGoogleUrlMatch[0]
  }

  // 3. Robust DOM Parsing fallback
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(raw, 'text/html')
    // Look for any link tag that contains 'fonts.googleapis.com' in the href
    const links = Array.from(doc.querySelectorAll('link'))
    for (const link of links) {
      const href = link.getAttribute('href')
      if (href && href.includes('fonts.googleapis.com')) {
        return href
      }
    }
  } catch (e) {
    console.error("DOM Parsing failed", e)
  }

  // 4. Regex fallback for href specifically if DOMParser missed it
  const hrefMatch = raw.match(/href=["'](https?:\/\/fonts\.googleapis\.com\/[^"']+)["']/i)
  if (hrefMatch) {
    return hrefMatch[1]
  }

  return null
}

function collectCustomFontsFromWordStyles(wordStyles = {}) {
  const map = new Map()

  Object.values(wordStyles).forEach((styleConfig) => {
    const { base, segments } = normalizeWordStyle(styleConfig)

    if (base.fontUrl && base.fontFamily) {
      map.set(base.fontUrl, { family: base.fontFamily, url: base.fontUrl })
    }

    segments.forEach((segment) => {
      if (segment.style?.fontUrl && segment.style?.fontFamily) {
        map.set(segment.style.fontUrl, {
          family: segment.style.fontFamily,
          url: segment.style.fontUrl,
        })
      }
    })
  })

  return Array.from(map.values())
}

export default function AdminFlashEditor() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [post, setPost] = useState(null)
  const [wordStyles, setWordStyles] = useState({})
  const [savedWordStyles, setSavedWordStyles] = useState({})
  const [wpm, setWpm] = useState(300)
  const [savedWpm, setSavedWpm] = useState(300)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selectionRange, setSelectionRange] = useState({ start: 0, end: 0 })
  const [customFonts, setCustomFonts] = useState([])

  const [styleForm, setStyleForm] = useState({
    color: '#ffffff',
    fontSize: 56,
    rotation: 0,
    bold: false,
    italic: false,
    fontFamily: 'inherit',
    fontUrl: '',
  })

  const words = useMemo(() => extractFlashWords(post?.body), [post?.body])
  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(wordStyles) !== JSON.stringify(savedWordStyles) || wpm !== savedWpm,
    [wordStyles, savedWordStyles, wpm, savedWpm],
  )

  useEffect(() => {
    async function loadPost() {
      try {
        const res = await fetch(`/api/posts/${id}`)
        if (!res.ok) throw new Error('Failed to load post')

        const data = await res.json()
        const styles = data.post.flashPresentation?.wordStyles || {}
        const discoveredCustomFonts = collectCustomFontsFromWordStyles(styles)
        const loadedWpm =
          Number.isFinite(Number(data.post.flashPresentation?.wpm)) && Number(data.post.flashPresentation?.wpm) > 0
            ? Number(data.post.flashPresentation.wpm)
            : 300

        setPost(data.post)
        setWordStyles(styles)
        setSavedWordStyles(styles)
        setCustomFonts(discoveredCustomFonts)
        setWpm(loadedWpm)
        setSavedWpm(loadedWpm)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadPost()
  }, [id])

  useEffect(() => {
    const { base } = normalizeWordStyle(wordStyles[currentIndex])

    setStyleForm({
      color: base.color || '#ffffff',
      fontSize: Number(base.fontSize) || 56,
      rotation: Number(base.rotation) || 0,
      bold: base.fontWeight === '700',
      italic: base.fontStyle === 'italic',
      fontFamily: base.fontFamily || 'inherit',
      fontUrl: base.fontUrl || '',
    })
  }, [currentIndex, wordStyles])

  useEffect(() => {
    customFonts.forEach((font) => {
      if (!font.url) return
      const selector = `link[data-google-font-url="${font.url.replace(/"/g, '\\"')}"]`
      const exists = document.head.querySelector(selector)
      if (!exists) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = font.url
        link.setAttribute('data-google-font-url', font.url)
        document.head.appendChild(link)
      }
    })
  }, [customFonts])

  useEffect(() => {
    setSelectionRange({ start: 0, end: 0 })
  }, [currentIndex])

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

  useEffect(() => {
    if (!hasUnsavedChanges) return

    const lockUrl = window.location.href
    window.history.pushState({ flashEditorGuard: true }, '', lockUrl)

    const handlePopState = () => {
      window.history.pushState({ flashEditorGuard: true }, '', lockUrl)
      setError('You have unsaved changes. Save All Flash Styles before leaving this page.')
    }

    window.addEventListener('popstate', handlePopState)
    return () => {
      window.removeEventListener('popstate', handlePopState)
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

      const stylePatch = {
        color: nextForm.color,
        fontSize: Number(nextForm.fontSize),
        rotation: Number(nextForm.rotation) || 0,
        fontWeight: nextForm.bold ? '700' : '400',
        fontStyle: nextForm.italic ? 'italic' : 'normal',
        fontFamily: nextForm.fontFamily,
        fontUrl: nextForm.fontUrl || undefined,
      }

      setWordStyles((prevStyles) => ({
        ...prevStyles,
        [currentIndex]: (() => {
          const currentWord = words[currentIndex] || ''
          const { base, segments } = normalizeWordStyle(prevStyles[currentIndex])
          const hasSelection =
            selectionRange.end > selectionRange.start && selectionRange.start >= 0 && selectionRange.end <= currentWord.length

          if (!hasSelection) {
            return {
              base: { ...base, ...stylePatch },
              segments,
            }
          }

          const nextSegments = [
            ...segments.filter(
              (segment) => !(segment.start === selectionRange.start && segment.end === selectionRange.end),
            ),
            {
              start: selectionRange.start,
              end: selectionRange.end,
              style: stylePatch,
            },
          ]

          return {
            base,
            segments: nextSegments,
          }
        })(),
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

  function applyCurrentStyleToNextAndMove() {
    if (words.length === 0 || currentIndex >= words.length - 1) {
      setMessage('You are already at the last word.')
      return
    }

    const nextIndex = currentIndex + 1
    const nextStyle = {
      color: styleForm.color,
      fontSize: Number(styleForm.fontSize),
      rotation: Number(styleForm.rotation) || 0,
      fontWeight: styleForm.bold ? '700' : '400',
      fontStyle: styleForm.italic ? 'italic' : 'normal',
      fontFamily: styleForm.fontFamily,
      fontUrl: styleForm.fontUrl || undefined,
    }

    setWordStyles((prevStyles) => ({
      ...prevStyles,
      [nextIndex]: nextStyle,
    }))
    setCurrentIndex(nextIndex)
    setMessage(`Applied style to word #${nextIndex + 1} and moved forward.`)
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
            wpm,
            wordStyles,
          },
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save styles')
      }

      setSavedWordStyles({ ...wordStyles })
      setSavedWpm(wpm)
      setMessage('Flash styles saved successfully.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function addGoogleFontFromClipboard() {
    let clipboardText = ''

    try {
      clipboardText = await navigator.clipboard.readText()
    } catch {
      setError('Unable to read clipboard. Allow clipboard access and try again.')
      return
    }

    const extractedUrl = extractGoogleFontStylesheetUrl(clipboardText)
    if (!extractedUrl) {
      setError('Clipboard does not contain a valid Google Fonts URL or <link> code block.')
      return
    }

    const family = parseGoogleFontFamily(extractedUrl)
    if (!family) {
      setError('Could not extract font family. Paste a valid Google Fonts stylesheet link/code.')
      return
    }

    const fontItem = { family, url: extractedUrl }
    setCustomFonts((prev) => {
      if (prev.some((font) => font.url === extractedUrl)) return prev
      return [...prev, fontItem]
    })

    setError('')
    setMessage(`Added Google Font: ${family}`)
    setTimeout(() => setMessage(''), 3000);
    updateCurrentWordStyle({ fontFamily: family, fontUrl: extractedUrl })
  }

  const builtinOptions = FONT_OPTIONS.map((font) => ({
    key: `builtin:${font}`,
    label: font,
    family: font,
    url: '',
  }))
  const customOptions = customFonts.map((font) => ({
    key: `custom:${font.url}`,
    label: `${font.family} (Google Font)`,
    family: font.family,
    url: font.url,
  }))
  const fontOptions = [...builtinOptions, ...customOptions]
  const selectedFontKey = styleForm.fontUrl
    ? `custom:${styleForm.fontUrl}`
    : `builtin:${styleForm.fontFamily}`

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

  function renderStyledWordPreview(word, styleConfig) {
    const { base, segments } = normalizeWordStyle(styleConfig)
    if (!word) return null

    if (segments.length === 0) {
      return (
        <span style={buildInlineStyle(base)} className="leading-none inline-block">
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
        <span key={`${char}-${index}`} style={buildInlineStyle(mergedStyle)} className="leading-none inline-block">
          {char}
        </span>
      )
    })
  }

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
          <div className="break-all">{renderStyledWordPreview(currentWord, wordStyles[currentIndex])}</div>
        </div>

        <div className="mb-5">
          <label className="block text-sm text-gray-300 mb-1">Select part of current word (optional)</label>
          <input
            type="text"
            value={currentWord}
            readOnly
            onSelect={(e) => {
              const start = e.target.selectionStart ?? 0
              const end = e.target.selectionEnd ?? 0
              setSelectionRange({ start, end })
            }}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-100 font-mono"
          />
          <p className="text-xs text-gray-400 mt-1">
            {selectionRange.end > selectionRange.start
              ? `Selected characters: ${selectionRange.start + 1}-${selectionRange.end}`
              : 'No selection: style changes apply to the whole word.'}
          </p>
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
              max="180"
              step="1"
              value={styleForm.fontSize}
              onChange={(e) => updateCurrentWordStyle({ fontSize: Number(e.target.value) })}
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Flash Speed (WPM)</label>
            <input
              type="number"
              min="0"
              max="1600"
              step="10"
              value={wpm}
              onChange={(e) => {
                const next = Number(e.target.value)
                if (Number.isFinite(next)) {
                  setWpm(next)
                }
              }}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-100"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm text-gray-300">Rotation: {styleForm.rotation}°</label>
              <button
                type="button"
                onClick={() => updateCurrentWordStyle({ rotation: 0 })}
                className="text-xs px-2 py-1 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-200"
              >
                Reset 0°
              </button>
            </div>
            <input
              type="range"
              min="-180"
              max="180"
              step="1"
              value={styleForm.rotation}
              onChange={(e) => updateCurrentWordStyle({ rotation: Number(e.target.value) })}
              className="w-full"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1 gap-2">
              <label className="block text-sm text-gray-300">Font Family</label>
              <button
                type="button"
                onClick={addGoogleFontFromClipboard}
                className="px-3 py-2 rounded-md bg-indigo-700 hover:bg-indigo-600 text-white text-sm font-semibold whitespace-nowrap"
              >
                Add from Clipboard
              </button>
            </div>
            <select
              value={selectedFontKey}
              onChange={(e) => {
                const selected = fontOptions.find((option) => option.key === e.target.value)
                if (!selected) return
                updateCurrentWordStyle({
                  fontFamily: selected.family,
                  fontUrl: selected.url,
                })
              }}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-100"
            >
              {fontOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
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
            onClick={applyCurrentStyleToNextAndMove}
            className="px-4 py-2 rounded-md bg-indigo-700 hover:bg-indigo-600 text-white font-semibold"
          >
            Apply to Next + Move
          </button>
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

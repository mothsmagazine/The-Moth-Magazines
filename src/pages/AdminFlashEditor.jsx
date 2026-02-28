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
const DEFAULT_PIVOT_COLOR = '#ec4899'
function getThemeSafeDefaultWordColor() {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return '#e5e7eb'
  }
  return '#111827'
}

const DEFAULT_WORD_COLOR = getThemeSafeDefaultWordColor()
const DEFAULT_WPM = 300
const SPRITZ_LEFT_COL_CH = 8
const SPRITZ_GUIDE_OFFSET_PX = 80

function getPivotIndex(word, pivotIndexOneBased = '', legacyPivotLetter = '') {
  const asNumber = Number(pivotIndexOneBased)
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= word.length) {
    return asNumber - 1
  }

  const length = word.length
  if (length <= 1) return 0
  if (length <= 5) return 1
  if (length <= 9) return 2
  if (length <= 13) return 3
  return 4
}

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

  return {
    base: {
      ...(wordStyle.base && typeof wordStyle.base === 'object' ? wordStyle.base : {}),
      ...baseFromRoot,
    },
    segments: [],
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
  const raw = input
    .replace(/```[\s\S]*?\n?|```/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/&amp;/g, '&')
    .trim()

  if (!raw) return null

  const directGoogleUrlMatch = raw.match(/https?:\/\/fonts\.googleapis\.com\/css2\?[^\s"'<>]+/i)
  if (directGoogleUrlMatch) {
    return directGoogleUrlMatch[0]
  }

  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(raw, 'text/html')
    const links = Array.from(doc.querySelectorAll('link'))
    for (const link of links) {
      const href = link.getAttribute('href')
      if (href && href.includes('fonts.googleapis.com')) {
        return href
      }
    }
  } catch {
    return null
  }

  const hrefMatch = raw.match(/href=["'](https?:\/\/fonts\.googleapis\.com\/[^"']+)["']/i)
  if (hrefMatch) {
    return hrefMatch[1]
  }

  return null
}

function collectCustomFontsFromWordStyles(wordStyles = {}) {
  const map = new Map()

  Object.values(wordStyles).forEach((styleConfig) => {
    const { base } = normalizeWordStyle(styleConfig)
    if (base.fontUrl && base.fontFamily) {
      map.set(base.fontUrl, { family: base.fontFamily, url: base.fontUrl })
    }
  })

  return Array.from(map.values())
}

export default function AdminFlashEditor() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [post, setPost] = useState(null)
  const [wordStyles, setWordStyles] = useState({})
  const [savedWordStyles, setSavedWordStyles] = useState({})
  const [wpm, setWpm] = useState(DEFAULT_WPM)
  const [savedWpm, setSavedWpm] = useState(DEFAULT_WPM)
  const [fallbackPivotColor, setFallbackPivotColor] = useState(DEFAULT_PIVOT_COLOR)
  const [fallbackWordColor, setFallbackWordColor] = useState(DEFAULT_WORD_COLOR)
  const [applyToAllWords, setApplyToAllWords] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [customFonts, setCustomFonts] = useState([])

  const [styleForm, setStyleForm] = useState({
    pivotColor: DEFAULT_PIVOT_COLOR,
    wordColor: DEFAULT_WORD_COLOR,
    pivotIndexOneBased: '',
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
            : DEFAULT_WPM
        const loadedFallbackPivotColor =
          typeof data.post.flashPresentation?.pivotColor === 'string' && data.post.flashPresentation.pivotColor.trim()
            ? data.post.flashPresentation.pivotColor
            : DEFAULT_PIVOT_COLOR
        const loadedFallbackWordColor =
          typeof data.post.flashPresentation?.wordColor === 'string' && data.post.flashPresentation.wordColor.trim()
            ? data.post.flashPresentation.wordColor
            : DEFAULT_WORD_COLOR

        setPost(data.post)
        setWordStyles(styles)
        setSavedWordStyles(styles)
        setCustomFonts(discoveredCustomFonts)
        setWpm(loadedWpm)
        setSavedWpm(loadedWpm)
        setFallbackPivotColor(loadedFallbackPivotColor)
        setFallbackWordColor(loadedFallbackWordColor)
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
      pivotColor: base.pivotColor || fallbackPivotColor,
      wordColor: base.wordColor || fallbackWordColor,
      pivotIndexOneBased:
        Number.isInteger(Number(base.pivotIndexOneBased)) && Number(base.pivotIndexOneBased) > 0
          ? String(Number(base.pivotIndexOneBased))
          : '',
      fontSize: Number(base.fontSize) || 56,
      rotation: Number(base.rotation) || 0,
      bold: base.fontWeight === '700',
      italic: base.fontStyle === 'italic',
      fontFamily: base.fontFamily || 'inherit',
      fontUrl: base.fontUrl || '',
    })
  }, [currentIndex, wordStyles, fallbackPivotColor, fallbackWordColor])

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

  function buildStylePatch(form) {
    const pivotIndexValue = Number(form.pivotIndexOneBased)
    const hasValidPivotIndex = Number.isInteger(pivotIndexValue) && pivotIndexValue > 0

    return {
      pivotColor: form.pivotColor,
      wordColor: form.wordColor,
      pivotIndexOneBased: hasValidPivotIndex ? pivotIndexValue : undefined,
      pivotLetter: undefined,
      fontSize: Number(form.fontSize),
      rotation: Number(form.rotation) || 0,
      fontWeight: form.bold ? '700' : '400',
      fontStyle: form.italic ? 'italic' : 'normal',
      fontFamily: form.fontFamily,
      fontUrl: form.fontUrl || undefined,
    }
  }

  function updateWordStyles(changes) {
    setStyleForm((prevForm) => {
      const nextForm = { ...prevForm, ...changes }
      const stylePatch = buildStylePatch(nextForm)

      setWordStyles((prevStyles) => {
        if (words.length === 0) return prevStyles

        const nextStyles = { ...prevStyles }
        const targetIndices = applyToAllWords ? words.map((_, index) => index) : [currentIndex]

        targetIndices.forEach((targetIndex) => {
          const { base } = normalizeWordStyle(nextStyles[targetIndex])
          nextStyles[targetIndex] = {
            base: { ...base, ...stylePatch },
            segments: [],
          }
        })

        return nextStyles
      })

      return nextForm
    })
  }

  function clearCurrentWordStyle() {
    setWordStyles((prev) => {
      if (applyToAllWords) {
        return {}
      }

      const next = { ...prev }
      delete next[currentIndex]
      return next
    })

    setMessage(applyToAllWords ? 'Style cleared for all words.' : `Style cleared for word #${currentIndex + 1}`)
  }

  function applyCurrentStyleToNextAndMove() {
    if (words.length === 0 || currentIndex >= words.length - 1) {
      setMessage('You are already at the last word.')
      return
    }

    const nextIndex = currentIndex + 1
    const nextStylePatch = buildStylePatch(styleForm)

    setWordStyles((prevStyles) => {
      const nextStyles = { ...prevStyles }
      const { base } = normalizeWordStyle(nextStyles[nextIndex])
      nextStyles[nextIndex] = {
        base: { ...base, ...nextStylePatch },
        segments: [],
      }
      return nextStyles
    })

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
            pivotColor: fallbackPivotColor,
            wordColor: fallbackWordColor,
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
    setTimeout(() => setMessage(''), 3000)

    updateWordStyles({ fontFamily: family, fontUrl: extractedUrl })
  }

  function renderSpritzPreview(word) {
    if (!word) return null

    const pivotIndex = getPivotIndex(word, styleForm.pivotIndexOneBased)
    const left = word.slice(0, pivotIndex)
    const pivot = word.charAt(pivotIndex)
    const right = word.slice(pivotIndex + 1)

    const textStyle = buildTextStyle({
      fontSize: styleForm.fontSize,
      rotation: styleForm.rotation,
      fontWeight: styleForm.bold ? '700' : '400',
      fontStyle: styleForm.italic ? 'italic' : 'normal',
      fontFamily: styleForm.fontFamily,
    })

    return (
      <div className="relative w-full h-full flex items-center justify-center">
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

        <div className="relative z-10 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center w-full text-4xl md:text-6xl font-bold tracking-wide font-mono">
          <span
            className="justify-self-end text-right"
            style={{ ...textStyle, minWidth: `${SPRITZ_LEFT_COL_CH}ch`, color: styleForm.wordColor }}
          >
            {left}
          </span>
          <span className='z-100' style={{ ...textStyle, color: styleForm.pivotColor, backgroundColor: 'var(--bg)' }}>
            {pivot}
          </span>
          <span className="justify-self-start text-left" style={{ ...textStyle, color: styleForm.wordColor }}>
            {right}
          </span>
        </div>
      </div>
    )
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
  const selectedFontKey = styleForm.fontUrl ? `custom:${styleForm.fontUrl}` : `builtin:${styleForm.fontFamily}`

  if (loading) {
    return (
      <section className="max-w-3xl mx-auto py-10 px-3 sm:px-4">
        <p className="text-gray-400">Loading flash style editor…</p>
      </section>
    )
  }

  if (error && !post) {
    return (
      <section className="max-w-3xl mx-auto py-10 px-3 sm:px-4">
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
    <section className="max-w-4xl mx-auto py-10 px-3 sm:px-4 space-y-6">
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

        <div
          className="mb-5 rounded-lg border border-gray-700 text-center h-64 flex items-center justify-center overflow-hidden"
          style={{ backgroundColor: 'var(--bg)' }}
        >
          <div className="w-full h-full">{renderSpritzPreview(currentWord)}</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-300 mb-1">Pivot Highlight Color</label>
            <input
              type="color"
              value={styleForm.pivotColor}
              onChange={(e) => updateWordStyles({ pivotColor: e.target.value })}
              className="w-full h-10 rounded bg-gray-700 border border-gray-600"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">General Word Color</label>
            <input
              type="color"
              value={styleForm.wordColor}
              onChange={(e) => updateWordStyles({ wordColor: e.target.value })}
              className="w-full h-10 rounded bg-gray-700 border border-gray-600"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Highlight Letter Index</label>
            <input
              type="number"
              min="1"
              step="1"
              value={styleForm.pivotIndexOneBased}
              onChange={(e) => updateWordStyles({ pivotIndexOneBased: e.target.value })}
              placeholder="Auto"
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-100"
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
              onChange={(e) => updateWordStyles({ fontSize: Number(e.target.value) })}
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
                onClick={() => updateWordStyles({ rotation: 0 })}
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
              onChange={(e) => updateWordStyles({ rotation: Number(e.target.value) })}
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
                updateWordStyles({
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
                onChange={(e) => updateWordStyles({ bold: e.target.checked })}
              />
              Bold
            </label>
            <label className="inline-flex items-center gap-2 text-gray-300">
              <input
                type="checkbox"
                checked={styleForm.italic}
                onChange={(e) => updateWordStyles({ italic: e.target.checked })}
              />
              Italic
            </label>
            <label className="inline-flex items-center gap-2 text-gray-300">
              <input
                type="checkbox"
                checked={applyToAllWords}
                onChange={(e) => setApplyToAllWords(e.target.checked)}
              />
              Apply to All
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
            {applyToAllWords ? 'Clear All Words' : 'Clear Current Word'}
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

      {message && <div className="p-3 rounded-md bg-green-900/30 border border-green-700 text-green-300">{message}</div>}
      {error && <div className="p-3 rounded-md bg-red-900/30 border border-red-700 text-red-300">{error}</div>}
    </section>
  )
}

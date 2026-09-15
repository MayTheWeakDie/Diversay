import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import api from '../services/api'

const API_URL = (import.meta.env.VITE_API_URL && !import.meta.env.VITE_API_URL.includes('localhost'))
  ? import.meta.env.VITE_API_URL
  : `${window.location.protocol}//${window.location.hostname}:8000`

const MAX_IMAGES = 2

/**
 * ScanUploadPage — Mobile-optimized, standalone page for scanning documents via QR code.
 *
 * Supports uploading 1 or 2 images (e.g. two pages of the same invoice).
 * Both camera capture AND gallery/file selection are available.
 * Images are processed sequentially; results are merged server-side.
 */
export default function ScanUploadPage() {
  const { sessionId } = useParams()
  const [searchParams] = useSearchParams()
  const secret = searchParams.get('secret') || ''

  // Array of { file, preview } — up to MAX_IMAGES
  const [images, setImages] = useState([])
  const [status, setStatus] = useState('idle') // idle | processing | success | error | expired
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState('')
  const [activeSlot, setActiveSlot] = useState(null) // which slot the input is for (0 | 1)

  const cameraInputRef = useRef(null)
  const galleryInputRef = useRef(null)

  // Validate session on mount
  useEffect(() => {
    if (!sessionId || !secret) {
      setStatus('error')
      setError('Invalid scan link. Please scan the QR code again from the Diversay app.')
      return
    }
    const checkSession = async () => {
      try {
        const res = await fetch(`${API_URL}/scan-sessions/${sessionId}/result`)
        const data = await res.json()
        if (data.status === 'expired') {
          setStatus('expired')
          setError('This scan session has expired. Please generate a new QR code from the Diversay app.')
        } else if (data.status === 'completed') {
          setStatus('success')
          setStatusMessage('Document already processed! You can close this page.')
        }
      } catch { /* non-blocking */ }
    }
    checkSession()
  }, [sessionId, secret])

  const openPicker = useCallback((slot, mode) => {
    setActiveSlot(slot)
    if (mode === 'camera') {
      cameraInputRef.current?.click()
    } else {
      galleryInputRef.current?.click()
    }
  }, [])

  const handleFileSelected = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const preview = URL.createObjectURL(file)
    setImages(prev => {
      const next = [...prev]
      if (activeSlot !== null && activeSlot < next.length) {
        // Replace existing slot
        URL.revokeObjectURL(next[activeSlot].preview)
        next[activeSlot] = { file, preview }
      } else {
        next.push({ file, preview })
      }
      return next
    })
    setError('')
    // Reset input so same file can be selected again after removal
    e.target.value = ''
  }, [activeSlot])

  const removeImage = useCallback((idx) => {
    setImages(prev => {
      const next = [...prev]
      URL.revokeObjectURL(next[idx].preview)
      next.splice(idx, 1)
      return next
    })
  }, [])

  const handleProcess = useCallback(async () => {
    if (images.length === 0) return

    setStatus('processing')
    setError('')

    for (let i = 0; i < images.length; i++) {
      const { file } = images[i]
      const isLast = i === images.length - 1
      setStatusMessage(
        images.length > 1
          ? `Analyzing document ${i + 1} of ${images.length} with Gemini AI Vision...`
          : 'Uploading & analyzing document with Gemini AI Vision...'
      )

      const formData = new FormData()
      formData.append('file', file)
      formData.append('session_secret', secret)
      formData.append('is_last', isLast ? 'true' : 'false')

      try {
        const response = await fetch(`${API_URL}/scan-sessions/${sessionId}/process-image`, {
          method: 'POST',
          body: formData
        })

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}))
          if (response.status === 410) {
            setStatus('expired')
            setError('This scan session has expired. Please generate a new QR code.')
            return
          }
          if (response.status === 503) {
            setStatus('error')
            setError(`AI model temporarily busy on image ${i + 1}. Tap "Process Documents" to retry.`)
            return
          }
          throw new Error(errData.detail || `Failed to process image ${i + 1}.`)
        }
      } catch (err) {
        console.error('AI Vision processing failed:', err)
        setStatus('error')
        setError(err.message || 'Failed to process document image. Please try again.')
        return
      }
    }

    setStatus('success')
    setStatusMessage(
      images.length > 1
        ? 'Both documents processed! Data merged and sent to your computer.'
        : 'Document processed successfully!'
    )
  }, [images, sessionId, secret])

  const handleReset = useCallback(() => {
    images.forEach(img => URL.revokeObjectURL(img.preview))
    setImages([])
    setStatus('idle')
    setStatusMessage('')
    setError('')
  }, [images])

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={s.container}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bounceIn { 0% { opacity: 0; transform: scale(0.3); } 50% { opacity: 1; transform: scale(1.05); } 70% { transform: scale(0.9); } 100% { transform: scale(1); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes pulseGlow { 0%,100% { box-shadow: 0 0 20px rgba(16,185,129,0.2); } 50% { box-shadow: 0 0 40px rgba(16,185,129,0.4); } }
      `}</style>

      {/* Hidden file inputs */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
        onChange={handleFileSelected} style={{ display: 'none' }} />
      <input ref={galleryInputRef} type="file" accept="image/*"
        onChange={handleFileSelected} style={{ display: 'none' }} />

      {/* Header */}
      <div style={s.header}>
        <div style={s.headerInner}>
          <div style={s.logoBlock}>
            <div style={s.logoIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
              </svg>
            </div>
            <div>
              <div style={s.logoTitle}>Diversay</div>
              <div style={s.logoSubtitle}>Document Scanner</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={s.content}>

        {/* Expired */}
        {status === 'expired' && (
          <div style={{ ...s.card, animation: 'fadeInUp 0.4s ease' }}>
            <StatusIcon color="#ef4444" icon="x" />
            <h2 style={s.cardTitle}>Session Expired</h2>
            <p style={s.cardDesc}>{error}</p>
          </div>
        )}

        {/* Fatal error (no images yet) */}
        {status === 'error' && images.length === 0 && (
          <div style={{ ...s.card, animation: 'fadeInUp 0.4s ease' }}>
            <StatusIcon color="#ef4444" icon="warning" />
            <h2 style={s.cardTitle}>Invalid Link</h2>
            <p style={s.cardDesc}>{error}</p>
          </div>
        )}

        {/* Success */}
        {status === 'success' && (
          <div style={{ ...s.card, animation: 'fadeInUp 0.4s ease' }}>
            <div style={s.statusIconWrap}>
              <div style={{ ...s.statusIcon, background: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.25)', animation: 'bounceIn 0.6s ease, pulseGlow 2s infinite' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
            </div>
            <h2 style={{ ...s.cardTitle, color: '#10b981' }}>Document Processed!</h2>
            <p style={s.cardDesc}>
              {statusMessage || 'The extracted data has been sent to your computer. Check the Diversay app — your order form should be auto-filled now.'}
            </p>
            <p style={{ ...s.cardDesc, marginTop: '16px', fontSize: '13px', color: '#71717a' }}>
              You can safely close this page.
            </p>
          </div>
        )}

        {/* Processing */}
        {status === 'processing' && (
          <div style={{ ...s.card, animation: 'fadeInUp 0.4s ease' }}>
            <div style={s.statusIconWrap}>
              <div style={{ ...s.statusIcon, background: 'rgba(99,102,241,0.1)', borderColor: 'rgba(99,102,241,0.25)' }}>
                <div style={s.spinner}/>
              </div>
            </div>
            <h2 style={s.cardTitle}>Processing Document{images.length > 1 ? 's' : ''}</h2>
            <p style={s.cardDesc}>{statusMessage || 'Analyzing your document...'}</p>
            <div style={s.progressTrack}><div style={s.progressShimmer}/></div>
            <p style={{ ...s.cardDesc, marginTop: '12px', fontSize: '11px', color: '#71717a' }}>
              Please don't close this page.
            </p>
          </div>
        )}

        {/* Upload UI */}
        {(status === 'idle' || (status === 'error' && images.length > 0)) && (
          <div style={{ animation: 'fadeInUp 0.4s ease' }}>
            <div style={s.card}>
              <h2 style={s.cardTitle}>Upload Document Photo{images.length === MAX_IMAGES ? 's' : ''}</h2>
              <p style={s.cardDesc}>
                You can upload up to {MAX_IMAGES} images if the order spans two pages. Both will be analyzed and merged.
              </p>
            </div>

            {/* Image slots */}
            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {images.map((img, idx) => (
                <div key={idx} style={s.previewCard}>
                  <div style={s.previewLabel}>
                    <span style={s.previewBadge}>Page {idx + 1}</span>
                  </div>
                  <img src={img.preview} alt={`Document ${idx + 1}`} style={s.previewImage} />
                  <div style={s.previewActions}>
                    <button style={s.actionBtn} onClick={() => openPicker(idx, 'camera')}>
                      <CameraIcon /> Retake
                    </button>
                    <button style={s.actionBtn} onClick={() => openPicker(idx, 'gallery')}>
                      <GalleryIcon /> Replace
                    </button>
                    <button style={{ ...s.actionBtn, color: '#f87171' }} onClick={() => removeImage(idx)}>
                      <TrashIcon /> Remove
                    </button>
                  </div>
                </div>
              ))}

              {/* Add image slot */}
              {images.length < MAX_IMAGES && (
                <div>
                  {images.length === 0 ? (
                    // First slot — big upload zone
                    <div style={s.uploadZone}>
                      <div style={s.uploadIconWrap}>
                        <GalleryIcon size={36} color="#a1a1aa" />
                      </div>
                      <p style={s.uploadText}>Add a document photo</p>
                      <p style={s.uploadHint}>Supports JPG, PNG, HEIC</p>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '16px', justifyContent: 'center' }}>
                        <button style={s.pickerBtn} onClick={() => openPicker(null, 'camera')}>
                          <CameraIcon /> Camera
                        </button>
                        <button style={s.pickerBtn} onClick={() => openPicker(null, 'gallery')}>
                          <GalleryIcon /> Gallery
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Second slot — compact add button
                    <div>
                      <p style={{ fontSize: '12px', color: '#71717a', marginBottom: '8px', textAlign: 'center' }}>
                        Order spans a second page?
                      </p>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button style={{ ...s.pickerBtn, flex: 1 }} onClick={() => openPicker(null, 'camera')}>
                          <CameraIcon /> Snap Page 2
                        </button>
                        <button style={{ ...s.pickerBtn, flex: 1 }} onClick={() => openPicker(null, 'gallery')}>
                          <GalleryIcon /> Choose from Gallery
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Error banner */}
            {status === 'error' && error && (
              <div style={s.errorBanner}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Process button */}
            {images.length > 0 && (
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button style={s.processBtn} onClick={handleProcess}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                  Process Document{images.length > 1 ? 's' : ''} ({images.length})
                </button>
                {images.length > 0 && (
                  <button style={s.resetBtn} onClick={handleReset}>Start Over</button>
                )}
              </div>
            )}

            {/* Tips */}
            <div style={s.tipsCard}>
              <p style={s.tipsTitle}>📋 Tips for best results</p>
              <ul style={s.tipsList}>
                <li>Use good lighting — avoid harsh shadows</li>
                <li>Keep the document flat and fully visible</li>
                <li>Hold your phone steady and parallel to the paper</li>
                <li>Make sure all text is sharp and in focus</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={s.footer}><p>Diversay Solutions Limited</p></div>
    </div>
  )
}

// ─── Small icon components ───────────────────────────────────────────────────
function CameraIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  )
}

function GalleryIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  )
}

function TrashIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
      <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
    </svg>
  )
}

function StatusIcon({ color, icon }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
      <div style={{ width: '72px', height: '72px', borderRadius: '50%', border: `2px solid`, borderColor: color + '44', background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon === 'x' ? (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        ) : (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        )}
      </div>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = {
  container: { minHeight: '100vh', background: 'linear-gradient(180deg, #09090b 0%, #18181b 100%)', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: '#fafafa', display: 'flex', flexDirection: 'column' },
  header: { borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(9,9,11,0.8)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 50 },
  headerInner: { maxWidth: '480px', margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logoBlock: { display: 'flex', alignItems: 'center', gap: '12px' },
  logoIcon: { width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0 },
  logoTitle: { fontSize: '16px', fontWeight: '800', color: '#fafafa', letterSpacing: '-0.02em' },
  logoSubtitle: { fontSize: '11px', fontWeight: '500', color: '#71717a', letterSpacing: '0.02em' },
  content: { flex: 1, maxWidth: '480px', margin: '0 auto', width: '100%', padding: '20px' },
  card: { background: 'rgba(39,39,42,0.5)', border: '1px solid rgba(63,63,70,0.5)', borderRadius: '16px', padding: '24px', textAlign: 'center' },
  statusIconWrap: { display: 'flex', justifyContent: 'center', marginBottom: '20px' },
  statusIcon: { width: '72px', height: '72px', borderRadius: '50%', border: '2px solid', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: '20px', fontWeight: '700', color: '#fafafa', marginBottom: '8px', letterSpacing: '-0.02em' },
  cardDesc: { fontSize: '14px', color: '#a1a1aa', lineHeight: '1.6' },
  spinner: { width: '28px', height: '28px', border: '3px solid rgba(99,102,241,0.2)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' },
  progressTrack: { height: '4px', background: 'rgba(63,63,70,0.5)', borderRadius: '2px', marginTop: '20px', overflow: 'hidden' },
  progressShimmer: { height: '100%', width: '100%', background: 'linear-gradient(90deg, transparent, #6366f1, transparent)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', borderRadius: '2px' },
  uploadZone: { border: '2px dashed rgba(63,63,70,0.6)', borderRadius: '16px', padding: '36px 20px', textAlign: 'center', background: 'rgba(39,39,42,0.3)' },
  uploadIconWrap: { width: '64px', height: '64px', borderRadius: '16px', background: 'rgba(63,63,70,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' },
  uploadText: { fontSize: '15px', fontWeight: '600', color: '#d4d4d8', marginBottom: '4px' },
  uploadHint: { fontSize: '12px', color: '#71717a' },
  pickerBtn: { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '10px 16px', background: 'rgba(63,63,70,0.5)', border: '1px solid rgba(63,63,70,0.7)', borderRadius: '12px', color: '#d4d4d8', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' },
  previewCard: { borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(63,63,70,0.5)', background: 'rgba(39,39,42,0.5)', position: 'relative' },
  previewLabel: { padding: '10px 14px', borderBottom: '1px solid rgba(63,63,70,0.4)', display: 'flex', alignItems: 'center' },
  previewBadge: { fontSize: '11px', fontWeight: '700', color: '#a78bfa', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '6px', padding: '2px 8px', letterSpacing: '0.05em', textTransform: 'uppercase' },
  previewImage: { width: '100%', maxHeight: '280px', objectFit: 'contain', display: 'block', background: '#18181b' },
  previewActions: { display: 'flex', borderTop: '1px solid rgba(63,63,70,0.4)' },
  actionBtn: { flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', padding: '10px 8px', background: 'transparent', border: 'none', borderRight: '1px solid rgba(63,63,70,0.4)', color: '#a1a1aa', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', lastChild: { borderRight: 'none' } },
  errorBanner: { marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '12px', color: '#fca5a5', fontSize: '13px', lineHeight: '1.4' },
  processBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', padding: '16px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: '14px', color: 'white', fontSize: '16px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '-0.01em', boxShadow: '0 4px 24px rgba(99,102,241,0.3)' },
  resetBtn: { width: '100%', padding: '12px', background: 'transparent', border: '1px solid rgba(63,63,70,0.5)', borderRadius: '12px', color: '#71717a', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' },
  tipsCard: { marginTop: '20px', background: 'rgba(39,39,42,0.3)', border: '1px solid rgba(63,63,70,0.3)', borderRadius: '14px', padding: '16px 20px' },
  tipsTitle: { fontSize: '13px', fontWeight: '700', color: '#d4d4d8', marginBottom: '10px' },
  tipsList: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: '#71717a', lineHeight: '1.5' },
  footer: { padding: '20px', textAlign: 'center', fontSize: '11px', color: '#52525b', borderTop: '1px solid rgba(255,255,255,0.04)' },
}

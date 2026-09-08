import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { processDocumentImage, terminateWorker } from '../utils/ocrParser'
import api from '../services/api'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

/**
 * ScanUploadPage — Mobile-optimized, standalone page for scanning documents via QR code.
 * 
 * This page is accessed by scanning a QR code from the Diversay PC app.
 * It is NOT wrapped in ProtectedRoute — no auth required.
 * The session secret in the URL provides security.
 * 
 * Flow:
 * 1. User scans QR code → lands here with sessionId + secret
 * 2. User uploads/captures a photo of a printed document
 * 3. OCR runs client-side (Tesseract.js)
 * 4. Extracted data is POSTed to the backend scan session
 * 5. PC browser polls and receives the data
 */
export default function ScanUploadPage() {
  const { sessionId } = useParams()
  const [searchParams] = useSearchParams()
  const secret = searchParams.get('secret') || ''
  
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [status, setStatus] = useState('idle') // idle | processing | success | error | expired
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)
  
  // Validate session on mount
  useEffect(() => {
    if (!sessionId || !secret) {
      setStatus('error')
      setError('Invalid scan link. Please scan the QR code again from the Diversay app.')
      return
    }
    
    // Check if session is still valid
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
      } catch {
        // Session check failed — don't block the user
      }
    }
    checkSession()
    
    return () => {
      terminateWorker()
    }
  }, [sessionId, secret])
  
  const handleImageSelect = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setImageFile(file)
    setError('')
    
    // Create preview
    const url = URL.createObjectURL(file)
    setImagePreview(url)
    
    return () => URL.revokeObjectURL(url)
  }, [])
  
  const handleProcess = useCallback(async () => {
    if (!imageFile) return
    
    setStatus('processing')
    setError('')
    
    try {
      // Fetch products/customers for matching
      // We don't require auth here — we use the scan-sessions endpoint directly
      // The matching happens client-side using the data the PC already has
      // So we just do the OCR and send raw + parsed results
      
      setStatusMessage('Preparing image...')
      
      // Run OCR and parse
      const result = await processDocumentImage(
        imageFile,
        [], // No customer list on phone — PC will do the final matching
        [], // No product list on phone — PC will do the final matching  
        (msg) => setStatusMessage(msg)
      )
      
      setStatusMessage('Sending data to your computer...')
      
      // POST to backend scan session
      const response = await fetch(`${API_URL}/scan-sessions/${sessionId}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_secret: secret,
          extracted_data: {
            raw_text: result.raw_text,
            invoice_number: result.invoice_number,
            waybill_number: result.waybill_number,
            invoice_number_full: result.invoice_number_full,
            waybill_number_full: result.waybill_number_full,
            brand: result.brand,
            date: result.date,
            customer_name: result.parsed?.customer_name || result.customer?.name || '',
            customer_location: result.customer_location || '',
            customer_contact: result.customer_contact || '',
            products: (result.products && result.products.length > 0) ? result.products : (result.parsed?.products || [])
          }
        })
      })
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        if (response.status === 410) {
          setStatus('expired')
          setError('This scan session has expired. Please generate a new QR code.')
          return
        }
        throw new Error(errData.detail || 'Failed to submit scan results.')
      }
      
      setStatus('success')
      setStatusMessage('Document processed successfully!')
    } catch (err) {
      console.error('OCR processing failed:', err)
      setStatus('error')
      setError(err.message || 'Failed to process the document. Please try again.')
    }
  }, [imageFile, sessionId, secret])
  
  const handleRetry = useCallback(() => {
    setImageFile(null)
    setImagePreview(null)
    setStatus('idle')
    setStatusMessage('')
    setError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])
  
  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={styles.container}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.2); }
          50% { box-shadow: 0 0 40px rgba(16, 185, 129, 0.4); }
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes bounceIn {
          0% { opacity: 0; transform: scale(0.3); }
          50% { opacity: 1; transform: scale(1.05); }
          70% { transform: scale(0.9); }
          100% { transform: scale(1); }
        }
        
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
      
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.logoBlock}>
            <div style={styles.logoIcon}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <div>
              <div style={styles.logoTitle}>Diversay</div>
              <div style={styles.logoSubtitle}>Document Scanner</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div style={styles.content}>
        {/* Expired State */}
        {status === 'expired' && (
          <div style={{ ...styles.card, animation: 'fadeInUp 0.4s ease' }}>
            <div style={styles.statusIconWrap}>
              <div style={{ ...styles.statusIcon, background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.25)' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
              </div>
            </div>
            <h2 style={styles.cardTitle}>Session Expired</h2>
            <p style={styles.cardDesc}>{error}</p>
          </div>
        )}
        
        {/* Error State (invalid link) */}
        {status === 'error' && !imageFile && (
          <div style={{ ...styles.card, animation: 'fadeInUp 0.4s ease' }}>
            <div style={styles.statusIconWrap}>
              <div style={{ ...styles.statusIcon, background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.25)' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
              </div>
            </div>
            <h2 style={styles.cardTitle}>Invalid Link</h2>
            <p style={styles.cardDesc}>{error}</p>
          </div>
        )}
        
        {/* Success State */}
        {status === 'success' && (
          <div style={{ ...styles.card, animation: 'fadeInUp 0.4s ease' }}>
            <div style={styles.statusIconWrap}>
              <div style={{ ...styles.statusIcon, background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.25)', animation: 'bounceIn 0.6s ease, pulseGlow 2s infinite' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
            </div>
            <h2 style={{ ...styles.cardTitle, color: '#10b981' }}>Document Processed!</h2>
            <p style={styles.cardDesc}>
              The extracted data has been sent to your computer. Check the Diversay app — your order form should be auto-filled now.
            </p>
            <p style={{ ...styles.cardDesc, marginTop: '16px', fontSize: '13px', color: '#71717a' }}>
              You can safely close this page.
            </p>
          </div>
        )}
        
        {/* Processing State */}
        {status === 'processing' && (
          <div style={{ ...styles.card, animation: 'fadeInUp 0.4s ease' }}>
            <div style={styles.statusIconWrap}>
              <div style={{ ...styles.statusIcon, background: 'rgba(99, 102, 241, 0.1)', borderColor: 'rgba(99, 102, 241, 0.25)' }}>
                <div style={styles.spinner}></div>
              </div>
            </div>
            <h2 style={styles.cardTitle}>Processing Document</h2>
            <p style={styles.cardDesc}>{statusMessage || 'Analyzing your document...'}</p>
            
            {/* Progress bar shimmer */}
            <div style={styles.progressTrack}>
              <div style={styles.progressShimmer}></div>
            </div>
            
            <p style={{ ...styles.cardDesc, marginTop: '12px', fontSize: '11px', color: '#71717a' }}>
              This may take a few seconds. Please don't close this page.
            </p>
          </div>
        )}
        
        {/* Upload State (idle or error after attempt) */}
        {(status === 'idle' || (status === 'error' && imageFile)) && (
          <div style={{ animation: 'fadeInUp 0.4s ease' }}>
            {/* Instructions */}
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>Upload Document Photo</h2>
              <p style={styles.cardDesc}>
                Take a clear photo of the printed invoice or delivery note. Make sure the text is readable and the entire document is visible.
              </p>
            </div>
            
            {/* Upload Area */}
            <div style={{ marginTop: '16px' }}>
              {!imagePreview ? (
                <div style={styles.uploadZone} onClick={() => fileInputRef.current?.click()}>
                  <div style={styles.uploadIconWrap}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                      <circle cx="8.5" cy="8.5" r="1.5"></circle>
                      <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                  </div>
                  <p style={styles.uploadText}>Tap to take a photo or choose from gallery</p>
                  <p style={styles.uploadHint}>Supports JPG, PNG, HEIC</p>
                </div>
              ) : (
                <div style={styles.previewCard}>
                  <img 
                    src={imagePreview} 
                    alt="Document preview" 
                    style={styles.previewImage}
                  />
                  <button 
                    style={styles.changeBtn}
                    onClick={() => {
                      handleRetry()
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10"></polyline>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                    Change Photo
                  </button>
                </div>
              )}
              
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageSelect}
                style={{ display: 'none' }}
              />
            </div>
            
            {/* Error message */}
            {status === 'error' && error && (
              <div style={styles.errorBanner}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>{error}</span>
              </div>
            )}
            
            {/* Action Buttons */}
            {imagePreview && (
              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <button 
                  style={styles.processBtn}
                  onClick={handleProcess}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                  </svg>
                  Process Document
                </button>
              </div>
            )}
            
            {/* Tips */}
            <div style={styles.tipsCard}>
              <p style={styles.tipsTitle}>📋 Tips for best results</p>
              <ul style={styles.tipsList}>
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
      <div style={styles.footer}>
        <p>Diversay Solutions Limited</p>
      </div>
    </div>
  )
}


// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #09090b 0%, #18181b 100%)',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: '#fafafa',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(9, 9, 11, 0.8)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    position: 'sticky',
    top: 0,
    zIndex: 50,
  },
  headerInner: {
    maxWidth: '480px',
    margin: '0 auto',
    padding: '14px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoBlock: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  logoIcon: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    flexShrink: 0,
  },
  logoTitle: {
    fontSize: '16px',
    fontWeight: '800',
    color: '#fafafa',
    letterSpacing: '-0.02em',
  },
  logoSubtitle: {
    fontSize: '11px',
    fontWeight: '500',
    color: '#71717a',
    letterSpacing: '0.02em',
  },
  content: {
    flex: 1,
    maxWidth: '480px',
    margin: '0 auto',
    width: '100%',
    padding: '20px',
  },
  card: {
    background: 'rgba(39, 39, 42, 0.5)',
    border: '1px solid rgba(63, 63, 70, 0.5)',
    borderRadius: '16px',
    padding: '24px',
    textAlign: 'center',
  },
  statusIconWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '20px',
  },
  statusIcon: {
    width: '72px',
    height: '72px',
    borderRadius: '50%',
    border: '2px solid',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#fafafa',
    marginBottom: '8px',
    letterSpacing: '-0.02em',
  },
  cardDesc: {
    fontSize: '14px',
    color: '#a1a1aa',
    lineHeight: '1.6',
  },
  spinner: {
    width: '28px',
    height: '28px',
    border: '3px solid rgba(99, 102, 241, 0.2)',
    borderTopColor: '#6366f1',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  progressTrack: {
    height: '4px',
    background: 'rgba(63, 63, 70, 0.5)',
    borderRadius: '2px',
    marginTop: '20px',
    overflow: 'hidden',
  },
  progressShimmer: {
    height: '100%',
    width: '100%',
    background: 'linear-gradient(90deg, transparent, #6366f1, transparent)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite',
    borderRadius: '2px',
  },
  uploadZone: {
    border: '2px dashed rgba(63, 63, 70, 0.6)',
    borderRadius: '16px',
    padding: '40px 20px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    background: 'rgba(39, 39, 42, 0.3)',
  },
  uploadIconWrap: {
    width: '64px',
    height: '64px',
    borderRadius: '16px',
    background: 'rgba(63, 63, 70, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
  },
  uploadText: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#d4d4d8',
    marginBottom: '4px',
  },
  uploadHint: {
    fontSize: '12px',
    color: '#71717a',
  },
  previewCard: {
    borderRadius: '16px',
    overflow: 'hidden',
    border: '1px solid rgba(63, 63, 70, 0.5)',
    background: 'rgba(39, 39, 42, 0.5)',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    maxHeight: '320px',
    objectFit: 'contain',
    display: 'block',
    background: '#18181b',
  },
  changeBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    justifyContent: 'center',
    width: '100%',
    padding: '12px',
    background: 'transparent',
    border: 'none',
    borderTop: '1px solid rgba(63, 63, 70, 0.5)',
    color: '#a1a1aa',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  errorBanner: {
    marginTop: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    background: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '12px',
    color: '#fca5a5',
    fontSize: '13px',
    lineHeight: '1.4',
  },
  processBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: '100%',
    padding: '16px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    border: 'none',
    borderRadius: '14px',
    color: 'white',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '-0.01em',
    boxShadow: '0 4px 24px rgba(99, 102, 241, 0.3)',
    transition: 'all 0.2s ease',
  },
  tipsCard: {
    marginTop: '20px',
    background: 'rgba(39, 39, 42, 0.3)',
    border: '1px solid rgba(63, 63, 70, 0.3)',
    borderRadius: '14px',
    padding: '16px 20px',
  },
  tipsTitle: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#d4d4d8',
    marginBottom: '10px',
  },
  tipsList: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '12px',
    color: '#71717a',
    lineHeight: '1.5',
  },
  footer: {
    padding: '20px',
    textAlign: 'center',
    fontSize: '11px',
    color: '#52525b',
    borderTop: '1px solid rgba(255,255,255,0.04)',
  },
}

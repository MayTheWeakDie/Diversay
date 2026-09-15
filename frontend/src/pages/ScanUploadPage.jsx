import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import api from '../services/api'

const API_URL = (import.meta.env.VITE_API_URL && !import.meta.env.VITE_API_URL.includes('localhost') && !import.meta.env.VITE_API_URL.includes('127.0.0.1'))
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : window.location.origin

export default function ScanUploadPage() {
  const { sessionId } = useParams()
  const [searchParams] = useSearchParams()
  const secret = searchParams.get('secret')

  // Array of order items in the batch
  const [orders, setOrders] = useState([
    {
      id: 'order-' + Date.now(),
      orderIndex: 0,
      title: 'Order #1',
      images: [null, null], // Page 1 & Page 2 slots
      status: 'idle', // 'idle' | 'uploading' | 'scanned' | 'error'
      data: null,
      errorMsg: ''
    }
  ])
  const [activeOrderIdx, setActiveOrderIdx] = useState(0)

  // Input refs: map key `orderIdx-slotIdx-type` -> ref
  const cameraInputRefs = useRef({})
  const galleryInputRefs = useRef({})

  const [sessionValid, setSessionValid] = useState(true)
  const [sessionChecking, setSessionChecking] = useState(true)
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false)
  const [batchProgressMsg, setBatchProgressMsg] = useState('')
  const [batchComplete, setBatchComplete] = useState(false)
  const [globalError, setGlobalError] = useState('')

  // Verify scan session on mount
  useEffect(() => {
    if (!sessionId || !secret) {
      setSessionValid(false)
      setSessionChecking(false)
      return
    }
    const checkSession = async () => {
      try {
        const res = await api.get(`/scan-sessions/${sessionId}/result`)
        if (res.data.status === 'expired') {
          setSessionValid(false)
        } else {
          setSessionValid(true)
        }
      } catch (err) {
        console.error('Session validation error:', err)
        setSessionValid(false)
      } finally {
        setSessionChecking(false)
      }
    }
    checkSession()
  }, [sessionId, secret])

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      orders.forEach(order => {
        order.images.forEach(img => {
          if (img && img.preview) URL.revokeObjectURL(img.preview)
        })
      })
    }
  }, [])

  // ── Image Handling Functions ─────────────────────────────────────────────
  const handleImageSelected = (orderIdx, slotIdx, file) => {
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    setOrders(prev => prev.map((ord, idx) => {
      if (idx !== orderIdx) return ord
      const newImages = [...ord.images]
      if (newImages[slotIdx] && newImages[slotIdx].preview) {
        URL.revokeObjectURL(newImages[slotIdx].preview)
      }
      newImages[slotIdx] = { file, preview: previewUrl, name: file.name }
      return {
        ...ord,
        images: newImages,
        status: 'idle', // reset scan status when image changes
        errorMsg: ''
      }
    }))
  }

  const handleRemoveImage = (orderIdx, slotIdx) => {
    setOrders(prev => prev.map((ord, idx) => {
      if (idx !== orderIdx) return ord
      const newImages = [...ord.images]
      if (newImages[slotIdx] && newImages[slotIdx].preview) {
        URL.revokeObjectURL(newImages[slotIdx].preview)
      }
      newImages[slotIdx] = null
      return {
        ...ord,
        images: newImages,
        status: 'idle',
        data: null
      }
    }))
  }

  // ── Batch Order Management ────────────────────────────────────────────────
  const handleAddOrder = () => {
    setOrders(prev => {
      const nextIdx = prev.length
      const newOrder = {
        id: 'order-' + Date.now() + '-' + nextIdx,
        orderIndex: nextIdx,
        title: `Order #${nextIdx + 1}`,
        images: [null, null],
        status: 'idle',
        data: null,
        errorMsg: ''
      }
      return [...prev, newOrder]
    })
    setActiveOrderIdx(orders.length) // Switch to newly created order
  }

  const handleRemoveOrder = (orderIdx) => {
    if (orders.length <= 1) return
    setOrders(prev => {
      const filtered = prev.filter((_, idx) => idx !== orderIdx)
      // Re-index remaining orders
      return filtered.map((ord, newIdx) => ({
        ...ord,
        orderIndex: newIdx,
        title: `Order #${newIdx + 1}`
      }))
    })
    if (activeOrderIdx >= orders.length - 1) {
      setActiveOrderIdx(Math.max(0, orders.length - 2))
    }
  }

  // ── Single Order Scan Process ─────────────────────────────────────────────
  const processSingleOrder = async (orderIdx, isFinalBatchItem = false) => {
    const targetOrder = orders[orderIdx]
    const validImages = targetOrder.images.filter(Boolean)
    if (validImages.length === 0) return null

    // Update status to uploading
    setOrders(prev => prev.map((ord, idx) =>
      idx === orderIdx ? { ...ord, status: 'uploading', errorMsg: '' } : ord
    ))

    let lastResult = null

    try {
      for (let i = 0; i < validImages.length; i++) {
        const imgObj = validImages[i]
        const isLastPage = i === validImages.length - 1
        const isBatchComplete = isFinalBatchItem && isLastPage

        const formData = new FormData()
        formData.append('file', imgObj.file)
        formData.append('session_secret', secret)
        formData.append('order_index', String(orderIdx))
        formData.append('is_last', isLastPage ? 'true' : 'false')
        formData.append('is_batch_complete', isBatchComplete ? 'true' : 'false')

        setBatchProgressMsg(`Analyzing Order #${orderIdx + 1} (Page ${i + 1}/${validImages.length}) with Gemini AI...`)

        const res = await api.post(`/scan-sessions/${sessionId}/process-image`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 45000
        })

        lastResult = res.data.extracted_data || res.data.data || res.data
      }

      setOrders(prev => prev.map((ord, idx) =>
        idx === orderIdx ? { ...ord, status: 'scanned', data: lastResult } : ord
      ))

      return lastResult
    } catch (err) {
      console.error(`Error analyzing Order #${orderIdx + 1}:`, err)
      const errMsg = err.response?.data?.detail || 'AI Vision processing failed. Please try again.'
      setOrders(prev => prev.map((ord, idx) =>
        idx === orderIdx ? { ...ord, status: 'error', errorMsg: errMsg } : ord
      ))
      throw new Error(errMsg)
    }
  }

  // ── Submit Entire Batch ────────────────────────────────────────────────────
  const handleFinalSubmitBatch = async () => {
    // Ensure all orders have at least one image
    const invalidOrders = orders.filter(ord => !ord.images.some(Boolean))
    if (invalidOrders.length > 0) {
      setGlobalError(`Please take or select a photo for ${invalidOrders.map(o => o.title).join(', ')} before submitting.`)
      return
    }

    setGlobalError('')
    setIsSubmittingBatch(true)

    try {
      for (let i = 0; i < orders.length; i++) {
        const isFinal = (i === orders.length - 1)
        await processSingleOrder(i, isFinal)
      }
      setBatchComplete(true)
    } catch (err) {
      console.error('Batch submit error:', err)
      setGlobalError(err.message || 'Failed to complete batch scan submission.')
    } finally {
      setIsSubmittingBatch(false)
      setBatchProgressMsg('')
    }
  }

  // ── Render Loading / Invalid States ──────────────────────────────────────
  if (sessionChecking) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="w-12 h-12 border-4 border-amber-400/30 border-t-amber-400 rounded-full animate-spin mb-4" />
        <p className="text-zinc-400 text-sm font-medium">Connecting to Diversay AI Scanner...</p>
      </div>
    )
  }

  if (!sessionValid) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-zinc-100 mb-2">Scan Session Expired</h2>
        <p className="text-zinc-400 text-sm max-w-xs mb-6">
          This QR scan code has expired or is invalid. Please generate a new QR code on your computer screen.
        </p>
      </div>
    )
  }

  if (batchComplete) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(16,185,129,0.3)] animate-bounce">
          <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-black text-white mb-2">Batch Sent to Desktop!</h2>
        <p className="text-zinc-300 text-sm max-w-xs mb-8">
          Successfully processed <span className="text-amber-400 font-bold">{orders.length} {orders.length === 1 ? 'order' : 'orders'}</span> with Gemini AI. Check your computer screen — all batch cards are populated!
        </p>
        <button
          onClick={() => {
            setBatchComplete(false)
            setOrders([
              {
                id: 'order-' + Date.now(),
                orderIndex: 0,
                title: 'Order #1',
                images: [null, null],
                status: 'idle',
                data: null,
                errorMsg: ''
              }
            ])
            setActiveOrderIdx(0)
          }}
          className="px-6 py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold rounded-2xl shadow-lg transition-all"
        >
          Scan Another Batch
        </button>
      </div>
    )
  }

  const currentActiveOrder = orders[activeOrderIdx] || orders[0]

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans max-w-md mx-auto">
      {/* ── Top Header Bar ─────────────────────────────────────────────────── */}
      <header className="px-5 py-4 bg-zinc-900/80 border-b border-zinc-800/80 backdrop-blur-xl sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-black text-zinc-950 text-sm shadow-md">
            D
          </div>
          <div>
            <h1 className="text-base font-bold text-zinc-100 leading-none">Diversay AI Scanner</h1>
            <p className="text-[11px] text-zinc-400 font-medium">Batch Mobile Document Ingest</p>
          </div>
        </div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
          {orders.length} {orders.length === 1 ? 'Order' : 'Orders'} Batch
        </span>
      </header>

      {/* ── Order Selector Tabs ─────────────────────────────────────────────── */}
      <div className="px-4 py-3 bg-zinc-900/40 border-b border-zinc-800/50 flex items-center gap-2 overflow-x-auto custom-scroll sticky top-[65px] z-20 backdrop-blur-md">
        {orders.map((ord, idx) => {
          const isActive = idx === activeOrderIdx
          const hasImage = ord.images.some(Boolean)
          const isScanned = ord.status === 'scanned'

          return (
            <button
              key={ord.id}
              onClick={() => setActiveOrderIdx(idx)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 border ${
                isActive
                  ? 'bg-amber-400 text-zinc-950 border-amber-300 shadow-[0_4px_12px_rgba(251,191,36,0.25)]'
                  : isScanned
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : hasImage
                  ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
                  : 'bg-zinc-900/80 text-zinc-400 border-zinc-800'
              }`}
            >
              <span>{ord.title}</span>
              {isScanned && <span className="text-emerald-400 text-[10px]">✓</span>}
            </button>
          )
        })}

        <button
          onClick={handleAddOrder}
          disabled={isSubmittingBatch}
          className="px-3 py-2 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 transition-all flex items-center gap-1 shrink-0"
        >
          <span>+ Add Order</span>
        </button>
      </div>

      {/* ── Main Order Card Body ────────────────────────────────────────────── */}
      <main className="flex-1 p-5 space-y-6 pb-36">
        {/* Active Order Card Header */}
        <div className="flex items-center justify-between bg-zinc-900/60 border border-zinc-800 p-4 rounded-2xl shadow-sm">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-md border border-amber-400/20">
              Active Card
            </span>
            <h2 className="text-lg font-bold text-white mt-1">{currentActiveOrder.title}</h2>
          </div>
          {orders.length > 1 && (
            <button
              onClick={() => handleRemoveOrder(activeOrderIdx)}
              disabled={isSubmittingBatch}
              className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-500/30 text-xs font-semibold transition-all flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete
            </button>
          )}
        </div>

        {/* Global Error Banner */}
        {globalError && (
          <div className="p-3.5 bg-rose-500/15 border border-rose-500/30 rounded-2xl text-rose-200 text-xs font-medium flex items-start gap-2.5">
            <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{globalError}</span>
          </div>
        )}

        {/* Photo Upload Slots for Active Order */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Order Sheet Photos (Up to 2 Pages)
            </h3>
            <span className="text-[11px] text-zinc-500 font-medium">
              {currentActiveOrder.images.filter(Boolean).length}/2 added
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            {[0, 1].map((slotIdx) => {
              const imgObj = currentActiveOrder.images[slotIdx]
              const camKey = `${activeOrderIdx}-${slotIdx}-cam`
              const galKey = `${activeOrderIdx}-${slotIdx}-gal`

              return (
                <div
                  key={slotIdx}
                  className="relative bg-zinc-900/60 border border-zinc-800 rounded-2xl p-3 flex flex-col items-center justify-center min-h-[220px] transition-all hover:border-zinc-700 overflow-hidden group"
                >
                  {/* Hidden inputs */}
                  <input
                    ref={el => { cameraInputRefs.current[camKey] = el }}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={e => handleImageSelected(activeOrderIdx, slotIdx, e.target.files[0])}
                  />
                  <input
                    ref={el => { galleryInputRefs.current[galKey] = el }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => handleImageSelected(activeOrderIdx, slotIdx, e.target.files[0])}
                  />

                  {imgObj ? (
                    // Image Slot Preview
                    <div className="relative w-full h-full flex flex-col items-center justify-between">
                      <div className="relative w-full h-36 rounded-xl overflow-hidden bg-black border border-zinc-800">
                        <img
                          src={imgObj.preview}
                          alt={`Page ${slotIdx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(activeOrderIdx, slotIdx)}
                          className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 text-rose-400 flex items-center justify-center backdrop-blur-md border border-white/20"
                        >
                          ✕
                        </button>
                        <span className="absolute bottom-1.5 left-1.5 text-[10px] font-bold px-2 py-0.5 rounded-md bg-black/70 text-amber-300 border border-amber-400/30 backdrop-blur-md">
                          Page {slotIdx + 1}
                        </span>
                      </div>

                      <div className="w-full mt-2.5 flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => cameraInputRefs.current[camKey]?.click()}
                          className="flex-1 py-1.5 px-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-bold rounded-xl border border-zinc-700 flex items-center justify-center gap-1 transition-all"
                        >
                          📷 Retake
                        </button>
                        <button
                          type="button"
                          onClick={() => galleryInputRefs.current[galKey]?.click()}
                          className="flex-1 py-1.5 px-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px] font-bold rounded-xl border border-zinc-700 flex items-center justify-center gap-1 transition-all"
                        >
                          🖼️ Gallery
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Empty Slot Picker
                    <div className="flex flex-col items-center text-center p-2">
                      <div className="w-10 h-10 rounded-2xl bg-amber-400/10 border border-amber-400/20 flex items-center justify-center mb-2.5">
                        <span className="text-amber-400 font-bold text-sm">P{slotIdx + 1}</span>
                      </div>
                      <p className="text-xs font-bold text-zinc-200 mb-0.5">Page {slotIdx + 1}</p>
                      <p className="text-[10px] text-zinc-500 mb-3">
                        {slotIdx === 0 ? 'Primary order sheet' : 'Second page (optional)'}
                      </p>

                      <div className="w-full space-y-2">
                        <button
                          type="button"
                          onClick={() => cameraInputRefs.current[camKey]?.click()}
                          className="w-full py-2 px-3 bg-gradient-to-r from-amber-500 to-amber-600 text-zinc-950 text-xs font-extrabold rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-95"
                        >
                          📷 Camera
                        </button>

                        <button
                          type="button"
                          onClick={() => galleryInputRefs.current[galKey]?.click()}
                          className="w-full py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded-xl border border-zinc-700 flex items-center justify-center gap-1.5 transition-all active:scale-95"
                        >
                          🖼️ Gallery
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Single Order Extraction Action / Preview */}
        {currentActiveOrder.images.some(Boolean) && (
          <div className="space-y-3">
            <button
              onClick={() => processSingleOrder(activeOrderIdx, false)}
              disabled={currentActiveOrder.status === 'uploading' || isSubmittingBatch}
              className="w-full py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-amber-300 font-bold text-xs rounded-2xl border border-amber-400/30 flex items-center justify-center gap-2 transition-all"
            >
              {currentActiveOrder.status === 'uploading' ? (
                <>
                  <div className="w-4 h-4 border-2 border-amber-300/30 border-t-amber-300 rounded-full animate-spin" />
                  <span>Analyzing {currentActiveOrder.title} with AI...</span>
                </>
              ) : currentActiveOrder.status === 'scanned' ? (
                <>
                  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Re-analyze {currentActiveOrder.title} Data</span>
                </>
              ) : (
                <>
                  <span>⚡ Preview AI Data for {currentActiveOrder.title}</span>
                </>
              )}
            </button>

            {currentActiveOrder.errorMsg && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs">
                {currentActiveOrder.errorMsg}
              </div>
            )}

            {currentActiveOrder.data && (
              <div className="p-4 bg-zinc-900/80 border border-emerald-500/30 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                    AI Scanned Result
                  </span>
                  <span className="text-xs text-zinc-400 font-semibold">
                    {currentActiveOrder.data.products?.length || 0} Products
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-zinc-100">
                    {currentActiveOrder.data.customer_name || 'Customer Name Pending'}
                  </h4>
                  <p className="text-xs text-zinc-400">
                    Invoice: {currentActiveOrder.data.invoice_number || 'N/A'} • Waybill: {currentActiveOrder.data.waybill_number || 'N/A'}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Fixed Bottom Action Bar ────────────────────────────────────────── */}
      <footer className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-zinc-900/90 border-t border-zinc-800/90 backdrop-blur-2xl z-40 space-y-2.5">
        {batchProgressMsg && (
          <div className="text-center text-xs font-semibold text-amber-300 flex items-center justify-center gap-2">
            <div className="w-3.5 h-3.5 border-2 border-amber-300/30 border-t-amber-300 rounded-full animate-spin" />
            <span>{batchProgressMsg}</span>
          </div>
        )}

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleAddOrder}
            disabled={isSubmittingBatch}
            className="flex-1 py-3.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs rounded-2xl border border-zinc-700 flex items-center justify-center gap-1.5 transition-all active:scale-95"
          >
            <span>+ Add Order</span>
          </button>

          <button
            onClick={handleFinalSubmitBatch}
            disabled={isSubmittingBatch || !orders.some(o => o.images.some(Boolean))}
            className="flex-[2] py-3.5 px-4 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-black text-sm rounded-2xl shadow-[0_4px_20px_rgba(251,191,36,0.3)] flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isSubmittingBatch ? (
              <>
                <div className="w-4 h-4 border-2 border-zinc-950/30 border-t-zinc-950 rounded-full animate-spin" />
                <span>Sending Batch...</span>
              </>
            ) : (
              <>
                <span>Send {orders.length} {orders.length === 1 ? 'Order' : 'Orders'} to PC →</span>
              </>
            )}
          </button>
        </div>
      </footer>
    </div>
  )
}

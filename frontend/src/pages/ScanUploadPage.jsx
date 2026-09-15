import React, { useState, useRef, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  Camera,
  Image as ImageIcon,
  Plus,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Send,
  RefreshCw,
  Layers,
  FileText,
  Loader2,
  ArrowRight
} from 'lucide-react'
import api from '../services/api'

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
    setActiveOrderIdx(orders.length)
  }

  const handleRemoveOrder = (orderIdx) => {
    if (orders.length <= 1) return
    setOrders(prev => {
      const filtered = prev.filter((_, idx) => idx !== orderIdx)
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
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center font-sans">
        <Loader2 className="w-10 h-10 text-white animate-spin mb-4" />
        <p className="text-zinc-400 text-xs tracking-wide uppercase font-semibold">Connecting to Diversay AI...</p>
      </div>
    )
  }

  if (!sessionValid) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 text-zinc-400">
          <AlertCircle className="w-7 h-7 text-zinc-300" />
        </div>
        <h2 className="text-lg font-bold text-white mb-2">Scan Session Expired</h2>
        <p className="text-zinc-400 text-xs max-w-xs mb-6 leading-relaxed">
          This QR scan code has expired or is invalid. Please generate a new QR code on your computer screen.
        </p>
      </div>
    )
  }

  if (batchComplete) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(255,255,255,0.25)] animate-pulse">
          <CheckCircle2 className="w-9 h-9" />
        </div>
        <h2 className="text-2xl font-black text-white mb-2 tracking-tight">Batch Sent to Desktop</h2>
        <p className="text-zinc-400 text-xs max-w-xs mb-8 leading-relaxed">
          Successfully processed <span className="text-white font-bold">{orders.length} {orders.length === 1 ? 'order' : 'orders'}</span> with Gemini AI. Check your computer screen to review the autofilled batch cards.
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
          className="px-6 py-3.5 bg-white hover:bg-zinc-200 text-black font-extrabold text-xs uppercase tracking-wider rounded-2xl shadow-xl transition-all active:scale-95"
        >
          Scan Another Batch
        </button>
      </div>
    )
  }

  const currentActiveOrder = orders[activeOrderIdx] || orders[0]

  return (
    <div className="min-h-screen bg-black text-white flex flex-col font-sans max-w-md mx-auto border-x border-zinc-900 selection:bg-white selection:text-black">
      {/* ── Top Header Bar ─────────────────────────────────────────────────── */}
      <header className="px-5 py-4 bg-black/90 border-b border-zinc-900 backdrop-blur-2xl sticky top-0 z-30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-white text-black flex items-center justify-center font-black text-sm shadow-[0_0_15px_rgba(255,255,255,0.2)]">
            D
          </div>
          <div>
            <h1 className="text-sm font-extrabold text-white tracking-tight uppercase">Diversay AI</h1>
            <p className="text-[10px] text-zinc-500 font-semibold tracking-wider uppercase">Document Scanner</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-semibold text-zinc-300">
          <Layers className="w-3.5 h-3.5 text-zinc-400" />
          <span>{orders.length} {orders.length === 1 ? 'Order' : 'Orders'}</span>
        </div>
      </header>

      {/* ── Order Selector Tabs ─────────────────────────────────────────────── */}
      <div className="px-4 py-3 bg-zinc-950/80 border-b border-zinc-900 flex items-center gap-2 overflow-x-auto custom-scroll sticky top-[65px] z-20 backdrop-blur-xl">
        {orders.map((ord, idx) => {
          const isActive = idx === activeOrderIdx
          const hasImage = ord.images.some(Boolean)
          const isScanned = ord.status === 'scanned'

          return (
            <button
              key={ord.id}
              onClick={() => setActiveOrderIdx(idx)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap shrink-0 border ${
                isActive
                  ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.2)] font-extrabold'
                  : isScanned
                  ? 'bg-zinc-900 text-zinc-100 border-zinc-700'
                  : hasImage
                  ? 'bg-zinc-900/90 text-zinc-300 border-zinc-800'
                  : 'bg-black text-zinc-500 border-zinc-900 hover:text-zinc-300'
              }`}
            >
              <span>{ord.title}</span>
              {isScanned && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
            </button>
          )
        })}

        <button
          onClick={handleAddOrder}
          disabled={isSubmittingBatch}
          className="px-3 py-2 rounded-xl text-xs font-bold bg-zinc-900 text-zinc-300 border border-zinc-800 hover:bg-zinc-800 hover:text-white transition-all flex items-center gap-1 shrink-0 active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add</span>
        </button>
      </div>

      {/* ── Main Order Card Body ────────────────────────────────────────────── */}
      <main className="flex-1 p-5 space-y-6 pb-36">
        {/* Active Order Header */}
        <div className="flex items-center justify-between bg-zinc-950 border border-zinc-900 p-4 rounded-2xl">
          <div>
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
              Active Selection
            </span>
            <h2 className="text-base font-extrabold text-white mt-1 tracking-tight">{currentActiveOrder.title}</h2>
          </div>

          {orders.length > 1 && (
            <button
              onClick={() => handleRemoveOrder(activeOrderIdx)}
              disabled={isSubmittingBatch}
              className="p-2 rounded-xl bg-zinc-900 hover:bg-rose-500/10 hover:border-rose-500/30 text-zinc-400 hover:text-rose-400 border border-zinc-800 text-xs font-semibold transition-all flex items-center gap-1.5"
              title="Delete Order"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Global Error Banner */}
        {globalError && (
          <div className="p-3.5 bg-zinc-900 border border-rose-500/40 rounded-2xl text-rose-300 text-xs font-medium flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{globalError}</span>
          </div>
        )}

        {/* Photo Upload Slots for Active Order */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-400">
              Order Documents (Max 2 Pages)
            </h3>
            <span className="text-[11px] text-zinc-500 font-mono">
              {currentActiveOrder.images.filter(Boolean).length}/2 Pages
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
                  className="relative bg-zinc-950 border border-zinc-900 rounded-2xl p-3 flex flex-col items-center justify-between min-h-[230px] transition-all hover:border-zinc-800 overflow-hidden"
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
                    <div className="w-full h-full flex flex-col justify-between">
                      <div className="relative w-full h-36 rounded-xl overflow-hidden bg-black border border-zinc-800">
                        <img
                          src={imgObj.preview}
                          alt={`Page ${slotIdx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(activeOrderIdx, slotIdx)}
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/80 hover:bg-black text-white flex items-center justify-center border border-white/20 transition-all"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <span className="absolute bottom-2 left-2 text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-black/80 text-white border border-white/20 backdrop-blur-md">
                          Page {slotIdx + 1}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 mt-3">
                        <button
                          type="button"
                          onClick={() => cameraInputRefs.current[camKey]?.click()}
                          className="py-2 px-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-[10px] font-bold rounded-xl border border-zinc-800 flex items-center justify-center gap-1 transition-all active:scale-95"
                        >
                          <Camera className="w-3 h-3" />
                          <span>Retake</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => galleryInputRefs.current[galKey]?.click()}
                          className="py-2 px-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-[10px] font-bold rounded-xl border border-zinc-800 flex items-center justify-center gap-1 transition-all active:scale-95"
                        >
                          <ImageIcon className="w-3 h-3" />
                          <span>Gallery</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Empty Slot Picker
                    <div className="w-full h-full flex flex-col items-center justify-center text-center py-2">
                      <div className="w-10 h-10 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-2.5 text-zinc-400">
                        <FileText className="w-5 h-5 text-zinc-400" />
                      </div>
                      <p className="text-xs font-extrabold text-white mb-0.5">Page {slotIdx + 1}</p>
                      <p className="text-[10px] text-zinc-500 mb-4 font-medium">
                        {slotIdx === 0 ? 'Primary order sheet' : 'Second page (optional)'}
                      </p>

                      <div className="w-full space-y-2">
                        <button
                          type="button"
                          onClick={() => cameraInputRefs.current[camKey]?.click()}
                          className="w-full py-2.5 px-3 bg-white hover:bg-zinc-200 text-black text-xs font-extrabold rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-95"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Take Photo</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => galleryInputRefs.current[galKey]?.click()}
                          className="w-full py-2.5 px-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white text-xs font-bold rounded-xl border border-zinc-800 flex items-center justify-center gap-1.5 transition-all active:scale-95"
                        >
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>Choose Photo</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* AI Analysis Preview Card */}
        {currentActiveOrder.images.some(Boolean) && (
          <div className="space-y-3">
            <button
              onClick={() => processSingleOrder(activeOrderIdx, false)}
              disabled={currentActiveOrder.status === 'uploading' || isSubmittingBatch}
              className="w-full py-3.5 px-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-100 font-extrabold text-xs rounded-2xl border border-zinc-800 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              {currentActiveOrder.status === 'uploading' ? (
                <>
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                  <span>Analyzing with Gemini AI...</span>
                </>
              ) : currentActiveOrder.status === 'scanned' ? (
                <>
                  <RefreshCw className="w-4 h-4 text-zinc-400" />
                  <span>Re-analyze Order Data</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-white" />
                  <span>Test AI Analysis Preview</span>
                </>
              )}
            </button>

            {currentActiveOrder.errorMsg && (
              <div className="p-3.5 bg-zinc-900 border border-rose-500/30 rounded-2xl text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{currentActiveOrder.errorMsg}</span>
              </div>
            )}

            {currentActiveOrder.data && (
              <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between border-b border-zinc-900 pb-2">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-white" />
                    AI Extracted Data
                  </span>
                  <span className="text-xs text-white font-extrabold bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                    {currentActiveOrder.data.products?.length || 0} Products
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-white">
                    {currentActiveOrder.data.customer_name || 'Customer Name Unspecified'}
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Invoice: <span className="text-zinc-200 font-mono">{currentActiveOrder.data.invoice_number || 'N/A'}</span> • Waybill: <span className="text-zinc-200 font-mono">{currentActiveOrder.data.waybill_number || 'N/A'}</span>
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Fixed Bottom Action Bar ────────────────────────────────────────── */}
      <footer className="fixed bottom-0 left-0 right-0 max-w-md mx-auto p-4 bg-black/95 border-t border-zinc-900 backdrop-blur-2xl z-40 space-y-3">
        {batchProgressMsg && (
          <div className="text-center text-xs font-semibold text-zinc-300 flex items-center justify-center gap-2">
            <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
            <span>{batchProgressMsg}</span>
          </div>
        )}

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleAddOrder}
            disabled={isSubmittingBatch}
            className="flex-1 py-3.5 px-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-bold text-xs rounded-2xl border border-zinc-800 flex items-center justify-center gap-1.5 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Add Order</span>
          </button>

          <button
            onClick={handleFinalSubmitBatch}
            disabled={isSubmittingBatch || !orders.some(o => o.images.some(Boolean))}
            className="flex-[2] py-3.5 px-4 bg-white hover:bg-zinc-200 text-black font-extrabold text-xs tracking-wider uppercase rounded-2xl shadow-[0_0_30px_rgba(255,255,255,0.2)] flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
          >
            {isSubmittingBatch ? (
              <>
                <Loader2 className="w-4 h-4 text-black animate-spin" />
                <span>Sending Batch...</span>
              </>
            ) : (
              <>
                <span>Send {orders.length} {orders.length === 1 ? 'Order' : 'Orders'} to PC</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </footer>
    </div>
  )
}

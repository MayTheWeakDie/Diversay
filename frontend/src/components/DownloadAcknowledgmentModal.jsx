import React, { useState, useEffect } from 'react'
import { Download, X, Building, Edit3 } from 'lucide-react'
import { generateDeliveryAcknowledgment } from '../utils/pdfGenerator'

export default function DownloadAcknowledgmentModal({ isOpen, onClose, order }) {
  const [addressOption, setAddressOption] = useState('database') // 'database' | 'custom'
  const [customAddress, setCustomAddress] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')

  const dbAddress = order?.customer_address || order?.customer?.address || ''

  useEffect(() => {
    if (isOpen && order) {
      setAddressOption('database')
      setCustomAddress(dbAddress)
      setError('')
    }
  }, [isOpen, order, dbAddress])

  if (!isOpen || !order) return null

  const handleDownload = async () => {
    try {
      setIsGenerating(true)
      setError('')

      let selectedAddress = dbAddress
      if (addressOption === 'custom') {
        if (!customAddress.trim()) {
          setError('Please enter a custom address or choose the database address.')
          setIsGenerating(false)
          return
        }
        selectedAddress = customAddress.trim()
      }

      await generateDeliveryAcknowledgment(order, selectedAddress)
      onClose()
    } catch (err) {
      console.error('Failed to generate delivery acknowledgment PDF:', err)
      setError('Failed to generate PDF. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200 z-10">
        {/* Header white/zinc gradient line */}
        <div className="h-1 bg-gradient-to-r from-zinc-700 via-zinc-200 to-zinc-700" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-all"
        >
          <X size={18} />
        </button>

        <div className="p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white shrink-0">
              <Download size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Download Delivery Acknowledgment</h2>
              <p className="text-xs text-zinc-400">
                Order <span className="font-semibold text-zinc-200">{order.order_number || order.id}</span> • {order.customer_name || 'N/A'}
              </p>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-3 mb-6">
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider">
              Customer Address for Acknowledgment PDF
            </label>

            {/* Option 1: Database Address */}
            <div
              onClick={() => setAddressOption('database')}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                addressOption === 'database'
                  ? 'bg-zinc-800/80 border-zinc-600 text-white shadow-sm'
                  : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300'
              }`}
            >
              <input
                type="radio"
                name="addressOption"
                checked={addressOption === 'database'}
                onChange={() => setAddressOption('database')}
                className="mt-1 accent-white cursor-pointer"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <Building size={14} className="text-zinc-300 shrink-0" /> Use Database Address
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 font-mono shrink-0">
                    Saved Record
                  </span>
                </div>
                <p className="text-xs text-zinc-300 mt-1.5 bg-zinc-950/70 p-2.5 rounded-lg border border-zinc-800 break-words leading-relaxed">
                  {dbAddress || <span className="italic text-zinc-500">No address saved in database</span>}
                </p>
              </div>
            </div>

            {/* Option 2: Input Custom Address */}
            <div
              onClick={() => setAddressOption('custom')}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 ${
                addressOption === 'custom'
                  ? 'bg-zinc-800/80 border-zinc-600 text-white shadow-sm'
                  : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300'
              }`}
            >
              <input
                type="radio"
                name="addressOption"
                checked={addressOption === 'custom'}
                onChange={() => setAddressOption('custom')}
                className="mt-1 accent-white cursor-pointer"
              />
              <div className="flex-1">
                <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <Edit3 size={14} className="text-zinc-300 shrink-0" /> Input New Address
                </span>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Specify a custom address to appear on this acknowledgment document.
                </p>
              </div>
            </div>

            {/* Textarea for Custom Address */}
            {addressOption === 'custom' && (
              <div className="pl-7 pt-1 animate-in fade-in-50 duration-150">
                <textarea
                  rows={2}
                  value={customAddress}
                  onChange={(e) => {
                    setCustomAddress(e.target.value)
                    if (error) setError('')
                  }}
                  placeholder="Type customer address here..."
                  className="w-full bg-zinc-950 border border-zinc-700 focus:border-zinc-400 text-white text-sm rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-zinc-400 placeholder-zinc-500 resize-none transition-all"
                  autoFocus
                />
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-400 mb-4 bg-red-950/40 border border-red-900/50 p-2.5 rounded-lg">
              {error}
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={isGenerating}
              className="px-4 py-2 bg-white hover:bg-zinc-200 text-zinc-950 font-semibold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <span>Generating PDF...</span>
              ) : (
                <>
                  <Download size={14} />
                  Download Acknowledgment
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

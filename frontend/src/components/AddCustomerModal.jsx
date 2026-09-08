import React, { useState, useEffect } from 'react'
import { X, Users, RefreshCw } from 'lucide-react'
import api, { invalidateCache } from '../services/api'
import { STATE_CENTROIDS } from './NigeriaMap'

export default function AddCustomerModal({ isOpen, onClose, initialName = '', onCustomerCreated }) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [contactNumber, setContactNumber] = useState('')
  const [email, setEmail] = useState('')
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      setName(initialName || '')
      setAddress('')
      setCity('')
      setState('')
      setContactNumber('')
      setEmail('')
      setError('')
    }
  }, [isOpen, initialName])

  if (!isOpen) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Customer name is required')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await api.post('/customers/', {
        name: name.trim(),
        address: address.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        contact_number: contactNumber.trim() || null,
        email: email.trim() || null,
      })

      const createdCustomer = response.data.customer || response.data || {
        name: name.trim(),
        address: address.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        contact_number: contactNumber.trim() || null,
        email: email.trim() || null,
      }

      invalidateCache('/customers')

      if (onCustomerCreated) {
        onCustomerCreated(createdCustomer)
      }

      onClose()
    } catch (err) {
      console.error('Failed to create customer:', err)
      setError(err.response?.data?.detail || 'Failed to save customer. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={() => !loading && onClose()}
      />

      {/* Modal Container */}
      <div className="relative bg-zinc-950/75 border border-white/15 backdrop-blur-3xl rounded-2xl shadow-[0_35px_80px_-15px_rgba(0,0,0,0.9)] ring-1 ring-white/10 max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.03]">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Users size={16} className="text-zinc-400" />
            Add New Customer
          </h3>
          <button 
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800 transition-all disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>
        
        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2.5 rounded-xl text-xs font-semibold">
              ⚠️ {error}
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
              Customer Name <span className="text-red-500">*</span>
            </label>
            <input 
              type="text"
              required
              placeholder="e.g. Acme Logistics Nigeria"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-650 focus:outline-none focus:border-zinc-700 transition-colors text-sm font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                State
              </label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full px-4 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:border-zinc-700 transition-colors text-sm cursor-pointer font-semibold"
              >
                <option value="">Select State</option>
                {Object.entries(STATE_CENTROIDS).map(([key, val]) => (
                  <option key={key} value={val.label}>
                    {val.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                City
              </label>
              <input 
                type="text"
                placeholder="e.g. Ikeja"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-4 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-655 focus:outline-none focus:border-zinc-700 transition-colors text-sm font-semibold"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
              Address
            </label>
            <input 
              type="text"
              placeholder="e.g. 12 Allen Avenue"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-4 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-655 focus:outline-none focus:border-zinc-700 transition-colors text-sm font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                Contact Number
              </label>
              <input 
                type="text"
                placeholder="e.g. +234 803..."
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                className="w-full px-4 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-655 focus:outline-none focus:border-zinc-700 transition-colors text-sm font-semibold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                Email Address
              </label>
              <input 
                type="email"
                placeholder="e.g. contact@acme.ng"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-655 focus:outline-none focus:border-zinc-700 transition-colors text-sm font-semibold"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-5 py-2.5 text-xs font-bold text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 rounded-xl transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Customer'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

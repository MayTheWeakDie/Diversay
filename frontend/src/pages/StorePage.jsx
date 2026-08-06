import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import api, { getWithCache, invalidateCache } from '../services/api'
import {
  Store,
  MapPin,
  Phone,
  User,
  ChevronRight,
  Plus,
  Crown,
  Warehouse,
  X,
  Building2,
  Factory,
  BarChart3,
  Activity
} from 'lucide-react'

export default function StorePage() {
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const { user } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    fetchStores()
  }, [])

  const fetchStores = async () => {
    try {
      const isCurrentlyLoading = stores.length === 0
      if (isCurrentlyLoading) setLoading(true)

      const { data } = await getWithCache('/stores/', {
        onCacheUpdate: (newData) => {
          setStores(newData || [])
        }
      })
      setStores(data || [])
    } catch (err) {
      console.error('Failed to load stores:', err)
    } finally {
      setLoading(false)
    }
  }

  // Accent color palette per store index for visual distinction
  const storeAccents = [
    { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400', glow: 'group-hover:shadow-emerald-500/5', icon: 'text-emerald-400' },
    { bg: 'bg-blue-500/10', border: 'border-blue-500/20', text: 'text-blue-400', glow: 'group-hover:shadow-blue-500/5', icon: 'text-blue-400' },
    { bg: 'bg-purple-500/10', border: 'border-purple-500/20', text: 'text-purple-400', glow: 'group-hover:shadow-purple-500/5', icon: 'text-purple-400' },
    { bg: 'bg-amber-500/10', border: 'border-amber-500/20', text: 'text-amber-400', glow: 'group-hover:shadow-amber-500/5', icon: 'text-amber-400' },
    { bg: 'bg-rose-500/10', border: 'border-rose-500/20', text: 'text-rose-400', glow: 'group-hover:shadow-rose-500/5', icon: 'text-rose-400' },
    { bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', text: 'text-cyan-400', glow: 'group-hover:shadow-cyan-500/5', icon: 'text-cyan-400' },
    { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400', glow: 'group-hover:shadow-orange-500/5', icon: 'text-orange-400' },
  ]

  return (
    <div className="animate-in fade-in duration-300 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white uppercase flex items-center gap-3">
            <Store className="text-emerald-500" size={32} />
            Store Registry
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            {stores.length} warehouse{stores.length !== 1 ? 's' : ''} across Nigeria — each with its own inventory
          </p>
        </div>

        {/* Admin: Add Store */}
        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-800 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/20 active:scale-[0.97] self-start md:self-auto"
          >
            <Plus size={18} />
            Add New Store
          </button>
        )}
      </div>

      {/* ── Global Analytics Entry Point (White-themed & Positioned directly below Store Registry Header) ── */}
      <div
        onClick={() => navigate('/analytics/global')}
        className="bg-zinc-900/80 border border-zinc-800/90 rounded-2xl p-5 cursor-pointer group hover:border-zinc-700/90 hover:bg-zinc-900 transition-all duration-300 shadow-xl"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700/80 flex items-center justify-center text-white group-hover:scale-105 transition-transform duration-300">
              <BarChart3 size={24} className="text-white" />
            </div>
            <div>
              <h3 className="text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                Global Analytics
                <Activity size={15} className="text-white" />
              </h3>
              <p className="text-zinc-400 text-xs mt-0.5">Cross-store intelligence — products, seasons, zones, expenses & more</p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-4 py-2.5 bg-zinc-800 text-white border border-zinc-700/80 rounded-xl text-xs font-bold group-hover:bg-white group-hover:text-zinc-950 group-hover:border-white transition-all duration-200 shadow-sm">
            <span>View Dashboard</span>
            <ChevronRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>

      {/* Store Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {[...Array(6)].map((_, idx) => (
            <div key={idx} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 h-56 animate-pulse">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 bg-zinc-800 rounded-xl" />
                <div className="space-y-3 flex-1">
                  <div className="h-5 bg-zinc-800 rounded w-3/4" />
                  <div className="h-3 bg-zinc-800 rounded w-1/2" />
                  <div className="h-3 bg-zinc-800 rounded w-2/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : stores.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-16 text-center shadow-xl">
          <Warehouse className="mx-auto text-zinc-600 mb-4" size={56} />
          <h3 className="text-lg font-bold text-white">No stores registered yet</h3>
          <p className="text-zinc-500 text-sm mt-2">Ask an admin to add the first store location.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {stores.map((store, idx) => {
            const accent = storeAccents[idx % storeAccents.length]
            return (
              <div
                key={store.id}
                onClick={() => navigate(`/store/${store.id}`)}
                className={`bg-zinc-900 border border-zinc-800/80 rounded-2xl p-6 cursor-pointer group relative overflow-hidden transition-all duration-300 hover:border-zinc-700 hover:shadow-2xl ${accent.glow}`}
              >
                {/* Decorative background glow */}
                <div className={`absolute -top-12 -right-12 w-40 h-40 ${accent.bg} rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none`} />

                {/* Central Store Crown Badge */}
                {store.is_central && (
                  <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg z-10">
                    <Crown size={12} className="text-amber-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Central</span>
                  </div>
                )}

                <div className="relative z-10">
                  {/* Icon */}
                  <div className={`w-14 h-14 rounded-xl ${accent.bg} border ${accent.border} flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300`}>
                    {store.is_central ? (
                      <Factory size={26} className={accent.icon} />
                    ) : (
                      <Building2 size={26} className={accent.icon} />
                    )}
                  </div>

                  {/* Store Name */}
                  <h3 className={`text-lg font-extrabold text-white group-hover:${accent.text} transition-colors duration-200 mb-1`}>
                    {store.name}
                  </h3>

                  {/* Location */}
                  <div className="flex items-center gap-1.5 text-zinc-400 text-sm mb-3">
                    <MapPin size={14} className="text-zinc-500 shrink-0" />
                    <span>{store.city}, {store.state}</span>
                  </div>

                  {/* Address */}
                  {store.address && (
                    <p className="text-zinc-500 text-xs leading-relaxed mb-4 line-clamp-2">
                      {store.address}
                    </p>
                  )}

                  {/* Footer row */}
                  <div className="pt-4 border-t border-zinc-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {store.phone && (
                        <div className="flex items-center gap-1.5 text-zinc-500">
                          <Phone size={13} />
                          <span className="text-[11px] font-semibold">{store.phone}</span>
                        </div>
                      )}
                      {store.manager_name && (
                        <div className="flex items-center gap-1.5 text-zinc-500">
                          <User size={13} />
                          <span className="text-[11px] font-semibold">{store.manager_name}</span>
                        </div>
                      )}
                    </div>

                    <div className={`w-8 h-8 rounded-lg ${accent.bg} border ${accent.border} flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-0 translate-x-2`}>
                      <ChevronRight size={16} className={accent.icon} />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Store Modal */}
      {showAddModal && <AddStoreModal onClose={() => setShowAddModal(false)} onCreated={() => { setShowAddModal(false); fetchStores() }} />}


    </div>
  )
}

// ============ Add Store Modal ============
function AddStoreModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    city: '',
    state: '',
    address: '',
    is_central: false,
    phone: '',
    manager_name: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim() || !form.city.trim() || !form.state.trim()) {
      setError('Store name, city, and state are required.')
      return
    }

    try {
      setSubmitting(true)
      setError('')
      await api.post('/stores/', form)
      invalidateCache('/stores/')
      onCreated()
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create store.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg mx-4 p-6 shadow-2xl animate-in slide-in-from-bottom-4 duration-300" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-black text-white uppercase tracking-tight">Add New Store</h2>
            <p className="text-zinc-500 text-xs mt-0.5">Register a new warehouse or distribution centre</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Store Name */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-zinc-500 font-bold mb-1.5">Store Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g. Ibadan Store"
              className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-emerald-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none"
            />
          </div>

          {/* City & State */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-500 font-bold mb-1.5">City *</label>
              <input
                type="text"
                value={form.city}
                onChange={(e) => handleChange('city', e.target.value)}
                placeholder="e.g. Ibadan"
                className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-emerald-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-500 font-bold mb-1.5">State *</label>
              <input
                type="text"
                value={form.state}
                onChange={(e) => handleChange('state', e.target.value)}
                placeholder="e.g. Oyo"
                className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-emerald-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-zinc-500 font-bold mb-1.5">Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => handleChange('address', e.target.value)}
              placeholder="Full warehouse address"
              className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-emerald-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none"
            />
          </div>

          {/* Phone & Manager */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-500 font-bold mb-1.5">Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="+234..."
                className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-emerald-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-zinc-500 font-bold mb-1.5">Manager</label>
              <input
                type="text"
                value={form.manager_name}
                onChange={(e) => handleChange('manager_name', e.target.value)}
                placeholder="Manager name"
                className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-emerald-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none"
              />
            </div>
          </div>

          {/* Central Store Toggle */}
          <div className="flex items-center gap-3 p-3 bg-zinc-950 border border-zinc-800 rounded-xl">
            <input
              type="checkbox"
              id="is_central"
              checked={form.is_central}
              onChange={(e) => handleChange('is_central', e.target.checked)}
              className="w-4 h-4 accent-emerald-500 rounded"
            />
            <label htmlFor="is_central" className="text-sm text-zinc-300 font-semibold cursor-pointer flex items-center gap-2">
              <Crown size={14} className="text-amber-400" />
              Mark as Central Store (HQ / Production)
            </label>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/10 active:scale-[0.98]"
          >
            {submitting ? 'Creating Store...' : 'Create Store'}
          </button>
        </form>
      </div>
    </div>
  )
}

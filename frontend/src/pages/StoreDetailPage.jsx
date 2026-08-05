import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const getConversionFactor = (productName) => {
  const nameLower = (productName || '').toLowerCase();
  if (
    nameLower.includes('50g') ||
    nameLower.includes('50 g') ||
    nameLower.includes('50gram') ||
    nameLower.includes('50 gram') ||
    nameLower.includes('50gr') ||
    nameLower.includes('50 gr') ||
    nameLower.includes('50gm') ||
    nameLower.includes('50 gm')
  ) {
    return 192;
  }
  return 96;
};

const displayStockAndUnit = (stockValue, productName, targetUnit) => {
  if (targetUnit === 'Cartons') {
    const factor = getConversionFactor(productName);
    const converted = parseFloat((stockValue / factor).toFixed(2));
    return {
      value: converted,
      unit: converted === 1 ? 'Carton' : 'Cartons'
    };
  } else {
    return {
      value: stockValue,
      unit: stockValue === 1 ? 'Piece' : 'Pieces'
    };
  }
};
import api, { getWithCache, isCached, invalidateCache } from '../services/api'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  CartesianGrid
} from 'recharts'
import { TrendingUp, BarChart3, PieChart as PieIcon, ArrowRightLeft } from 'lucide-react'
import { 
  ArrowLeft, 
  ArrowRight,
  MapPin, 
  Phone, 
  User, 
  Search, 
  ArrowUpDown, 
  ChevronDown,
  Grid,
  List,
  Package, 
  Crown, 
  Factory, 
  Building2, 
  Edit3, 
  X,
  Plus,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2
} from 'lucide-react'

const formatDateWithTime = (dateStr) => {
  if (!dateStr) return 'N/A'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (e) {
    return dateStr
  }
}

const formatChartDate = (val, range) => {
  if (!val || typeof val !== 'string') return '';
  
  if (val.includes('T')) {
    const parts = val.split('T');
    if (parts.length > 1) {
      return parts[1].substring(0, 5);
    }
    return val;
  }
  
  const dateParts = val.split('-');
  if (dateParts.length === 3) {
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const day = parseInt(dateParts[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      if (range === '90') {
        return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
      }
      return d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric' });
    }
  }
  return val;
};

const formatTooltipLabel = (val, range) => {
  if (!val || typeof val !== 'string') return '';
  
  if (val.includes('T')) {
    const parts = val.split('T');
    const timeStr = parts.length > 1 ? parts[1].substring(0, 5) : '';
    const dateParts = parts[0].split('-');
    if (dateParts.length === 3) {
      const year = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10) - 1;
      const day = parseInt(dateParts[2], 10);
      const d = new Date(year, month, day);
      if (!isNaN(d.getTime())) {
        const formattedDate = d.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        return timeStr ? `${formattedDate} at ${timeStr}` : formattedDate;
      }
    }
    return val;
  }
  
  const dateParts = val.split('-');
  if (dateParts.length === 3) {
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const day = parseInt(dateParts[2], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }
  }
  return val;
};

export default function StoreDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  
  const [store, setStore] = useState(null)
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStock, setFilterStock] = useState('all')
  const [filterBrand, setFilterBrand] = useState('all')
  const [sortBy, setSortBy] = useState('name-asc')
  const [isSortOpen, setIsSortOpen] = useState(false)
  const [viewMode, setViewMode] = useState('grid')
  const [viewUnit, setViewUnit] = useState('Pieces')
  
  const [adjustItem, setAdjustItem] = useState(null)
  const [adjustProductName, setAdjustProductName] = useState('')
  const [adjustProductBrand, setAdjustProductBrand] = useState('DSL')
  const [adjustValue, setAdjustValue] = useState('')
  const [adjustReorderLevel, setAdjustReorderLevel] = useState('')
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState('')

  // Add Product State
  const [showAddModal, setShowAddModal] = useState(false)
  const [addMode, setAddMode] = useState('existing') // 'existing' | 'new'
  const [globalProducts, setGlobalProducts] = useState([])
  const [selectedProductId, setSelectedProductId] = useState('')
  const [newProdName, setNewProdName] = useState('')
  const [newProdCategory, setNewProdCategory] = useState('Other')
  const [newProdUnit, setNewProdUnit] = useState('Pieces')
  const [newProdBrand, setNewProdBrand] = useState('DSL')
  const [initialStock, setInitialStock] = useState('0')
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState('')

  // Inter-Store Transfer State
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transferItem, setTransferItem] = useState(null)
  const [allStores, setAllStores] = useState([])
  const [destInventories, setDestInventories] = useState({})
  const [transferRows, setTransferRows] = useState([{ destination_store_id: '', quantity: '' }])
  const [transferSubmitting, setTransferSubmitting] = useState(false)
  const [transferError, setTransferError] = useState('')
  const [transferSuccessToast, setTransferSuccessToast] = useState('')
  const [transfersModalType, setTransfersModalType] = useState(null) // 'inbound' | 'outbound' | null
  const [transfersModalSearch, setTransfersModalSearch] = useState('')
  const [deletingProductIds, setDeletingProductIds] = useState(new Set())

  const handleOpenTransfer = async (item) => {
    setTransferItem(item)
    setTransferRows([{ destination_store_id: '', quantity: '' }])
    setTransferError('')
    setShowTransferModal(true)
    try {
      const res = await getWithCache('/stores/')
      const loadedStores = res.data || []
      setAllStores(loadedStores)

      const invMap = {}
      await Promise.all(
        loadedStores.map(async (s) => {
          try {
            const invRes = await getWithCache(`/stores/${s.id}/inventory`)
            invMap[s.id] = invRes.data || []
          } catch (e) {
            invMap[s.id] = []
          }
        })
      )
      setDestInventories(invMap)
    } catch (err) {
      console.error('Failed to load store list for transfer:', err)
    }
  }

  const handleAddTransferRow = () => {
    setTransferRows(prev => [...prev, { destination_store_id: '', quantity: '' }])
  }

  const handleRemoveTransferRow = (index) => {
    if (transferRows.length === 1) return
    setTransferRows(prev => prev.filter((_, i) => i !== index))
  }

  const handleUpdateTransferRow = (index, field, value) => {
    setTransferRows(prev => prev.map((row, i) => {
      if (i !== index) return row

      if (field === 'quantity') {
        const availableStock = transferItem?.stock || 0
        const otherRowsTotal = prev
          .filter((_, idx) => idx !== index)
          .reduce((sum, r) => sum + (parseFloat(r.quantity) || 0), 0)
        
        const maxAllowed = Math.max(0, availableStock - otherRowsTotal)

        if (value === '') {
          return { ...row, quantity: '' }
        }

        const numVal = parseFloat(value)
        if (!isNaN(numVal) && numVal > maxAllowed) {
          return { ...row, quantity: maxAllowed > 0 ? maxAllowed.toString() : '0' }
        }
      }

      return { ...row, [field]: value }
    }))
  }

  const handleConfirmTransfer = async (e) => {
    e.preventDefault()
    if (!transferItem || !store) return

    const validRows = transferRows.filter(r => r.destination_store_id && parseFloat(r.quantity) > 0)
    if (validRows.length === 0) {
      setTransferError('Please select at least one destination store and enter a valid quantity.')
      return
    }

    const totalQty = validRows.reduce((sum, r) => sum + (parseFloat(r.quantity) || 0), 0)
    if (totalQty > (transferItem.stock || 0)) {
      setTransferError(`Cannot transfer ${totalQty} ${transferItem.default_unit || 'Pieces'}. Only ${transferItem.stock} available in ${store.name}.`)
      return
    }

    const destIds = validRows.map(r => r.destination_store_id)
    if (new Set(destIds).size !== destIds.length) {
      setTransferError('Each destination store can only be selected once per transfer.')
      return
    }

    setTransferSubmitting(true)
    setTransferError('')

    try {
      const payload = {
        product_id: transferItem.product_id,
        transfers: validRows.map(r => ({
          destination_store_id: parseInt(r.destination_store_id),
          quantity: parseFloat(r.quantity)
        }))
      }

      const response = await api.post(`/stores/${store.id}/transfer`, payload)

      // Instantly close modal and display detailed success message!
      setShowTransferModal(false)
      setTransferSuccessToast(response.data.message || 'Inter-store transfer completed successfully!')
      setTimeout(() => setTransferSuccessToast(''), 7000)

      // Background cache invalidation and UI state refreshes
      invalidateCache('/stores')
      invalidateCache('/orders')
      invalidateCache(`/stores/${store.id}/inventory`)
      invalidateCache(`/stores/${store.id}/analytics`)
      validRows.forEach(r => {
        invalidateCache(`/stores/${r.destination_store_id}/inventory`)
        invalidateCache(`/stores/${r.destination_store_id}/analytics`)
      })

      fetchStoreAndInventory()
      fetchAnalytics()
    } catch (err) {
      console.error('Transfer failed:', err)
      setTransferError(err.response?.data?.detail || 'Failed to complete transfer. Please try again.')
    } finally {
      setTransferSubmitting(false)
    }
  }

  const hasWriteAccess = user?.role === 'admin' || user?.has_write_access === true

  // Tab state: default to 'analytics'
  const [activeTab, setActiveTab] = useState('analytics')
  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)

  // Movement range selector
  const [movementRange, setMovementRange] = useState('7')
  const [movementLoading, setMovementLoading] = useState(false)

  // Store info inline editing
  const [isEditingStoreInfo, setIsEditingStoreInfo] = useState(false)
  const [editPhone, setEditPhone] = useState('')
  const [editManagerName, setEditManagerName] = useState('')
  const [savingStoreInfo, setSavingStoreInfo] = useState(false)

  const handleStartEditStoreInfo = () => {
    setEditPhone(store?.phone || '')
    setEditManagerName(store?.manager_name || '')
    setIsEditingStoreInfo(true)
  }

  const handleSaveStoreInfo = async () => {
    try {
      setSavingStoreInfo(true)
      const res = await api.put(`/stores/${id}`, {
        phone: editPhone.trim() || null,
        manager_name: editManagerName.trim() || null
      })
      setStore(res.data)
      setIsEditingStoreInfo(false)
    } catch (err) {
      console.error('Failed to update store details:', err)
      alert(err.response?.data?.detail || 'Failed to update store details')
    } finally {
      setSavingStoreInfo(false)
    }
  }

  // Trending products range selector
  const [trendingRange, setTrendingRange] = useState('all')

  const TRENDING_RANGES = [
    { value: '1', label: 'Today' },
    { value: '7', label: 'This Week' },
    { value: '30', label: 'Last 30 Days' },
    { value: '90', label: 'Last 3 Months' },
    { value: 'all', label: 'All-Time' }
  ]

  const MOVEMENT_RANGES = [
    { value: '1', label: 'Today' },
    { value: '7', label: 'This Week' },
    { value: '30', label: 'Last 30 Days' },
    { value: '90', label: 'Last 3 Months' }
  ]

  useEffect(() => {
    fetchStoreAndInventory()
    fetchAnalytics()
  }, [id])

  // Re-fetch only movement data when range changes
  useEffect(() => {
    if (!analytics) return // wait for initial load
    fetchMovementData(movementRange)
  }, [movementRange])

  const fetchMovementData = async (days) => {
    try {
      setMovementLoading(true)
      const res = await api.get(`/stores/${id}/analytics`, { params: { days: parseInt(days) } })
      setAnalytics(prev => ({ ...prev, movement_data: res.data.movement_data }))
    } catch (err) {
      console.error('Failed to load movement data:', err)
    } finally {
      setMovementLoading(false)
    }
  }

  const fetchAnalytics = async () => {
    try {
      const cacheKey = `/stores/${id}/analytics`
      const hasCached = isCached(cacheKey)
      if (!hasCached && !analytics) {
        setAnalyticsLoading(true)
      }
      const res = await getWithCache(cacheKey, {
        onCacheUpdate: (newData) => setAnalytics(newData)
      })
      setAnalytics(res.data)
    } catch (err) {
      console.error('Failed to load store analytics:', err)
    } finally {
      setAnalyticsLoading(false)
    }
  }

  const fetchStoreAndInventory = async () => {
    try {
      const isCurrentlyLoading = !store || inventory.length === 0
      if (isCurrentlyLoading) setLoading(true)
      
      const [storeRes, invRes] = await Promise.all([
        getWithCache(`/stores/${id}`, {
          onCacheUpdate: (newData) => setStore(newData)
        }),
        getWithCache(`/stores/${id}/inventory`, {
          onCacheUpdate: (newData) => setInventory(newData || [])
        })
      ])
      setStore(storeRes.data)
      setInventory(invRes.data || [])
    } catch (err) {
      console.error('Failed to load store registry details:', err)
    } finally {
      setLoading(false)
    }
  }

  // Filter & Sort Inventory items
  const filteredInventory = useMemo(() => {
    let result = [...inventory]

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(item => 
        item.product_name.toLowerCase().includes(q)
      )
    }

    // Stock state filter
    if (filterStock === 'in') {
      result = result.filter(item => item.stock > (item.reorder_level ?? 15.0))
    } else if (filterStock === 'low') {
      result = result.filter(item => item.stock > 0 && item.stock <= (item.reorder_level ?? 15.0))
    } else if (filterStock === 'out') {
      result = result.filter(item => item.stock === 0)
    }

    // Brand filter
    if (filterBrand === 'dsl') {
      result = result.filter(item => item.product_brand?.toUpperCase() === 'DSL')
    } else if (filterBrand === 'dslp') {
      result = result.filter(item => item.product_brand?.toUpperCase() === 'DSLP')
    }

    // Sorting
    result.sort((a, b) => {
      if (sortBy === 'name-asc') return a.product_name.localeCompare(b.product_name)
      if (sortBy === 'name-desc') return b.product_name.localeCompare(a.product_name)
      if (sortBy === 'stock-desc') return b.stock - a.stock
      if (sortBy === 'stock-asc') return a.stock - b.stock
      return 0
    })

    return result
  }, [inventory, searchQuery, filterStock, filterBrand, sortBy])

  // Stats calculation
  const stats = useMemo(() => {
    const totalSKUs = inventory.length
    const totalStock = inventory.reduce((sum, item) => sum + item.stock, 0)
    const lowStockCount = inventory.filter(item => item.stock > 0 && item.stock <= (item.reorder_level ?? 15.0)).length
    const outOfStockCount = inventory.filter(item => item.stock === 0).length

    return { totalSKUs, totalStock, lowStockCount, outOfStockCount }
  }, [inventory])

  // Adjust stock & details
  const handleOpenAdjust = (item) => {
    setAdjustItem(item)
    setAdjustProductName(item.product_name || '')
    setAdjustProductBrand(item.product_brand || 'DSL')
    setAdjustValue(item.stock.toString())
    setAdjustReorderLevel((item.reorder_level ?? 15.0).toString())
    setError('')
  }

  const handleSaveAdjust = async (e) => {
    e.preventDefault()
    const val = parseFloat(adjustValue)
    const reorderVal = parseFloat(adjustReorderLevel)
    const newName = adjustProductName.trim()

    if (!newName) {
      setError('Product name cannot be empty')
      return
    }
    if (isNaN(val) || val < 0) {
      setError('Please enter a valid stock level >= 0')
      return
    }
    if (isNaN(reorderVal) || reorderVal < 0) {
      setError('Please enter a valid reorder level >= 0')
      return
    }

    const currentItem = adjustItem
    setAdjustItem(null)

    // Instant local UI update
    setInventory(prev => prev.map(item => 
      item.product_id === currentItem.product_id 
        ? { ...item, product_name: newName, product_brand: adjustProductBrand, stock: val, reorder_level: reorderVal } 
        : item
    ))

    // Instant success toast feedback
    setTransferSuccessToast(`Successfully updated details for ${newName}.`)
    setTimeout(() => setTransferSuccessToast(''), 6000)

    // Execute single atomic API request and cache invalidation in background
    try {
      await api.put(`/stores/${id}/inventory/${currentItem.product_id}`, { 
        stock: val,
        reorder_level: reorderVal,
        product_name: newName,
        product_brand: adjustProductBrand
      })

      invalidateCache('/products')
      invalidateCache('/stores')
      invalidateCache(`/stores/${id}/inventory`)
      invalidateCache(`/stores/${id}/analytics`)
      fetchAnalytics()
    } catch (err) {
      console.error("Failed to persist adjustment:", err)
    }
  }

  const handleDeleteProduct = async (product) => {
    if (!window.confirm(`Are you sure you want to delete ${product.product_name} from this store's inventory registry?`)) {
      return
    }

    setDeletingProductIds(prev => new Set(prev).add(product.product_id))

    setTimeout(async () => {
      try {
        await api.delete(`/stores/${id}/inventory/${product.product_id}`)
        invalidateCache('/stores')
        invalidateCache('/products')
        invalidateCache(`/stores/${id}/inventory`)
        invalidateCache(`/stores/${id}/analytics`)
        
        // Remove from local inventory state
        setInventory(prev => prev.filter(item => item.product_id !== product.product_id))
        setDeletingProductIds(prev => {
          const next = new Set(prev)
          next.delete(product.product_id)
          return next
        })

        setTransferSuccessToast(`${product.product_name} has been successfully deleted from ${store?.name || 'store'} inventory registry.`)
        setTimeout(() => setTransferSuccessToast(''), 5000)

        fetchAnalytics()
      } catch (err) {
        console.error("Failed to delete product from store:", err)
        setDeletingProductIds(prev => {
          const next = new Set(prev)
          next.delete(product.product_id)
          return next
        })
        alert(err.response?.data?.detail || 'Failed to delete product from store.')
      }
    }, 450)
  }

  const handleOpenAddModal = async () => {
    setShowAddModal(true)
    setAddMode('existing')
    setSelectedProductId('')
    setNewProdName('')
    setNewProdCategory('Other')
    setNewProdUnit('Pieces')
    setInitialStock('0')
    setModalError('')
    
    try {
      setModalLoading(true)
      const res = await getWithCache('/products', { params: { limit: 1000 } })
      const existingIds = new Set(inventory.map(item => item.product_id))
      const allProducts = res.data.items || res.data || []
      const available = allProducts.filter(p => !existingIds.has(p.id))
      setGlobalProducts(available)
    } catch (err) {
      setModalError('Failed to load global products list.')
    } finally {
      setModalLoading(false)
    }
  }

  const handleAddProduct = async (e) => {
    e.preventDefault()
    setModalError('')
    
    const stockVal = parseFloat(initialStock)
    if (isNaN(stockVal) || stockVal < 0) {
      setModalError('Initial stock must be >= 0')
      return
    }

    setUpdating(true)
    try {
      let productId = selectedProductId
      let productName = ''
      let productCategory = ''
      let productUnit = ''
      
      if (addMode === 'new') {
        if (!newProdName.trim()) {
          setModalError('Product name is required')
          setUpdating(false)
          return
        }
        const prodRes = await api.post('/products', {
          name: newProdName.trim(),
          category: newProdCategory,
          default_unit: newProdUnit,
          brand: newProdBrand
        })
        productId = prodRes.data.id
        productName = prodRes.data.name
        productCategory = prodRes.data.category
        productUnit = prodRes.data.default_unit
      } else {
        if (!productId) {
          setModalError('Please select a product')
          setUpdating(false)
          return
        }
        const selected = globalProducts.find(p => p.id === parseInt(productId))
        productName = selected.name
        productCategory = selected.category
        productUnit = selected.default_unit
      }

      const invRes = await api.put(`/stores/${id}/inventory/${productId}`, {
        stock: stockVal
      })
      invalidateCache(`/stores/${id}/inventory`)
      invalidateCache(`/stores/${id}/analytics`)
      fetchAnalytics()

      setInventory(prev => [
        ...prev,
        {
          id: invRes.data.id,
          store_id: parseInt(id),
          product_id: parseInt(productId),
          product_name: productName,
          product_category: productCategory,
          default_unit: productUnit,
          product_brand: invRes.data.product_brand || (addMode === 'new' ? newProdBrand : (globalProducts.find(p => p.id === parseInt(productId))?.brand || 'DSL')),
          stock: stockVal,
          unit_price: 0.0
        }
      ])
      
      setShowAddModal(false)
    } catch (err) {
      setModalError(err.response?.data?.detail || 'Failed to add product to store.')
    } finally {
      setUpdating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader2 className="animate-spin text-emerald-500" size={40} />
        <p className="text-zinc-400 text-sm">Loading inventory registry...</p>
      </div>
    )
  }

  if (!store) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
        <XCircle className="mx-auto text-red-500 mb-4" size={48} />
        <h3 className="text-lg font-bold text-white uppercase">Store not found</h3>
        <button onClick={() => navigate('/store')} className="mt-4 px-4 py-2 bg-zinc-800 text-white rounded-xl text-sm font-semibold">
          Back to Store Registry
        </button>
      </div>
    )
  }

  return (
    <div className="animate-in fade-in duration-300 space-y-6">
      {/* Back navigation & Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <button 
            onClick={() => navigate('/store')}
            className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm font-semibold transition-colors group"
          >
            <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
            Back to Store Registry
          </button>

          {hasWriteAccess && (
            <button
              onClick={handleOpenAddModal}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/35 rounded-xl text-xs font-bold transition-all duration-200 active:scale-[0.97]"
            >
              <Plus size={14} />
              Add Product to Store
            </button>
          )}
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              {store.is_central ? <Factory size={28} /> : <Building2 size={28} />}
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-black text-white uppercase tracking-tight">{store.name}</h1>
                {store.is_central && (
                  <span className="flex items-center gap-1 px-2.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[9px] font-bold uppercase tracking-wider text-amber-400">
                    <Crown size={10} />
                    Central Store (HQ)
                  </span>
                )}
                {isEditingStoreInfo ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 border border-emerald-500/50 text-zinc-100 text-xs rounded-xl shadow-inner">
                      <Phone size={13} className="text-emerald-400 shrink-0" />
                      <input
                        type="text"
                        placeholder="Phone number..."
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        className="bg-transparent text-white text-xs font-semibold focus:outline-none w-36"
                        autoFocus
                      />
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 border border-emerald-500/50 text-zinc-100 text-xs rounded-xl shadow-inner">
                      <User size={13} className="text-emerald-400 shrink-0" />
                      <span className="text-zinc-400 text-xs font-semibold">Manager:</span>
                      <input
                        type="text"
                        placeholder="Manager name..."
                        value={editManagerName}
                        onChange={(e) => setEditManagerName(e.target.value)}
                        className="bg-transparent text-white text-xs font-semibold focus:outline-none w-36"
                      />
                    </div>
                    <button
                      onClick={handleSaveStoreInfo}
                      disabled={savingStoreInfo}
                      className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-black text-xs font-bold rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50"
                    >
                      {savingStoreInfo ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                      <span>Save</span>
                    </button>
                    <button
                      onClick={() => setIsEditingStoreInfo(false)}
                      className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl transition-all"
                      title="Cancel"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <div 
                      onClick={hasWriteAccess ? handleStartEditStoreInfo : undefined}
                      className={`flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs font-semibold rounded-xl ${hasWriteAccess ? 'cursor-pointer hover:border-zinc-700 hover:text-white transition-all group' : ''}`}
                      title={hasWriteAccess ? "Click to edit phone number & manager" : ""}
                    >
                      <Phone size={13} className="text-zinc-500 group-hover:text-emerald-400 transition-colors" />
                      <span>{store.phone || <span className="text-zinc-500 italic">No phone set</span>}</span>
                    </div>

                    <div 
                      onClick={hasWriteAccess ? handleStartEditStoreInfo : undefined}
                      className={`flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs font-semibold rounded-xl ${hasWriteAccess ? 'cursor-pointer hover:border-zinc-700 hover:text-white transition-all group' : ''}`}
                      title={hasWriteAccess ? "Click to edit phone number & manager" : ""}
                    >
                      <User size={13} className="text-zinc-500 group-hover:text-emerald-400 transition-colors" />
                      <span>Manager: {store.manager_name || <span className="text-zinc-500 italic">Unassigned</span>}</span>
                    </div>

                    {hasWriteAccess && (
                      <button
                        onClick={handleStartEditStoreInfo}
                        className="p-1.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-emerald-400 rounded-xl transition-all flex items-center gap-1 text-xs font-semibold"
                        title="Edit Phone & Manager"
                      >
                        <Edit3 size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-zinc-400 text-sm mt-2">
                <MapPin size={14} className="text-zinc-500" />
                <span>{store.address || `${store.city}, ${store.state}`}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-5 hover:border-zinc-700 transition-colors">
          <p className="text-[10px] uppercase tracking-wider text-zinc-550 font-bold">Total SKUs</p>
          <p className="text-2xl font-black text-white mt-1">{stats.totalSKUs}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-5 hover:border-zinc-700 transition-colors">
          <p className="text-[10px] uppercase tracking-wider text-zinc-550 font-bold">Total Stock</p>
          <p className="text-2xl font-black text-white mt-1">{stats.totalStock} bags</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-5 hover:border-amber-500/20 transition-colors">
          <p className="text-[10px] uppercase tracking-wider text-zinc-550 font-bold">Low Stock Items</p>
          <p className={`text-2xl font-black mt-1 ${stats.lowStockCount > 0 ? 'text-amber-400' : 'text-white'}`}>
            {stats.lowStockCount}
          </p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-5 hover:border-red-500/20 transition-colors">
          <p className="text-[10px] uppercase tracking-wider text-zinc-550 font-bold">Out of Stock Items</p>
          <p className={`text-2xl font-black mt-1 ${stats.outOfStockCount > 0 ? 'text-red-400' : 'text-white'}`}>
            {stats.outOfStockCount}
          </p>
        </div>
      </div>

      {/* Switcher tabs */}
      <div className="flex border-b border-zinc-800 gap-2">
        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex items-center gap-2 px-5 py-3 font-semibold text-xs uppercase tracking-wider transition-all border-b-2 ${
            activeTab === 'analytics'
              ? 'border-emerald-500 text-white font-bold bg-emerald-500/5'
              : 'border-transparent text-zinc-550 hover:text-zinc-300'
          }`}
        >
          <BarChart3 size={14} /> Store Analytics
        </button>
        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex items-center gap-2 px-5 py-3 font-semibold text-xs uppercase tracking-wider transition-all border-b-2 ${
            activeTab === 'inventory'
              ? 'border-emerald-500 text-white font-bold bg-emerald-500/5'
              : 'border-transparent text-zinc-550 hover:text-zinc-300'
          }`}
        >
          <Package size={14} /> See Inventory
        </button>
      </div>

      {activeTab === 'analytics' ? (
        analyticsLoading ? (
          <div className="flex flex-col items-center justify-center min-h-[300px] space-y-4 bg-zinc-950/20 border border-zinc-900 rounded-2xl animate-in fade-in duration-200">
            <Loader2 className="animate-spin text-emerald-500" size={32} />
            <p className="text-zinc-550 text-xs font-semibold">Loading store analytics...</p>
          </div>
        ) : !analytics ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center animate-in fade-in duration-200">
            <TrendingUp className="mx-auto text-zinc-650 mb-3" size={48} />
            <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">No Analytics Data</h3>
            <p className="text-zinc-500 text-xs mt-1 font-medium">This store doesn't have any logged transactions or transfers yet.</p>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Analytics Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div
                onClick={() => {
                  setTransfersModalSearch('')
                  setTransfersModalType('inbound')
                }}
                className="bg-zinc-900 border border-zinc-800/80 hover:border-emerald-500/50 rounded-2xl p-5 cursor-pointer hover:bg-zinc-850 active:scale-[0.98] transition-all group"
                title="Click to view detailed inbound transfers"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold group-hover:text-emerald-400 transition-colors">Total Inbound Transfers</p>
                    <p className="text-2xl font-black text-white mt-1 flex items-center gap-2">
                      {analytics.total_incoming}
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">View List →</span>
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                    <ArrowRightLeft size={14} />
                  </div>
                </div>
              </div>

              <div
                onClick={() => {
                  setTransfersModalSearch('')
                  setTransfersModalType('outbound')
                }}
                className="bg-zinc-900 border border-zinc-800/80 hover:border-zinc-500/50 rounded-2xl p-5 cursor-pointer hover:bg-zinc-850 active:scale-[0.98] transition-all group"
                title="Click to view detailed outbound transfers"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold group-hover:text-white transition-colors">Total Outbound Transfers</p>
                    <p className="text-2xl font-black text-white mt-1 flex items-center gap-2">
                      {analytics.total_outgoing}
                      <span className="text-[10px] font-bold text-zinc-300 bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-700">View List →</span>
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                    <ArrowRightLeft size={14} className="rotate-180" />
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-5 hover:border-zinc-700 transition-colors">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-550 font-bold">DSL Brand Stock</p>
                    <p className="text-2xl font-black text-sky-400 mt-1">{analytics.dsl_stock} units</p>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 text-[10px] font-black">
                    DSL
                  </div>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-5 hover:border-zinc-700 transition-colors">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-550 font-bold">DSLP Brand Stock</p>
                    <p className="text-2xl font-black text-purple-400 mt-1">{analytics.dslp_stock} units</p>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 text-[9px] font-black">
                    DSLP
                  </div>
                </div>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top Trending Products Bar Chart */}
              <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-6 shadow-xl flex flex-col min-h-[350px]">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                  <div className="flex items-center gap-2">
                    <BarChart3 size={16} className="text-emerald-400" />
                    <h3 className="text-xs font-bold text-white uppercase tracking-wider">Top 5 Trending Products</h3>
                  </div>
                  <div className="relative flex items-center">
                    <select
                      value={trendingRange}
                      onChange={(e) => setTrendingRange(e.target.value)}
                      className="appearance-none bg-zinc-950 text-emerald-400 border border-zinc-800/80 hover:border-zinc-700 rounded-xl px-3 py-1.5 pr-8 text-[11px] font-bold focus:outline-none focus:border-emerald-500/50 cursor-pointer shadow-sm transition-colors"
                      style={{ colorScheme: 'dark' }}
                    >
                      {TRENDING_RANGES.map(range => (
                        <option key={range.value} value={range.value} className="bg-zinc-900 text-zinc-100 py-1">
                          {range.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 pointer-events-none text-emerald-400" />
                  </div>
                </div>
                <div 
                  className="flex-1 w-full h-[250px] cursor-pointer group relative"
                  onClick={() => navigate(`/store/${store.id}/trending?timeframe=${trendingRange}`)}
                  title="Click to view detailed customer breakdown"
                >
                  <div className="absolute inset-0 bg-zinc-800/0 group-hover:bg-zinc-800/10 transition-colors duration-300 rounded-xl z-10 pointer-events-none flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <span className="bg-black/80 text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm pointer-events-none transform translate-y-2 group-hover:translate-y-0 transition-all duration-300">
                      View Customer Breakdown
                    </span>
                  </div>
                  {(() => {
                    const currentTopProducts = (analytics?.top_products_by_range && analytics.top_products_by_range[trendingRange])
                      || (trendingRange === 'all' ? (analytics?.top_products || []) : [])

                    if (currentTopProducts && currentTopProducts.length > 0) {
                      return (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={currentTopProducts} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <XAxis dataKey="name" stroke="#71717a" fontSize={9} tickLine={false} />
                            <YAxis stroke="#71717a" fontSize={9} tickLine={false} />
                            <Tooltip
                              cursor={false}
                              contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px' }}
                              labelStyle={{ color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
                              itemStyle={{ color: '#ffffff', fontSize: '11px' }}
                            />
                            <Bar 
                              dataKey="quantity" 
                              fill="#ffffff" 
                              activeBar={{ fill: '#d4d4d8' }}
                              radius={[4, 4, 0, 0]} 
                              barSize={32} 
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      )
                    }

                    return (
                      <div className="h-full flex items-center justify-center text-zinc-550 text-xs font-medium">
                        No product transactions logged for this timeframe.
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* DSL vs DSLP Brand Mix Pie Chart */}
              <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-6 shadow-xl flex flex-col min-h-[350px]">
                <div className="flex items-center gap-2 mb-6">
                  <PieIcon size={16} className="text-sky-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Inventory Brand Share (DSL vs DSLP)</h3>
                </div>
                <div className="flex-1 w-full h-[250px] flex flex-col sm:flex-row items-center justify-center gap-6">
                  {analytics.dsl_count > 0 || analytics.dslp_count > 0 ? (
                    <>
                      <div className="w-full sm:w-1/2 h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'DSL Products', value: analytics.dsl_count },
                                { name: 'DSLP Products', value: analytics.dslp_count }
                              ]}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              <Cell fill="#0ea5e9" />
                              <Cell fill="#a855f7" />
                            </Pie>
                             <Tooltip
                              contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px' }}
                              itemStyle={{ color: '#ffffff', fontSize: '11px' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-col gap-3 text-xs font-semibold w-full sm:w-1/2">
                        <div className="flex items-center gap-3 p-3 bg-sky-950/10 border border-sky-900/30 rounded-xl">
                          <div className="w-3 h-3 rounded-full bg-sky-500 shrink-0" />
                          <div className="flex-1">
                            <span className="text-zinc-400 block text-[9px] uppercase tracking-wider font-bold">DSL Brand</span>
                            <span className="text-white text-xs">{analytics.dsl_count} catalog items ({analytics.dsl_stock} stock)</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-purple-950/10 border border-purple-900/30 rounded-xl">
                          <div className="w-3 h-3 rounded-full bg-purple-500 shrink-0" />
                          <div className="flex-1">
                            <span className="text-zinc-400 block text-[9px] uppercase tracking-wider font-bold">DSLP Brand</span>
                            <span className="text-white text-xs">{analytics.dslp_count} catalog items ({analytics.dslp_stock} stock)</span>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="h-full flex items-center justify-center text-zinc-550 text-xs font-medium">
                      No inventory items categorized.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Movement Flow Area Chart */}
            <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-6 shadow-xl flex flex-col min-h-[350px]">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft size={16} className="text-purple-400" />
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    Stock Movement Flow
                    {movementLoading && <span className="ml-2 text-zinc-500 normal-case font-medium">Updating...</span>}
                  </h3>
                </div>
                <div className="relative flex items-center">
                  <select
                    value={movementRange}
                    onChange={(e) => setMovementRange(e.target.value)}
                    className="appearance-none bg-zinc-950 text-purple-400 border border-zinc-800/80 hover:border-zinc-700 rounded-xl px-3 py-1.5 pr-8 text-[11px] font-bold focus:outline-none focus:border-purple-500/50 cursor-pointer shadow-sm transition-colors"
                    style={{ colorScheme: 'dark' }}
                  >
                    {MOVEMENT_RANGES.map(range => (
                      <option key={range.value} value={range.value} className="bg-zinc-900 text-zinc-100 py-1">
                        {range.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-2.5 pointer-events-none text-purple-400" />
                </div>
              </div>
              <div className={`flex-1 w-full h-[250px] transition-opacity duration-200 ${movementLoading ? 'opacity-40' : 'opacity-100'}`}>
                {analytics.movement_data && analytics.movement_data.length > 0 ? (
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={analytics.movement_data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorIncoming" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorOutgoing" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ffffff" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#ffffff" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#18181b" strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="date" 
                        stroke="#71717a" 
                        fontSize={9} 
                        tickLine={false}
                        tickFormatter={(val) => formatChartDate(val, movementRange)}
                        interval={movementRange === '90' ? 6 : movementRange === '30' ? 2 : 0}
                      />
                      <YAxis stroke="#71717a" fontSize={9} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px' }}
                        labelStyle={{ color: '#fff', fontSize: '11px', fontWeight: 'bold' }}
                        itemStyle={{ color: '#ffffff', fontSize: '11px' }}
                        labelFormatter={(val) => formatTooltipLabel(val, movementRange)}
                      />
                      <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
                      <Area name="Incoming Units (Received)" type="monotone" dataKey="incoming" stroke="#10b981" fillOpacity={1} fill="url(#colorIncoming)" strokeWidth={2} />
                      <Area name="Outgoing Units (Dispatched)" type="monotone" dataKey="outgoing" stroke="#ffffff" fillOpacity={1} fill="url(#colorOutgoing)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-zinc-550 text-xs font-medium">
                    {movementLoading ? 'Loading movement data...' : `No movements logged for ${MOVEMENT_RANGES.find(r => r.value === movementRange)?.label || 'this period'}.`}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      ) : (
        <>
          {/* Controls: Search, Sort, Filter */}
          <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4 shadow-xl">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-550" size={18} />
          <input
            type="text"
            placeholder="Search products in store..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-750 focus:border-emerald-500 text-white rounded-xl pl-10 pr-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-zinc-950 p-1 border border-zinc-800 rounded-xl">
            {['all', 'in', 'low', 'out'].map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterStock(mode)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors capitalize
                  ${filterStock === mode 
                    ? 'bg-zinc-800 text-white shadow-md' 
                    : 'text-zinc-400 hover:text-white'}`}
              >
                {mode === 'in' ? 'In Stock' : mode === 'low' ? 'Low Stock' : mode === 'out' ? 'Out of Stock' : 'All'}
              </button>
            ))}
          </div>

          <div className="flex bg-zinc-950 p-1 border border-zinc-800 rounded-xl">
            {['all', 'dsl', 'dslp'].map((brandOption) => (
              <button
                key={brandOption}
                onClick={() => setFilterBrand(brandOption)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors uppercase
                  ${filterBrand === brandOption 
                    ? 'bg-zinc-800 text-white shadow-md' 
                    : 'text-zinc-400 hover:text-white'}`}
              >
                {brandOption === 'all' ? 'All Brands' : brandOption}
              </button>
            ))}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsSortOpen(!isSortOpen)}
              className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 hover:border-zinc-750 text-xs font-bold text-zinc-300 rounded-xl px-3.5 py-2.5 transition-all duration-200 active:scale-[0.97]"
            >
              <ArrowUpDown size={14} className="text-zinc-500" />
              <span>{
                sortBy === 'name-asc' ? 'Product Name: A to Z' :
                sortBy === 'name-desc' ? 'Product Name: Z to A' :
                sortBy === 'stock-desc' ? 'Stock: High to Low' :
                'Stock: Low to High'
              }</span>
              <ChevronDown size={14} className={`text-zinc-550 transition-transform duration-250 ${isSortOpen ? 'rotate-180' : ''}`} />
            </button>

            {isSortOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setIsSortOpen(false)} />
                <div className="absolute right-0 mt-2 w-48 bg-zinc-950 border border-zinc-800 rounded-xl py-1.5 shadow-2xl z-20 animate-in fade-in slide-in-from-top-2 duration-150">
                  {[
                    { value: 'name-asc', label: 'Product Name: A to Z' },
                    { value: 'name-desc', label: 'Product Name: Z to A' },
                    { value: 'stock-desc', label: 'Stock: High to Low' },
                    { value: 'stock-asc', label: 'Stock: Low to High' }
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setSortBy(option.value)
                        setIsSortOpen(false)
                      }}
                      className={`w-full text-left px-4 py-2.5 text-xs font-bold transition-colors
                        ${sortBy === option.value 
                          ? 'bg-emerald-500/10 text-emerald-400' 
                          : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Unit View Selector */}
          <div className="flex bg-zinc-950 p-1 border border-zinc-800 rounded-xl">
            <button
              type="button"
              onClick={() => setViewUnit('Pieces')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors
                ${viewUnit === 'Pieces' ? 'bg-zinc-800 text-white shadow-md' : 'text-zinc-500 hover:text-white'}`}
            >
              Pieces (Pcs)
            </button>
            <button
              type="button"
              onClick={() => setViewUnit('Cartons')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors
                ${viewUnit === 'Cartons' ? 'bg-zinc-800 text-white shadow-md' : 'text-zinc-550 hover:text-white'}`}
            >
              Cartons
            </button>
          </div>

          {/* Grid / List View Toggle */}
          <div className="flex bg-zinc-950 p-1 border border-zinc-800 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-500 hover:text-white'}`}
              title="Grid View"
            >
              <Grid size={15} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-500 hover:text-white'}`}
              title="List View"
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Inventory Registry Catalog Grid */}
      {filteredInventory.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
          <Package className="mx-auto text-zinc-650 mb-3" size={48} />
          <h3 className="text-lg font-bold text-white uppercase">No products match</h3>
          <p className="text-zinc-500 text-sm mt-1">Try adjusting filters or search query.</p>
        </div>
      ) : viewMode === 'list' ? (
        <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-xl animate-in fade-in duration-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800/80 bg-zinc-950/50 text-[10px] uppercase tracking-wider text-zinc-550 font-bold">
                  <th className="px-6 py-4">Product</th>
                  <th className="px-6 py-4">Category</th>
                  <th className="px-6 py-4 text-right">Stock Level</th>
                  <th className="px-6 py-4 text-right">Reorder Level</th>
                  <th className="px-6 py-4">Status</th>
                  {hasWriteAccess && <th className="px-6 py-4 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50 text-sm">
                {filteredInventory.map((item) => {
                  const isOut = item.stock === 0
                  const isLow = item.stock > 0 && item.stock <= (item.reorder_level ?? 15.0)
                  const isDeletingProduct = deletingProductIds.has(item.product_id)
                  
                  return (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-zinc-800/20 transition-all duration-500 ease-in-out group ${
                        isDeletingProduct ? 'translate-x-[120%] opacity-0 scale-95 pointer-events-none bg-red-950/20' : 'opacity-100 scale-100'
                      }`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center border
                            ${isOut 
                              ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                              : isLow 
                                ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' 
                                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}
                          >
                            <Package size={16} />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-extrabold text-white group-hover:text-emerald-400 transition-colors">
                              {item.product_name}
                            </span>
                            {item.product_brand && (
                              <div>
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider uppercase border
                                  ${item.product_brand === 'DSLP' 
                                    ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' 
                                    : 'bg-sky-500/10 text-sky-400 border-sky-500/20'}`}
                                >
                                  {item.product_brand}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-0.5 bg-zinc-950 border border-zinc-800 rounded-lg text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                          {item.product_category || 'Other'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-black text-sm ${isOut ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-zinc-100'}`}>
                          {displayStockAndUnit(item.stock, item.product_name, viewUnit).value}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-bold ml-1 uppercase">
                          {displayStockAndUnit(item.stock, item.product_name, viewUnit).unit}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-zinc-400 font-bold text-sm">
                        <span>{displayStockAndUnit(item.reorder_level ?? 15.0, item.product_name, viewUnit).value}</span>
                        <span className="text-[10px] text-zinc-500 font-bold ml-1 uppercase">
                          {displayStockAndUnit(item.reorder_level ?? 15.0, item.product_name, viewUnit).unit}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {isOut ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 text-[9px] font-black uppercase rounded-lg tracking-wider">
                            Out of Stock
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-black uppercase rounded-lg tracking-wider">
                            Low Stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase rounded-lg tracking-wider">
                            In Stock
                          </span>
                        )}
                      </td>
                      {hasWriteAccess && (
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end items-center gap-2">
                            <button
                              onClick={() => handleOpenTransfer(item)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white rounded-lg text-xs font-bold transition-all active:scale-[0.96]"
                              title="Inter-Store Transfer"
                            >
                              <ArrowRightLeft size={12} />
                              Transfer
                            </button>
                            <button
                              onClick={() => handleOpenAdjust(item)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-750 text-zinc-355 hover:text-white rounded-lg text-xs font-bold transition-all active:scale-[0.96]"
                            >
                              <Edit3 size={12} />
                              Adjust Stock
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(item)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-950/20 hover:bg-red-900 border border-red-500/25 hover:border-red-650 text-red-400 hover:text-white rounded-lg text-xs font-bold transition-all active:scale-[0.96]"
                              title="Delete Product from Store"
                            >
                              <Trash2 size={12} />
                              Delete
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredInventory.map((item) => {
            const isOut = item.stock === 0
            const isLow = item.stock > 0 && item.stock <= (item.reorder_level ?? 15.0)
            const isDeletingProduct = deletingProductIds.has(item.product_id)
            
            return (
              <div 
                key={item.id}
                className={`group relative bg-zinc-900 border border-zinc-800 hover:border-zinc-700/80 rounded-2xl p-5 shadow-lg hover:shadow-2xl transition-all duration-500 ease-in-out flex flex-col justify-between ${
                  isDeletingProduct ? 'translate-x-[120%] opacity-0 scale-90 pointer-events-none' : 'opacity-100 scale-100'
                }`}
              >
                <div className="absolute top-0 right-0 w-28 h-28 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none group-hover:bg-emerald-500/10 transition-all duration-300" />
                
                <div>
                  {/* Top Row: Icon and stock status badge */}
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-emerald-400 group-hover:scale-105 transition-transform">
                      <Package size={20} />
                    </div>

                    {isOut ? (
                      <span className="px-2.5 py-1 bg-red-500/10 text-red-400 border border-red-500/20 text-[9px] font-black uppercase rounded-lg tracking-wider">
                        Out of Stock
                      </span>
                    ) : isLow ? (
                      <span className="px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-black uppercase rounded-lg tracking-wider animate-pulse">
                        Low Stock
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase rounded-lg tracking-wider">
                        In Stock
                      </span>
                    )}
                  </div>

                  {/* Product Details */}
                  <h3 className="font-extrabold text-white text-base leading-snug group-hover:text-emerald-400 transition-colors duration-200 line-clamp-2" title={item.product_name}>
                    {item.product_name}
                  </h3>
                  
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="px-2 py-0.5 bg-zinc-950 border border-zinc-800 rounded-lg text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
                      {item.product_category || 'Other'}
                    </span>
                    {item.product_brand && (
                      <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black tracking-wider uppercase border
                        ${item.product_brand === 'DSLP' 
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' 
                          : 'bg-sky-500/10 text-sky-400 border-sky-500/20'}`}
                      >
                        {item.product_brand}
                      </span>
                    )}
                  </div>
                </div>

                {/* Stock Level & Adjust Button */}
                <div className="mt-5 pt-4 border-t border-zinc-800/80 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] text-zinc-550 font-bold uppercase tracking-wider block">In Registry</span>
                    <span className={`text-base font-black block
                      ${isOut 
                        ? 'text-red-400' 
                        : isLow 
                          ? 'text-amber-400' 
                          : 'text-white'}`}
                    >
                      {displayStockAndUnit(item.stock, item.product_name, viewUnit).value} {displayStockAndUnit(item.stock, item.product_name, viewUnit).unit}
                    </span>
                    <span className="text-[9px] text-zinc-500 font-medium block mt-0.5">
                      Reorder: {displayStockAndUnit(item.reorder_level ?? 15.0, item.product_name, viewUnit).value} {displayStockAndUnit(item.reorder_level ?? 15.0, item.product_name, viewUnit).unit}
                    </span>
                  </div>

                  {hasWriteAccess && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleOpenTransfer(item)}
                        className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg transition-all active:scale-[0.93] border border-zinc-700/50 hover:border-zinc-600 flex items-center justify-center"
                        title="Inter-Store Transfer"
                      >
                        <ArrowRightLeft size={15} />
                      </button>
                      <button
                        onClick={() => handleOpenAdjust(item)}
                        className="p-2 bg-zinc-800 hover:bg-emerald-800 text-zinc-400 hover:text-white rounded-lg transition-all active:scale-[0.93] border border-zinc-700/50 hover:border-emerald-600/50 flex items-center justify-center"
                        title="Adjust Stock"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(item)}
                        className="p-2 bg-zinc-800 hover:bg-red-900 text-zinc-400 hover:text-white rounded-lg transition-all active:scale-[0.93] border border-zinc-700/50 hover:border-red-600/55 flex items-center justify-center"
                        title="Delete Product from Store"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )}

      {/* Adjust Stock Level Modal */}
      {adjustItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setAdjustItem(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md mx-4 p-6 shadow-2xl animate-in slide-in-from-bottom-4 duration-300" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-black text-white uppercase tracking-tight">Adjust Registry Stock</h2>
                <p className="text-zinc-400 text-xs mt-0.5 font-medium truncate max-w-[280px]">
                  {adjustItem.product_name}
                </p>
              </div>
              <button onClick={() => setAdjustItem(null)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-semibold">
                {error}
              </div>
            )}

            <form onSubmit={handleSaveAdjust} className="space-y-4">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-bold mb-1.5">
                  Product Name
                </label>
                <input
                  type="text"
                  value={adjustProductName}
                  onChange={(e) => setAdjustProductName(e.target.value)}
                  placeholder="Enter product name..."
                  className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-emerald-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-bold mb-1.5">
                  Product Brand (DSL vs DSLP)
                </label>
                <select
                  value={adjustProductBrand}
                  onChange={(e) => setAdjustProductBrand(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-emerald-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none cursor-pointer"
                >
                  <option value="DSL">DSL (DSL Nigeria)</option>
                  <option value="DSLP">DSLP (DSL Pharma)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-400 font-bold mb-1.5">
                  Current Stock Level ({adjustItem.default_unit}s)
                </label>
                <input
                  type="number"
                  step="any"
                  value={adjustValue}
                  onChange={(e) => setAdjustValue(e.target.value)}
                  placeholder="0"
                  className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-emerald-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] uppercase tracking-wider text-zinc-550 font-bold mb-1.5">
                  Reorder Level Threshold ({adjustItem.default_unit}s)
                </label>
                <input
                  type="number"
                  step="any"
                  value={adjustReorderLevel}
                  onChange={(e) => setAdjustReorderLevel(e.target.value)}
                  placeholder="15"
                  className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-emerald-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustItem(null)}
                  className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-xs font-bold rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-500/10 active:scale-[0.98]"
                >
                  {updating && <Loader2 className="animate-spin" size={13} />}
                  Save Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Product to Registry Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowAddModal(false)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md mx-4 p-6 shadow-2xl animate-in slide-in-from-bottom-4 duration-300" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-black text-white uppercase tracking-tight">Add Product to Registry</h2>
                <p className="text-zinc-400 text-xs mt-0.5 font-medium truncate max-w-[280px]">
                  Register or create a product for this store.
                </p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Modal Error */}
            {modalError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm font-semibold">
                {modalError}
              </div>
            )}

            {/* Modal Tabs */}
            <div className="flex border-b border-zinc-800 mb-4">
              <button
                type="button"
                onClick={() => setAddMode('existing')}
                className={`flex-1 pb-2.5 text-xs font-bold transition-colors
                  ${addMode === 'existing' 
                    ? 'border-b-2 border-emerald-500 text-white' 
                    : 'text-zinc-400 hover:text-white'}`}
              >
                Select Existing Product
              </button>
              <button
                type="button"
                onClick={() => setAddMode('new')}
                className={`flex-1 pb-2.5 text-xs font-bold transition-colors
                  ${addMode === 'new' 
                    ? 'border-b-2 border-emerald-500 text-white' 
                    : 'text-zinc-400 hover:text-white'}`}
              >
                Create New Product
              </button>
            </div>

            {modalLoading ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-2">
                <Loader2 className="animate-spin text-emerald-500" size={24} />
                <p className="text-zinc-500 text-xs font-semibold">Loading catalog items...</p>
              </div>
            ) : (
              <form onSubmit={handleAddProduct} className="space-y-4">
                {addMode === 'existing' ? (
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-zinc-550 font-bold mb-1.5">
                      Select Product
                    </label>
                    {globalProducts.length === 0 ? (
                      <div className="text-zinc-500 text-xs p-3 bg-zinc-950 border border-zinc-800 rounded-xl">
                        No additional products available in global catalog to add. Create a new one!
                      </div>
                    ) : (
                      <select
                        value={selectedProductId}
                        onChange={(e) => setSelectedProductId(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-emerald-500 text-white rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors focus:outline-none cursor-pointer"
                      >
                        <option value="">-- Choose Product --</option>
                        {globalProducts.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.default_unit})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-zinc-550 font-bold mb-1.5">
                        Product Name
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Enrol 1L"
                        value={newProdName}
                        onChange={(e) => setNewProdName(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-emerald-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] uppercase tracking-wider text-zinc-550 font-bold mb-1.5">
                          Category
                        </label>
                        <select
                          value={newProdCategory}
                          onChange={(e) => setNewProdCategory(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-emerald-500 text-white rounded-xl px-3 py-2.5 text-xs font-bold transition-colors focus:outline-none cursor-pointer"
                        >
                          <option value="Poultry">Poultry</option>
                          <option value="Equine">Equine</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] uppercase tracking-wider text-zinc-550 font-bold mb-1.5">
                          Default Unit
                        </label>
                        <select
                          value={newProdUnit}
                          onChange={(e) => setNewProdUnit(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-emerald-500 text-white rounded-xl px-3 py-2.5 text-xs font-bold transition-colors focus:outline-none cursor-pointer"
                        >
                          <option value="Pieces">Pieces (Pcs)</option>
                          <option value="Carton">Carton</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] uppercase tracking-wider text-zinc-550 font-bold mb-1.5">
                        Product Brand (DSL vs DSLP)
                      </label>
                      <select
                        value={newProdBrand}
                        onChange={(e) => setNewProdBrand(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-emerald-500 text-white rounded-xl px-3 py-2.5 text-xs font-bold transition-colors focus:outline-none cursor-pointer"
                      >
                        <option value="DSL">DSL (DSL Nigeria)</option>
                        <option value="DSLP">DSLP (DSL Pharma)</option>
                      </select>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-zinc-550 font-bold mb-1.5">
                    Initial Stock Level
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={initialStock}
                    onChange={(e) => setInitialStock(e.target.value)}
                    placeholder="0"
                    className="w-full bg-zinc-950 border border-zinc-800 hover:border-zinc-700 focus:border-emerald-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none"
                  />
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-xs font-bold rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updating || (addMode === 'existing' && globalProducts.length === 0)}
                    className="px-5 py-2.5 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-500/10 active:scale-[0.98]"
                  >
                    {updating && <Loader2 className="animate-spin" size={13} />}
                    Confirm Add
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Toast Notification Banner */}
      {transferSuccessToast && (
        <div className="fixed top-6 right-6 z-[100] max-w-md bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 px-5 py-4 rounded-2xl shadow-2xl backdrop-blur-md flex items-start gap-3 animate-in slide-in-from-top-4 duration-300">
          <CheckCircle className="text-emerald-400 shrink-0 mt-0.5" size={18} />
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-200">Transfer Successful</h4>
            <p className="text-xs font-semibold mt-0.5 text-emerald-300/90">{transferSuccessToast}</p>
          </div>
        </div>
      )}

      {/* Inter-Store Transfer Modal */}
      {showTransferModal && transferItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 p-4" onClick={() => setShowTransferModal(false)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white">
                  <ArrowRightLeft size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-white uppercase tracking-wider">Inter-Store Transfer</h2>
                  <p className="text-[11px] text-zinc-400 font-semibold truncate max-w-xs">
                    {transferItem.product_name}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setShowTransferModal(false)}
                className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmTransfer} className="p-6 space-y-4">
              {/* Product & Source Store Info Summary */}
              <div className="p-3.5 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400 font-semibold flex items-center gap-1.5">
                    <Building2 size={14} className="text-zinc-500" /> Source Store:
                  </span>
                  <span className="font-bold text-white uppercase tracking-wide">{store?.name}</span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-zinc-900">
                  <span className="text-zinc-400 font-semibold flex items-center gap-1.5">
                    <Package size={14} className="text-zinc-500" /> Current Available Stock:
                  </span>
                  <span className="font-extrabold text-emerald-400 text-sm">
                    {transferItem.stock} {transferItem.default_unit || 'Pieces'}
                  </span>
                </div>
              </div>

              {/* Error Banner */}
              {transferError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle size={15} className="shrink-0" />
                  <span>{transferError}</span>
                </div>
              )}

              {/* Destination Rows Header */}
              <div className="flex items-center justify-between pt-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Transfer Destinations
                </label>
                <span className="text-[10px] text-zinc-500 font-semibold">
                  Unit: {transferItem.default_unit || 'Pieces'}
                </span>
              </div>

              {/* Destination Rows List */}
              <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                {transferRows.map((row, idx) => {
                  const selectedStore = allStores.find(s => s.id === parseInt(row.destination_store_id))
                  const currentDestStock = row.destination_store_id 
                    ? (destInventories[row.destination_store_id]?.find(i => i.product_id === transferItem.product_id)?.stock || 0)
                    : 0
                  const transferQty = parseFloat(row.quantity) || 0
                  const unit = transferItem.default_unit || 'Pieces'
                  const availableStock = transferItem.stock || 0
                  const otherRowsTotal = transferRows
                    .filter((_, i) => i !== idx)
                    .reduce((sum, r) => sum + (parseFloat(r.quantity) || 0), 0)
                  const maxAllowed = Math.max(0, availableStock - otherRowsTotal)

                  return (
                    <div key={idx} className="p-3 bg-zinc-950/60 border border-zinc-800/80 rounded-xl space-y-2.5 relative group">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-200">
                          Destination #{idx + 1}
                        </span>
                        {transferRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveTransferRow(idx)}
                            className="text-zinc-500 hover:text-red-400 p-1 hover:bg-zinc-800 rounded transition-colors"
                            title="Remove Destination"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <select
                            required
                            value={row.destination_store_id}
                            onChange={(e) => handleUpdateTransferRow(idx, 'destination_store_id', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 focus:border-zinc-600 rounded-lg text-white text-xs font-semibold transition-colors focus:outline-none cursor-pointer"
                          >
                            <option value="">-- Select Store --</option>
                            {allStores
                              .filter(s => s.id !== store?.id)
                              .map(s => (
                                <option key={s.id} value={s.id}>
                                  {s.name} ({s.city})
                                </option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <input
                            type="number"
                            step="any"
                            min="0.01"
                            max={maxAllowed}
                            required
                            placeholder={`Max ${maxAllowed}...`}
                            value={row.quantity}
                            onChange={(e) => handleUpdateTransferRow(idx, 'quantity', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 focus:border-zinc-600 text-white placeholder-zinc-600 rounded-lg text-xs font-semibold transition-colors focus:outline-none"
                          />
                        </div>
                      </div>

                      {/* Live Stock info for Destination Store */}
                      {row.destination_store_id && selectedStore && (
                        <div className="pt-2 border-t border-zinc-900 flex items-center justify-between text-[11px] font-medium">
                          <span className="text-zinc-400">
                            Current in {selectedStore.name}: <strong className="text-white font-bold">{currentDestStock} {unit}</strong>
                          </span>
                          <span className="text-emerald-400 font-bold">
                            Total After: {currentDestStock + transferQty} {unit}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Add Destination Button */}
              <button
                type="button"
                onClick={handleAddTransferRow}
                className="w-full py-2 bg-zinc-950 hover:bg-zinc-800 border border-dashed border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm"
              >
                <Plus size={14} />
                <span>Add Another Destination Store</span>
              </button>

              {/* Live Remaining Stock Summary */}
              {(() => {
                const totalTransferQty = transferRows.reduce((sum, r) => sum + (parseFloat(r.quantity) || 0), 0)
                const remaining = (transferItem.stock || 0) - totalTransferQty
                const isOver = remaining < 0
                const validRows = transferRows.filter(r => r.destination_store_id && parseFloat(r.quantity) > 0)
                const unit = transferItem.default_unit || 'Pieces'

                return (
                  <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between text-zinc-400 font-medium">
                      <span>Total Quantity to Transfer:</span>
                      <span className="font-bold text-white">{totalTransferQty} {unit}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1.5 border-t border-zinc-900 font-semibold">
                      <span className="text-zinc-400">Remaining in {store?.name}:</span>
                      <span className={isOver ? 'text-red-400 font-bold' : 'text-emerald-400 font-bold'}>
                        {remaining} {unit}
                      </span>
                    </div>

                    {validRows.length > 0 && (
                      <div className="pt-2 border-t border-zinc-900 space-y-1">
                        <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block">
                          Destination Stores Stock Summary
                        </span>
                        {validRows.map((r, i) => {
                          const dStore = allStores.find(s => s.id === parseInt(r.destination_store_id))
                          const currentStk = destInventories[r.destination_store_id]?.find(item => item.product_id === transferItem.product_id)?.stock || 0
                          const addedQty = parseFloat(r.quantity) || 0
                          return (
                            <div key={i} className="flex items-center justify-between text-[11px]">
                              <span className="text-zinc-400 font-medium">{dStore?.name || 'Destination'}:</span>
                              <span className="text-emerald-400 font-bold">
                                {currentStk} → {currentStk + addedQty} {unit}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Action Buttons */}
              {(() => {
                const totalTransferQty = transferRows.reduce((sum, r) => sum + (parseFloat(r.quantity) || 0), 0)
                const remaining = (transferItem.stock || 0) - totalTransferQty
                const isInvalid = remaining < 0 || totalTransferQty <= 0 || (transferItem.stock || 0) <= 0

                return (
                  <div className="pt-2 flex items-center justify-end gap-3 border-t border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setShowTransferModal(false)}
                      disabled={transferSubmitting}
                      className="px-4 py-2.5 text-xs font-bold text-zinc-400 hover:text-white bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 rounded-xl transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={transferSubmitting || isInvalid}
                      className="px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/10 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {transferSubmitting ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          <span>Transferring...</span>
                        </>
                      ) : (
                        <>
                          <ArrowRightLeft size={14} />
                          <span>Confirm Transfer</span>
                        </>
                      )}
                    </button>
                  </div>
                )
              })()}
            </form>
          </div>
        </div>
      )}

      {/* Transfers List Modal */}
      {transfersModalType && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 p-4"
          onClick={() => setTransfersModalType(null)}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/80">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl border ${transfersModalType === 'inbound' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-zinc-800 border-zinc-700 text-white'}`}>
                  <ArrowRightLeft size={18} className={transfersModalType === 'outbound' ? 'rotate-180' : ''} />
                </div>
                <div>
                  <h2 className="text-sm font-extrabold text-white uppercase tracking-wider">
                    {transfersModalType === 'inbound' ? 'Inbound Transfers Registry' : 'Outbound Transfers Registry'}
                  </h2>
                  <p className="text-[11px] text-zinc-400 font-semibold">
                    Store: <span className="text-white font-bold">{store?.name}</span> ({transfersModalType === 'inbound' ? 'Received stock' : 'Sent stock'})
                  </p>
                </div>
              </div>

              <button
                onClick={() => setTransfersModalType(null)}
                className="p-1.5 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Filter / Search Bar */}
            {(() => {
              const rawList = transfersModalType === 'inbound' 
                ? (analytics?.incoming_transactions || [])
                : (analytics?.outgoing_transactions || [])
              
              const filteredList = rawList.filter(tx => {
                if (!transfersModalSearch.trim()) return true
                const query = transfersModalSearch.toLowerCase()
                const matchOrder = tx.order_number?.toLowerCase().includes(query)
                const matchFrom = tx.source_store_name?.toLowerCase().includes(query)
                const matchTo = (tx.destination_store_name || tx.customer_name)?.toLowerCase().includes(query)
                const matchItems = tx.line_items?.some(i => i.product_name?.toLowerCase().includes(query))
                return matchOrder || matchFrom || matchTo || matchItems
              })

              return (
                <>
                  <div className="p-4 bg-zinc-950/40 border-b border-zinc-800/80 flex items-center gap-3">
                    <div className="relative flex-1">
                      <Search size={15} className="absolute left-3 top-2.5 text-zinc-500" />
                      <input
                        type="text"
                        placeholder="Search by store, product, or order #..."
                        value={transfersModalSearch}
                        onChange={(e) => setTransfersModalSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 focus:border-zinc-600 rounded-xl text-white placeholder-zinc-500 text-xs font-semibold focus:outline-none transition-colors"
                      />
                    </div>
                    <span className="text-xs text-zinc-400 font-bold px-2">
                      Total: {filteredList.length}
                    </span>
                  </div>

                  {/* Transactions List */}
                  <div className="p-6 overflow-y-auto space-y-4 flex-1">
                    {filteredList.length === 0 ? (
                      <div className="py-12 text-center text-zinc-500 space-y-2">
                        <Package size={36} className="mx-auto text-zinc-600" />
                        <p className="text-xs font-semibold">No {transfersModalType} transfers found.</p>
                      </div>
                    ) : (
                      filteredList.map((tx) => {
                        const isInterStore = Boolean(tx.destination_store_name || (tx.source_store_name && tx.source_store_id !== store?.id))
                        const fromStore = tx.source_store_name || 'Agege Store'
                        const toStore = tx.destination_store_name || tx.customer_name || 'Customer Direct'

                        return (
                          <div
                            key={tx.id}
                            className="p-4 bg-zinc-950/80 border border-zinc-800 hover:border-zinc-700/80 rounded-2xl space-y-3 shadow-md transition-all"
                          >
                            {/* Header */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-900 pb-2.5">
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-white text-xs uppercase tracking-wide">
                                  {tx.order_number}
                                </span>
                                {isInterStore ? (
                                  <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-[9px] uppercase tracking-wider rounded-lg">
                                    Inter-Store Transfer
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-sky-500/10 border border-sky-500/20 text-sky-400 font-black text-[9px] uppercase tracking-wider rounded-lg">
                                    Customer Order
                                  </span>
                                )}
                              </div>

                              <span className="text-[11px] text-zinc-400 font-semibold">
                                {formatDateWithTime(tx.dispatch_time || tx.created_at)}
                              </span>
                            </div>

                            {/* Route: From -> To */}
                            <div className="flex items-center gap-3 text-xs py-1">
                              <div className="flex items-center gap-1.5 font-bold text-zinc-300">
                                <Building2 size={13} className="text-zinc-500" />
                                <span>FROM: <strong className="text-white">{fromStore}</strong></span>
                              </div>
                              <ArrowRight size={14} className="text-emerald-500 shrink-0" />
                              <div className="flex items-center gap-1.5 font-bold text-zinc-300">
                                <Building2 size={13} className="text-zinc-500" />
                                <span>TO: <strong className="text-emerald-400">{toStore}</strong></span>
                              </div>
                            </div>

                            {/* Line Items List */}
                            {tx.line_items && tx.line_items.length > 0 && (
                              <div className="pt-2 border-t border-zinc-900/80 space-y-1.5">
                                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                                  Transferred Items
                                </span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {tx.line_items.map((item, idx) => (
                                    <div key={idx} className="p-2 bg-zinc-900 border border-zinc-800/80 rounded-xl flex items-center justify-between text-xs">
                                      <div className="min-w-0 pr-2">
                                        <span className="font-extrabold text-white block truncate">{item.product_name}</span>
                                        <span className="text-[10px] text-zinc-400 font-semibold">{item.brand || 'DSL'}</span>
                                      </div>
                                      <span className="font-black text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-lg shrink-0 border border-emerald-500/20">
                                        {item.quantity} {item.unit || 'Pieces'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Bottom Bar: Link to order details */}
                            <div className="pt-2 border-t border-zinc-900 flex justify-end">
                              <button
                                onClick={() => {
                                  setTransfersModalType(null)
                                  navigate(`/orders/${tx.id}`)
                                }}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 px-3 py-1.5 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-all"
                              >
                                <span>View Order Manifest</span>
                                <ArrowRight size={13} />
                              </button>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

import React, { useState, useEffect, useRef } from 'react'
import api, { getWithCache, isCached, invalidateCache, clearCache } from '../services/api'
import { ChevronDown, ChevronLeft, ChevronRight, Filter, Search, Calendar, ArrowRight, MapPin, Trash2, Download } from 'lucide-react'
import { generateDeliveryAcknowledgment } from '../utils/pdfGenerator'
import DownloadAcknowledgmentModal from './DownloadAcknowledgmentModal'
import { formatDistanceToNow } from 'date-fns'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

// Module-level state — survives component unmount/remount during route navigation
let _cached = null

export default function OrdersTable() {
  const location = useLocation()
  const navState = location.state || {}
  const { hasWriteAccess } = useAuth()

  const [orders, setOrders] = useState(() => _cached?.orders ?? [])
  const [loading, setLoading] = useState(() => !_cached || !!location.state)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(() => _cached?.page ?? 0)
  const [totalOrders, setTotalOrders] = useState(() => _cached?.totalOrders ?? 0)
  const [searchTerm, setSearchTerm] = useState(() => navState.searchTerm ?? _cached?.searchTerm ?? '')
  const [filterState, setFilterState] = useState(() => navState.filterState ?? _cached?.filterState ?? '')
  const [searchInput, setSearchInput] = useState(searchTerm)
  const [stateInput, setStateInput] = useState(filterState)
  const [filterStatus, setFilterStatus] = useState(() => navState.filterStatus ?? _cached?.filterStatus ?? '')
  const [filterProductType, setFilterProductType] = useState(() => navState.filterProductType ?? _cached?.filterProductType ?? '')
  const [dateRange, setDateRange] = useState(() => navState.dateRange ?? _cached?.dateRange ?? '30days')
  const [expandedRows, setExpandedRows] = useState(new Set())
  const [scrollPosition, setScrollPosition] = useState({})
  const [activeDeliveryEditOrderId, setActiveDeliveryEditOrderId] = useState(null)
  const [deliveryTimeInput, setDeliveryTimeInput] = useState('')
  const [submittingOrderId, setSubmittingOrderId] = useState(null)
  const [acknowledgmentModalOrder, setAcknowledgmentModalOrder] = useState(null)
  const fetchRequestRef = useRef(0)

  useEffect(() => {
    if (location.state) {
      window.history.replaceState(null, '')
    }
  }, [location])

  // Sync state if navigation state changes
  useEffect(() => {
    if (navState.searchTerm !== undefined && navState.searchTerm !== searchInput) {
      setSearchInput(navState.searchTerm)
    }
  }, [navState.searchTerm])

  useEffect(() => {
    if (navState.filterState !== undefined && navState.filterState !== stateInput) {
      setStateInput(navState.filterState)
    }
  }, [navState.filterState])

  useEffect(() => {
    if (navState.filterStatus !== undefined && navState.filterStatus !== filterStatus) {
      setFilterStatus(navState.filterStatus)
      setPage(0)
    }
  }, [navState.filterStatus])

  useEffect(() => {
    if (navState.dateRange !== undefined && navState.dateRange !== dateRange) {
      setDateRange(navState.dateRange)
      setPage(0)
    }
  }, [navState.dateRange])

  // Debounce search term changes
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchTerm(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(handler)
  }, [searchInput])

  // Debounce filter state changes
  useEffect(() => {
    const handler = setTimeout(() => {
      setFilterState(stateInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(handler)
  }, [stateInput])

  const pageSize = 15

  useEffect(() => {
    fetchOrders()
  }, [page, searchTerm, filterState, filterStatus, filterProductType, dateRange])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [page])

  useEffect(() => {
    const handleOrderCreated = () => {
      fetchOrders()
    }
    window.addEventListener('order-created', handleOrderCreated)
    return () => {
      window.removeEventListener('order-created', handleOrderCreated)
    }
  }, [])

  const [deletingOrderIds, setDeletingOrderIds] = useState(new Set())
  const [toastMessage, setToastMessage] = useState('')

  const handleDeleteOrder = async (orderId, orderNumber) => {
    if (!window.confirm(`Are you sure you want to delete order ${orderNumber}? This action cannot be undone and will restore stock inventory levels.`)) {
      return
    }

    setDeletingOrderIds(prev => new Set(prev).add(orderId))

    setTimeout(async () => {
      try {
        await api.delete(`/orders/${orderId}`)
        clearCache()
        _cached = null
        setOrders(prev => prev.filter(o => String(o.id) !== String(orderId) && o.order_number !== String(orderId)))
        setTotalOrders(prev => Math.max(0, prev - 1))
        setDeletingOrderIds(prev => {
          const next = new Set(prev)
          next.delete(orderId)
          return next
        })
        setToastMessage(`Order ${orderNumber} deleted successfully.`)
        setTimeout(() => setToastMessage(''), 5000)
        fetchOrders()
      } catch (err) {
        console.error("Failed to delete order:", err)
        setDeletingOrderIds(prev => {
          const next = new Set(prev)
          next.delete(orderId)
          return next
        })
        if (err.response?.status === 404) {
          clearCache()
          _cached = null
          setOrders(prev => prev.filter(o => String(o.id) !== String(orderId) && o.order_number !== String(orderId)))
          setTotalOrders(prev => Math.max(0, prev - 1))
          setToastMessage(`Order ${orderNumber} has already been deleted.`)
          setTimeout(() => setToastMessage(''), 5000)
        } else {
          alert(err.response?.data?.detail || "Failed to delete order. Please try again.")
        }
      }
    }, 450)
  }

  const fetchOrders = async () => {
    const requestId = ++fetchRequestRef.current
    try {
      // Only show loading spinner if we have no persisted data to display
      if (!_cached) {
        setLoading(true)
      }

      let params = {
        skip: page * pageSize,
        limit: pageSize
      }

      // Add filters
      if (searchTerm) params.order_number = searchTerm
      if (filterState) params.state = filterState
      if (filterStatus) params.status = filterStatus
      if (filterProductType) params.product_name = filterProductType

      // Add date range filter
      const now = new Date()
      const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
      if (dateRange === '30days') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        params.start_date = thirtyDaysAgo.toISOString()
      } else if (dateRange === '7days') {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        params.start_date = sevenDaysAgo.toISOString()
      } else if (dateRange === 'today') {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        params.start_date = startOfToday.toISOString()
        params.end_date = endOfToday.toISOString()
      }

      const response = await api.get('/orders/', { params })

      if (requestId === fetchRequestRef.current) {
        const items = response.data.items || []
        const total = response.data.total || 0
        setOrders(items)
        setTotalOrders(total)
        setError(null)
        // Persist state for instant re-mount on navigation
        _cached = { orders: items, totalOrders: total, page, searchTerm, filterState, filterStatus, filterProductType, dateRange }
      }
    } catch (err) {
      if (requestId === fetchRequestRef.current) {
        console.error('Failed to fetch orders:', err)
        if (!_cached) {
          setError('Failed to load orders')
        }
      }
    } finally {
      if (requestId === fetchRequestRef.current) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    let targetScroll = window.scrollY
    let currentScroll = window.scrollY
    let animationFrameId = null
    let isAnimating = false

    const smoothScroll = () => {
      const actualScroll = window.scrollY
      
      // If scroll position was changed externally (e.g. native scroll or browser adjust),
      // sync immediately to prevent jumps.
      if (Math.abs(actualScroll - currentScroll) > 1) {
        currentScroll = actualScroll
        targetScroll = actualScroll
      }

      const diff = targetScroll - currentScroll
      if (Math.abs(diff) > 0.5) {
        // Fluid glide decay interpolation
        currentScroll = currentScroll + diff * 0.075
        window.scrollTo(0, currentScroll)
        animationFrameId = requestAnimationFrame(smoothScroll)
      } else {
        window.scrollTo(0, targetScroll)
        currentScroll = targetScroll
        isAnimating = false
        animationFrameId = null
      }
    }

    const handleWheel = (e) => {
      // Don't intercept pinch-to-zoom or horizontal scroll
      if (e.ctrlKey || Math.abs(e.deltaY) === 0) return

      if (e.cancelable) {
        e.preventDefault()

        const actualScroll = window.scrollY
        if (Math.abs(actualScroll - currentScroll) > 1) {
          currentScroll = actualScroll
          targetScroll = actualScroll
        }

        // Normalize delta
        let delta = e.deltaY
        if (e.deltaMode === 1) {
          delta *= 33
        } else if (e.deltaMode === 2) {
          delta *= window.innerHeight
        }

        // Dampen the speed by 25% (multiplier 0.75)
        targetScroll += delta * 0.75

        // Clamp target scroll boundaries
        const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
        targetScroll = Math.max(0, Math.min(targetScroll, maxScroll))

        if (!isAnimating) {
          isAnimating = true
          animationFrameId = requestAnimationFrame(smoothScroll)
        }
      } else {
        // If the event is non-cancelable (e.g. native trackpad compositor inertia),
        // stop JS animation and synchronize to avoid fighting.
        isAnimating = false
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId)
          animationFrameId = null
        }
        currentScroll = window.scrollY
        targetScroll = window.scrollY
      }
    }

    // Keep targets synced during native scrolling phases
    const handleScroll = () => {
      if (!isAnimating) {
        currentScroll = window.scrollY
        targetScroll = window.scrollY
      }
    }

    window.addEventListener('wheel', handleWheel, { passive: false })
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('wheel', handleWheel)
      window.removeEventListener('scroll', handleScroll)
      if (animationFrameId) cancelAnimationFrame(animationFrameId)
    }
  }, [])

  const toggleRowExpand = (orderId) => {
    const newExpanded = new Set(expandedRows)
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId)
    } else {
      newExpanded.add(orderId)
    }
    setExpandedRows(newExpanded)
  }

  const handleTableScroll = (e, orderId) => {
    setScrollPosition({
      ...scrollPosition,
      [orderId]: e.currentTarget.scrollLeft
    })
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN'
    }).format(amount)
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    } catch {
      return 'N/A'
    }
  }

  const getStatusBadgeColor = (status) => {
    const colors = {
      'In Transit': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'Delayed': 'bg-red-500/20 text-red-400 border-red-500/30',
      'Delivered (On Time)': 'bg-green-500/20 text-green-400 border-green-500/30',
      'Delivered (Late)': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      'Draft': 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
    }
    return colors[status] || colors['Draft']
  }

  const getLocalDatetimeString = () => {
    const now = new Date()
    const offset = now.getTimezoneOffset()
    const localDate = new Date(now.getTime() - offset * 60 * 1000)
    return localDate.toISOString().substring(0, 16)
  }

  const handleMarkDelivered = async (orderId) => {
    try {
      setSubmittingOrderId(orderId)
      const res = await api.patch(`/orders/${orderId}/mark-delivered`, {
        actual_delivery_time: new Date(deliveryTimeInput).toISOString()
      })
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...res.data } : o))
      setActiveDeliveryEditOrderId(null)
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to mark order as delivered.')
    } finally {
      setSubmittingOrderId(null)
    }
  }

  const totalPages = Math.ceil(totalOrders / pageSize)

  const getDispatchDate = (dateString) => {
    if (!dateString) return 'PENDING'
    try {
      const d = new Date(dateString)
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
    } catch {
      return 'PENDING'
    }
  }

  const getDispatchTime = (dateString) => {
    if (!dateString) return 'PENDING'
    try {
      const d = new Date(dateString)
      return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
    } catch {
      return 'PENDING'
    }
  }

  const getDispatchMonthYear = (dateString) => {
    if (!dateString) return 'JUN 2026'
    try {
      const d = new Date(dateString)
      const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
      return `${months[d.getMonth()]} ${d.getFullYear()}`
    } catch {
      return 'JUN 2026'
    }
  }

  const renderQRCode = (orderId, orderStatus, stateCode, monthYear) => {
    const qrData = `${window.location.origin}/orders/${orderId}`
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrData)}&color=ffffff&bgcolor=18181b&margin=0`

    return (
      <div className="flex items-center gap-3 mt-1 select-none">
        <div className="w-16 h-16 bg-zinc-900 p-0.5 border border-zinc-800/80 flex-shrink-0 flex items-center justify-center">
          <img
            src={qrUrl}
            alt="QR Code"
            className="w-full h-full object-contain"
            style={{ imageRendering: 'pixelated' }}
          />
        </div>
        <div className="text-[10px] font-bold text-zinc-400 tracking-widest leading-normal uppercase">
          <div>DIVERSAY · {orderStatus || 'DRAFT'} · {stateCode || 'LAG'} · {monthYear}</div>
          <div className="text-red-500 font-extrabold mt-1">SCAN TO VERIFY MANIFEST</div>
        </div>
      </div>
    )
  }

  const renderBarcode = (orderNumber) => {
    const seed = (orderNumber || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return (
      <div className="flex gap-[1.5px] h-10 items-end justify-center opacity-75 flex-shrink-0">
        {[...Array(20)].map((_, i) => {
          const width = ((seed + i * 7) % 3) + 1
          const isGap = (seed + i * 13) % 3 === 0
          return (
            <div
              key={i}
              className={`h-full ${isGap ? 'bg-transparent' : 'bg-zinc-300'}`}
              style={{ width: `${width}px` }}
            />
          )
        })}
      </div>
    )
  }

  if (error && orders.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center">
        <p className="text-red-400">{error}</p>
        <button
          onClick={fetchOrders}
          className="mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg">
      {/* Inline styles for the uniform electron border drawing animation with optimized performance */}
      <style>{`
        @keyframes border-draw {
          from {
            stroke-dashoffset: 100;
          }
          to {
            stroke-dashoffset: 0;
          }
        }
        .animate-border-draw-input {
          animation: border-draw 6s linear infinite;
          will-change: stroke-dashoffset;
          transform: translate3d(0, 0, 0);
        }
      `}</style>

      {/* Header with Filters */}
      <div className="p-6 border-b border-zinc-800">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
          <h3 className="text-xl font-bold text-white">All Orders</h3>
          <div className="text-sm text-zinc-400">
            Showing {orders.length > 0 ? page * pageSize + 1 : 0} to {Math.min((page + 1) * pageSize, totalOrders)} of {totalOrders} orders
          </div>
        </div>

        {/* Search and Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search by Order Number */}
          <div className="relative group rounded-lg bg-zinc-800 border border-zinc-700 transition-all focus-within:border-transparent">
            {/* Electron border glow on focus-within */}
            <div className="absolute inset-0 rounded-lg pointer-events-none opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 z-0">
              <svg className="absolute inset-0 w-full h-full rounded-lg" overflow="visible">
                <rect
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  rx="8"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2"
                  pathLength="100"
                  strokeDasharray="30 70"
                  className="blur-[2px] opacity-30 animate-border-draw-input"
                />
                <rect
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  rx="8"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1.2"
                  pathLength="100"
                  strokeDasharray="30 70"
                  className="opacity-100 animate-border-draw-input"
                />
              </svg>
            </div>

            <Search size={18} className="absolute left-3 top-3 text-zinc-500 z-10" />
            <input
              type="text"
              placeholder="Search order #..."
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value)
              }}
              className="w-full pl-10 pr-4 py-2 bg-transparent text-zinc-100 placeholder-zinc-500 focus:outline-none z-10 relative"
            />
          </div>

          {/* Filter by Date Range */}
          <div className="relative group rounded-lg bg-zinc-800 border border-zinc-700 transition-all focus-within:border-transparent">
            {/* Electron border glow on focus-within */}
            <div className="absolute inset-0 rounded-lg pointer-events-none opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 z-0">
              <svg className="absolute inset-0 w-full h-full rounded-lg" overflow="visible">
                <rect
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  rx="8"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2"
                  pathLength="100"
                  strokeDasharray="30 70"
                  className="blur-[2px] opacity-30 animate-border-draw-input"
                />
                <rect
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  rx="8"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1.2"
                  pathLength="100"
                  strokeDasharray="30 70"
                  className="opacity-100 animate-border-draw-input"
                />
              </svg>
            </div>

            <Calendar size={18} className="absolute left-3 top-3 text-zinc-500 z-10 pointer-events-none" />
            <select
              value={dateRange}
              onChange={(e) => {
                setDateRange(e.target.value)
                setPage(0)
              }}
              className="w-full pl-10 pr-10 py-2 bg-transparent text-zinc-100 focus:outline-none appearance-none transition-colors z-10 relative cursor-pointer"
            >
              <option value="30days" className="bg-zinc-800 text-zinc-100">Last 30 days</option>
              <option value="7days" className="bg-zinc-800 text-zinc-100">Last 7 days</option>
              <option value="today" className="bg-zinc-800 text-zinc-100">Today</option>
              <option value="all" className="bg-zinc-800 text-zinc-100">All time</option>
            </select>
            <ChevronDown size={16} className="absolute right-3 top-3 text-zinc-500 pointer-events-none z-10" />
          </div>

          {/* Filter by State */}
          <div className="relative group rounded-lg bg-zinc-800 border border-zinc-700 transition-all focus-within:border-transparent">
            {/* Electron border glow on focus-within */}
            <div className="absolute inset-0 rounded-lg pointer-events-none opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 z-0">
              <svg className="absolute inset-0 w-full h-full rounded-lg" overflow="visible">
                <rect
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  rx="8"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2"
                  pathLength="100"
                  strokeDasharray="30 70"
                  className="blur-[2px] opacity-30 animate-border-draw-input"
                />
                <rect
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  rx="8"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1.2"
                  pathLength="100"
                  strokeDasharray="30 70"
                  className="opacity-100 animate-border-draw-input"
                />
              </svg>
            </div>

            <Filter size={18} className="absolute left-3 top-3 text-zinc-500 z-10" />
            <input
              type="text"
              placeholder="Filter by state..."
              value={stateInput}
              onChange={(e) => {
                setStateInput(e.target.value)
              }}
              className="w-full pl-10 pr-4 py-2 bg-transparent text-zinc-100 placeholder-zinc-500 focus:outline-none z-10 relative"
            />
          </div>

          {/* Filter by Status */}
          <div className="relative group rounded-lg bg-zinc-800 border border-zinc-700 transition-all focus-within:border-transparent">
            {/* Electron border glow on focus-within */}
            <div className="absolute inset-0 rounded-lg pointer-events-none opacity-0 group-focus-within:opacity-100 transition-opacity duration-300 z-0">
              <svg className="absolute inset-0 w-full h-full rounded-lg" overflow="visible">
                <rect
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  rx="8"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2"
                  pathLength="100"
                  strokeDasharray="30 70"
                  className="blur-[2px] opacity-30 animate-border-draw-input"
                />
                <rect
                  x="0"
                  y="0"
                  width="100%"
                  height="100%"
                  rx="8"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="1.2"
                  pathLength="100"
                  strokeDasharray="30 70"
                  className="opacity-100 animate-border-draw-input"
                />
              </svg>
            </div>

            <Filter size={18} className="absolute left-3 top-3 text-zinc-500 z-10 pointer-events-none" />
            <select
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value)
                setPage(0)
              }}
              className="w-full pl-10 pr-10 py-2 bg-transparent text-zinc-100 focus:outline-none appearance-none transition-colors z-10 relative cursor-pointer"
            >
              <option value="" className="bg-zinc-800 text-zinc-100">All statuses</option>
              <option value="Draft" className="bg-zinc-800 text-zinc-100">Draft</option>
              <option value="In Transit" className="bg-zinc-800 text-zinc-100">In Transit</option>
              <option value="Delayed" className="bg-zinc-800 text-zinc-100">Delayed</option>
              <option value="Delivered (On Time)" className="bg-zinc-800 text-zinc-100">Delivered (On Time)</option>
              <option value="Delivered (Late)" className="bg-zinc-800 text-zinc-100">Delivered (Late)</option>
            </select>
            <ChevronDown size={16} className="absolute right-3 top-3 text-zinc-500 pointer-events-none z-10" />
          </div>
        </div>
      </div>

      {/* Ticket List Stack */}
      {loading ? (
        <div className="p-8 text-center text-zinc-400">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500 mb-3"></div>
          <p>Loading orders...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="p-8 text-center text-zinc-400">
          <p>No orders found. Try adjusting your filters.</p>
        </div>
      ) : (
        <div className="p-6 flex flex-col gap-6 bg-zinc-950/20">
          <div className="relative z-10 flex flex-col gap-20 pb-32">
            {orders.map((order, index) => {
              const stateName = order.customer_state || 'DESTINATION'
              const stateCode = stateName.substring(0, 3).toUpperCase()
              const monthYear = getDispatchMonthYear(order.dispatch_time)
              const deliveryDate = getDispatchDate(order.actual_delivery_time)
              const deliveryTime = getDispatchTime(order.actual_delivery_time)
              const expectedDate = getDispatchDate(order.expected_delivery_time)
              const expectedTime = getDispatchTime(order.expected_delivery_time)

              return (
                <div
                  key={order.id}
                  className={`sticky w-full h-[410px] bg-zinc-900 text-zinc-100 rounded-3xl flex hover:shadow-2xl hover:shadow-zinc-950/50 hover:border-zinc-700 hover:z-50 transition-all duration-500 ease-out font-sans border border-zinc-800 select-none ${
                    (deletingOrderIds.has(order.id) || deletingOrderIds.has(order.order_number))
                      ? '-translate-x-[150%] opacity-0 pointer-events-none scale-95'
                      : ''
                  }`}
                  style={{
                    top: `${120 + Math.min(index, 5) * 16}px`,
                    zIndex: index + 10
                  }}
                >
                  {/* Left & Right tear notch cutouts (bite effect) */}
                  <div className="absolute top-[-1px] right-[22%] translate-x-1/2 w-6 h-3 rounded-b-full bg-[#151518] border-b border-l border-r border-zinc-800 z-20" />
                  <div className="absolute bottom-[-1px] right-[22%] translate-x-1/2 w-6 h-3 rounded-t-full bg-[#151518] border-t border-l border-r border-zinc-800 z-20" />

                  {/* Vertical Tear-off line */}
                  <div className="absolute top-3 bottom-3 right-[22%] border-r border-dashed border-zinc-800 z-10" />

                  {/* Left Section (78% width) */}
                  <div className="w-[78%] pt-8 px-8 pb-8 flex flex-col justify-between relative h-full">

                    {/* Header Row */}
                    <div className="flex justify-between items-center">
                      <div className="text-xl font-black tracking-tighter uppercase text-white flex items-center gap-1.5">
                        DIVERSAY
                        <svg width="46" height="20" viewBox="80 15 510 230" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block ml-1 align-middle">
                          <path d="M321.007 49.6339C312.259 49.8485 303.507 49.8862 294.758 49.747C291.715 49.723 284.561 49.8485 281.778 49.5077L281.811 49.0177C283.356 47.7207 296.422 41.7541 299.207 40.434L323.86 28.9803C330.967 25.61 337.862 22.0228 345.214 19.1262C349.571 17.4088 350.772 17.4789 355.028 19.5913C365.045 24.5631 374.675 30.229 384.486 35.5839C390.607 38.8699 404.754 45.483 409.737 49.6298L385.463 49.7143C381.604 49.7083 373.158 49.4776 369.608 50.1362C369.378 56.3798 369.412 151.449 369.885 152.405C369.121 154.984 369.522 174.181 369.452 178.258L402.185 178.218C403.666 178.211 410.328 177.838 411.292 178.084C412.032 178.352 412.502 178.424 413.29 178.423L503.081 177.99L536.732 178C542.873 178.002 550.415 178.223 556.439 177.802C556.702 168.685 556.212 157.007 557.169 148.047L557.476 147.838C558.037 148.278 562.977 155.199 564.044 156.501C573.815 168.433 583.578 180.395 593.279 192.385C593.896 193.149 595.65 195.587 595.744 196.532C595.814 197.209 594.313 199.768 593.819 200.389C589.436 205.93 585.023 211.565 580.633 217.101L557.036 247.154C557.026 246.271 556.996 245.381 556.943 244.499C556.379 235.18 556.486 225.907 556.526 216.575C545.328 216.823 533.326 216.594 522.044 216.604L455.834 216.604L254.706 216.6L175.456 216.612L150.833 216.557C145.743 216.546 139.082 216.413 134.119 216.914C133.883 226.266 134.39 237.427 133.746 246.472C129.426 242.839 124.672 235.384 120.821 230.675C113.012 221.028 105.318 211.253 97.7056 201.45C95.2882 198.337 94.1143 196.517 96.7609 193.314C107.45 180.379 117.723 167.129 128.362 154.151C130.078 152.057 132.117 150.599 133.441 148.331L133.522 148.19C134.444 150.24 134.169 168.926 134.158 172.471C134.27 173.585 134.476 174.697 134.132 175.755L134.461 177.256C136.004 178.242 158.548 177.92 162.508 177.925L208.961 177.938C229.287 177.938 251.913 178.587 272.027 177.979C274.492 178.299 278.19 178.223 280.725 178.244C281.85 178.253 281.965 178.096 282.558 177.43C283.555 177.511 283.753 177.59 284.694 177.945C288.146 178.41 294.342 178.235 298.004 178.237L320.987 178.233C321.088 168.826 321.058 159.417 320.897 150.011C321.007 49.6339Z" fill="#FE0100"/>
                          <path d="M134.158 172.471C134.27 173.585 134.476 174.697 134.132 175.755L134.461 177.257C136.004 178.242 158.547 177.92 162.508 177.925L208.96 177.938C229.286 177.938 251.913 178.587 272.027 177.979C274.491 178.3 278.189 178.223 280.725 178.244C281.85 178.253 281.965 178.096 282.558 177.43C283.555 177.511 283.752 177.59 284.694 177.945C282.131 179.522 204.23 178.982 194.047 178.987L158.661 178.998C150.541 178.999 142.005 179.122 133.919 178.696C133.892 176.816 134.07 174.39 134.158 172.471Z" fill="#690003"/>
                          <path d="M444.782 63.5029C461.727 69.8704 478.593 76.4534 495.371 83.25C500.132 85.1359 512.874 89.3007 516.163 91.8317C517.361 99.8967 517.15 108.128 517.811 116.098C518.835 128.43 519.415 140.984 520.493 153.252C515.709 147.917 511.019 142.251 506.349 136.805C502.75 132.608 500.051 128.919 495.882 125.145C490.658 129.581 477.772 136.498 471.594 140.366L411.291 178.084C410.327 177.838 403.666 178.211 402.185 178.218L369.451 178.258C369.521 174.181 369.121 154.984 369.885 152.405C374.959 149.373 379.468 146.251 384.355 143.272L438.951 109.967C447.264 104.844 455.556 99.7072 464.029 94.8531C465.737 93.8744 467.235 92.9903 468.799 91.7693C461.354 84.8652 452.364 70.9237 444.782 63.5029Z" fill="#CD9933"/>
                          <path d="M198.206 125.045C195.925 128.075 176.284 151.591 175.017 151.94C174.358 150.941 178.008 95.5795 179.428 91.5902C180.824 89.9503 206.259 80.4284 209.853 79.0129L233.033 70.1118C238.836 67.8554 243.74 65.6799 249.701 63.7363C242.025 73.1922 234.206 82.5305 226.245 91.748C230.759 95.4443 241.821 101.257 247.276 104.715C271.705 119.992 296.246 135.092 320.896 150.011C321.057 159.418 321.088 168.826 320.987 178.233L298.004 178.237C294.342 178.235 288.146 178.41 284.694 177.945C283.752 177.59 283.555 177.511 282.558 177.43C276.446 173.078 264.941 166.494 258.386 162.389L198.206 125.045Z" fill="#CD9933"/>
                        </svg>
                      </div>

                      <div className="flex items-center gap-4 text-center">
                        <div className="flex flex-col items-center text-center">
                          <div className="text-sm font-black tracking-widest text-white leading-none">AGEGE</div>
                          <div className="text-[9px] font-bold text-zinc-500 tracking-wider uppercase mt-1">LAGOS</div>
                        </div>
                        <div className="text-red-500 flex items-center justify-center">
                          <svg className="w-12 h-3" fill="none" viewBox="0 0 48 12" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2 6h42M38 2l6 4-6 4" />
                          </svg>
                        </div>
                        <div className="flex flex-col items-center text-center">
                          <div className="text-sm font-black tracking-widest text-white leading-none">DEST</div>
                          <div className="text-[9px] font-bold text-zinc-500 tracking-wider uppercase mt-1 truncate max-w-[85px]" title={stateName}>
                            {stateName}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Dotted border above customer */}
                    <div className="border-t border-dashed border-zinc-800 w-full mt-4" />

                    {/* Passenger / Customer Details */}
                    <div className="py-3">
                      <div className="text-[9px] font-bold text-zinc-500 tracking-widest uppercase mb-1">CUSTOMER</div>
                      <div className="text-xl font-black tracking-tight text-white uppercase truncate leading-none">
                        {order.customer_name}
                      </div>
                    </div>

                    {/* Dotted border below customer */}
                    <div className="border-t border-dashed border-zinc-800 w-full mb-4" />

                    {/* Specifications Grid */}
                    <div className="grid grid-cols-4 gap-2 py-2 mb-4 text-left">
                      <div className="flex flex-col items-start text-left">
                        <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">EXPECTED DATE</div>
                        <div className="text-sm font-black text-white mt-1 uppercase truncate w-full">{expectedDate}</div>
                      </div>
                      <div className="flex flex-col items-center text-center">
                        <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">EXPECTED TIME</div>
                        <div className="text-sm font-black text-white mt-1 uppercase truncate w-full">{expectedTime}</div>
                      </div>
                      <div className="flex flex-col items-center text-center">
                        <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">DELIVERY DATE</div>
                        <div className="text-sm font-black text-white mt-1 uppercase truncate w-full">{deliveryDate}</div>
                      </div>
                      <div className="flex flex-col items-center text-center">
                        <div className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">DELIVERY TIME</div>
                        <div className="text-sm font-black text-white mt-1 uppercase truncate w-full">{deliveryTime}</div>
                      </div>
                    </div>

                    {/* QR Code, manifest verification info & Delete button */}
                    <div className="flex items-center justify-between my-4 gap-3">
                      <div className="flex items-center gap-3">
                        {renderQRCode(order.id, order.order_status, stateCode, monthYear)}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            setAcknowledgmentModalOrder(order)
                          }}
                          className="p-2 bg-emerald-950/30 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/40 rounded-lg border border-emerald-900/40 hover:border-emerald-500/60 transition-all cursor-pointer z-30 flex items-center justify-center shadow-sm shrink-0"
                          title="Download Delivery Acknowledgment"
                        >
                          <Download size={15} />
                        </button>
                        {hasWriteAccess && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              handleDeleteOrder(order.id, order.order_number)
                            }}
                            className="p-2 bg-red-950/30 text-red-500 hover:text-red-400 hover:bg-red-900/40 rounded-lg border border-red-900/40 hover:border-red-500/60 transition-all cursor-pointer z-30 flex items-center justify-center shadow-sm shrink-0"
                            title="Delete Order"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Secure button / link banner */}
                    <Link
                      to={`/orders/${order.id}`}
                      className="block w-full bg-zinc-950 hover:bg-white hover:text-zinc-950 text-white py-3 rounded-md font-black text-[10px] tracking-[0.2em] uppercase transition-all duration-300 mt-2 border border-zinc-800/80 hover:border-white hover:shadow-lg hover:shadow-white/10"
                    >
                      <span className="flex items-center justify-center gap-2">
                        SEE ORDER DETAILS
                        <svg className="w-5 h-3 ml-0.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </span>
                    </Link>
                  </div>

                  {/* Right Section (Ticket Stub - 22% width) */}
                  <div className="w-[22%] pt-6 px-6 pb-8 flex flex-col justify-between items-center text-center relative z-10 pl-4 h-full">
                    {/* Logo stub */}
                    <div>
                      <div className="flex items-center justify-center py-0.5">
                        <svg width="42" height="18" viewBox="80 15 510 230" fill="none" xmlns="http://www.w3.org/2000/svg" className="inline-block">
                          <path d="M321.007 49.6339C312.259 49.8485 303.507 49.8862 294.758 49.747C291.715 49.723 284.561 49.8485 281.778 49.5077L281.811 49.0177C283.356 47.7207 296.422 41.7541 299.207 40.434L323.86 28.9803C330.967 25.61 337.862 22.0228 345.214 19.1262C349.571 17.4088 350.772 17.4789 355.028 19.5913C365.045 24.5631 374.675 30.229 384.486 35.5839C390.607 38.8699 404.754 45.483 409.737 49.6298L385.463 49.7143C381.604 49.7083 373.158 49.4776 369.608 50.1362C369.378 56.3798 369.412 151.449 369.885 152.405C369.121 154.984 369.522 174.181 369.452 178.258L402.185 178.218C403.666 178.211 410.328 177.838 411.292 178.084C412.032 178.352 412.502 178.424 413.29 178.423L503.081 177.99L536.732 178C542.873 178.002 550.415 178.223 556.439 177.802C556.702 168.685 556.212 157.007 557.169 148.047L557.476 147.838C558.037 148.278 562.977 155.199 564.044 156.501C573.815 168.433 583.578 180.395 593.279 192.385C593.896 193.149 595.65 195.587 595.744 196.532C595.814 197.209 594.313 199.768 593.819 200.389C589.436 205.93 585.023 211.565 580.633 217.101L557.036 247.154C557.026 246.271 556.996 245.381 556.943 244.499C556.379 235.18 556.486 225.907 556.526 216.575C545.328 216.823 533.326 216.594 522.044 216.604L455.834 216.604L254.706 216.6L175.456 216.612L150.833 216.557C145.743 216.546 139.082 216.413 134.119 216.914C133.883 226.266 134.39 237.427 133.746 246.472C129.426 242.839 124.672 235.384 120.821 230.675C113.012 221.028 105.318 211.253 97.7056 201.45C95.2882 198.337 94.1143 196.517 96.7609 193.314C107.45 180.379 117.723 167.129 128.362 154.151C130.078 152.057 132.117 150.599 133.441 148.331L133.522 148.19C134.444 150.24 134.169 168.926 134.158 172.471C134.27 173.585 134.476 174.697 134.132 175.755L134.461 177.256C136.004 178.242 158.548 177.92 162.508 177.925L208.961 177.938C229.287 177.938 251.913 178.587 272.027 177.979C274.492 178.299 278.19 178.223 280.725 178.244C281.85 178.253 281.965 178.096 282.558 177.43C283.555 177.511 283.753 177.59 284.694 177.945C288.146 178.41 294.342 178.235 298.004 178.237L320.987 178.233C321.088 168.826 321.058 159.417 320.897 150.011C321.592 141.629 321.114 126.566 321.109 117.5L321.007 49.6339Z" fill="#FE0100"/>
                          <path d="M134.158 172.471C134.27 173.585 134.476 174.697 134.132 175.755L134.461 177.257C136.004 178.242 158.547 177.92 162.508 177.925L208.96 177.938C229.286 177.938 251.913 178.587 272.027 177.979C274.491 178.3 278.189 178.223 280.725 178.244C281.85 178.253 281.965 178.096 282.558 177.43C283.555 177.511 283.752 177.59 284.694 177.945C282.131 179.522 204.23 178.982 194.047 178.987L158.661 178.998C150.541 178.999 142.005 179.122 133.919 178.696C133.892 176.816 134.07 174.39 134.158 172.471Z" fill="#690003"/>
                          <path d="M444.782 63.5029C461.727 69.8704 478.593 76.4534 495.371 83.25C500.132 85.1359 512.874 89.3007 516.163 91.8317C517.361 99.8967 517.15 108.128 517.811 116.098C518.835 128.43 519.415 140.984 520.493 153.252C515.709 147.917 511.019 142.251 506.349 136.805C502.75 132.608 500.051 128.919 495.882 125.145C490.658 129.581 477.772 136.498 471.594 140.366L411.291 178.084C410.327 177.838 403.666 178.211 402.185 178.218L369.451 178.258C369.521 174.181 369.121 154.984 369.885 152.405C374.959 149.373 379.468 146.251 384.355 143.272L438.951 109.967C447.264 104.844 455.556 99.7072 464.029 94.8531C465.737 93.8744 467.235 92.9903 468.799 91.7693C461.354 84.8652 452.364 70.9237 444.782 63.5029Z" fill="#CD9933"/>
                          <path d="M198.206 125.045C195.925 128.075 176.284 151.591 175.017 151.94C174.358 150.941 178.008 95.5795 179.428 91.5902C180.824 89.9503 206.259 80.4284 209.853 79.0129L233.033 70.1118C238.836 67.8554 243.74 65.6799 249.701 63.7363C242.025 73.1922 234.206 82.5305 226.245 91.748C230.759 95.4443 241.821 101.257 247.276 104.715C271.705 119.992 296.246 135.092 320.896 150.011C321.057 159.418 321.088 168.826 320.987 178.233L298.004 178.237C294.342 178.235 288.146 178.41 284.694 177.945C283.752 177.59 283.555 177.511 282.558 177.43C276.446 173.078 264.941 166.494 258.386 162.389L198.206 125.045Z" fill="#CD9933"/>
                        </svg>
                      </div>
                      <div className="text-[10px] font-bold text-zinc-500 tracking-[0.2em] uppercase mt-0.5">ORDER SUMMARY</div>
                    </div>

                    {/* Status & Name Stub */}
                    <div className="flex flex-col gap-6 my-4 w-full px-1">
                      <div>
                        <div className="text-[9px] font-bold text-zinc-500 tracking-[0.2em] uppercase mb-0.5">STATUS</div>
                        <div className="text-[13px] font-black text-red-500 uppercase tracking-[0.1em] truncate">
                          {order.order_status.replace(/ \(On Time\)|\(Late\)/i, '')}
                        </div>
                      </div>

                      <div className="max-w-full">
                        <div className="text-[9px] font-bold text-zinc-500 tracking-[0.2em] uppercase mb-0.5">CUSTOMER</div>
                        <div className="text-[12px] font-black text-white uppercase tracking-wide truncate">
                          {order.customer_name}
                        </div>
                      </div>

                      <div className="text-[10px] font-bold text-zinc-500 tracking-[0.15em] uppercase">
                        {monthYear}
                      </div>
                    </div>

                    {/* Delivery Confirmation Widget */}
                    <div className="w-full px-1 my-2 min-h-[42px] flex items-center justify-center">
                      {activeDeliveryEditOrderId === order.id ? (
                        <div className="flex flex-col gap-1.5 w-full bg-zinc-800/80 p-2 rounded-xl border border-zinc-700/60 animate-fadeIn">
                          <label className="text-[8px] font-black text-zinc-400 tracking-wider uppercase text-left">
                            Delivery Date & Time
                          </label>
                          <input
                            type="datetime-local"
                            value={deliveryTimeInput}
                            onChange={(e) => setDeliveryTimeInput(e.target.value)}
                            className="w-full px-2 py-1 bg-zinc-900 border border-zinc-700 rounded text-[11px] text-white focus:outline-none focus:border-zinc-500"
                          />
                          <div className="flex gap-1 mt-0.5">
                            <button
                              type="button"
                              onClick={() => handleMarkDelivered(order.id)}
                              disabled={submittingOrderId === order.id}
                              className="flex-1 py-1 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-[9px] uppercase tracking-wider rounded transition-colors flex items-center justify-center gap-1"
                            >
                              {submittingOrderId === order.id ? (
                                <span className="inline-block animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                              ) : (
                                'Confirm'
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveDeliveryEditOrderId(null)}
                              disabled={submittingOrderId === order.id}
                              className="px-2 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-300 hover:text-white font-bold text-[9px] uppercase tracking-wider rounded transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : order.order_status.toLowerCase().includes('delivered') ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[9px] font-extrabold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 border border-emerald-500/20 rounded uppercase tracking-wider">
                            ✓ Delivered
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveDeliveryEditOrderId(order.id)
                              const d = order.actual_delivery_time ? new Date(order.actual_delivery_time) : new Date()
                              const offset = d.getTimezoneOffset()
                              const localDate = new Date(d.getTime() - offset * 60 * 1000)
                              setDeliveryTimeInput(localDate.toISOString().substring(0, 16))
                            }}
                            className="text-[8px] font-semibold text-zinc-500 hover:text-zinc-300 transition-colors underline"
                          >
                            Change Date
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveDeliveryEditOrderId(order.id)
                            setDeliveryTimeInput(getLocalDatetimeString())
                          }}
                          className="w-full py-1.5 px-3 bg-zinc-800 hover:bg-white text-zinc-300 hover:text-zinc-900 border border-zinc-700/80 hover:border-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-300 hover:shadow-lg active:scale-95"
                        >
                          Mark Delivered
                        </button>
                      )}
                    </div>

                    {/* Barcode */}
                    <div className="mt-auto pt-2 w-full flex justify-center">
                      {renderBarcode(order.order_number)}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Visual fan-out overlapping ticket stack at the bottom of the list */}
          {orders.length > 0 && (
            <div className="relative mt-12 mb-16 flex flex-col items-center justify-center pointer-events-none w-full">
              {/* Layer 1 (Back-most) */}
              <div className="absolute inset-y-0 left-0 right-0 mx-auto w-[91%] bg-zinc-900 border border-zinc-800 rounded-2xl transform translate-y-8 z-0 opacity-20" />
              {/* Layer 2 */}
              <div className="absolute inset-y-0 left-0 right-0 mx-auto w-[92%] bg-zinc-900 border border-zinc-800 rounded-2xl transform translate-y-6 z-10 opacity-40" />
              {/* Layer 3 */}
              <div className="absolute inset-y-0 left-0 right-0 mx-auto w-[93%] bg-zinc-900 border border-zinc-800 rounded-2xl transform translate-y-4 z-20 opacity-60" />
              {/* Layer 4 */}
              <div className="absolute inset-y-0 left-0 right-0 mx-auto w-[94%] bg-zinc-900 border border-zinc-800 rounded-2xl transform translate-y-2 z-30 opacity-80" />
              {/* Layer 5 (Foreground) */}
              <div className="relative w-[95%] bg-zinc-900 border border-zinc-800 text-white rounded-2xl p-4 z-40 flex items-center justify-between shadow-xl">
                <span className="text-xs font-black uppercase tracking-[0.15em] pl-4">
                  {totalOrders - (page * pageSize + orders.length) > 0 ? `${totalOrders - (page * pageSize + orders.length)}+ More Manifests (Stacked)` : 'End of Stack'}
                </span>
                <div className="flex gap-1 pr-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" style={{ animationDelay: '0.2s' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" style={{ animationDelay: '0.4s' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-800">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 rounded-lg transition-colors"
          >
            <ChevronLeft size={18} />
            Previous
          </button>

          <div className="text-zinc-400 text-sm">
            Page {page + 1} of {totalPages}
          </div>

          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page === totalPages - 1}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-300 rounded-lg transition-colors"
          >
            Next
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* Download Acknowledgment Address Modal */}
      <DownloadAcknowledgmentModal
        isOpen={!!acknowledgmentModalOrder}
        onClose={() => setAcknowledgmentModalOrder(null)}
        order={acknowledgmentModalOrder}
      />
    </div>
  )
}

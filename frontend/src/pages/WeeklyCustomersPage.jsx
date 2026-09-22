import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../services/api'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts'
import {
  ArrowLeft,
  Search,
  Calendar,
  Users,
  ShoppingBag,
  DollarSign,
  TrendingUp,
  ChevronRight,
  User,
  Activity,
  Clock,
  Percent,
  X
} from 'lucide-react'

// Helper for Levenshtein distance calculation
const levenshteinDistance = (s1, s2) => {
  const len1 = s1.length
  const len2 = s2.length
  const matrix = Array.from({ length: len1 + 1 }, () => Array(len2 + 1).fill(0))

  for (let i = 0; i <= len1; i++) matrix[i][0] = i
  for (let j = 0; j <= len2; j++) matrix[0][j] = j

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }
  return matrix[len1][len2]
}

// Helper for robust fuzzy matching (e.g. typos, substring matches, transpositions)
const fuzzyMatch = (query, target) => {
  if (!query || !target) return false
  const q = String(query).toLowerCase().trim()
  const t = String(target).toLowerCase().trim()

  if (t.includes(q)) return true

  const qWords = q.split(/\s+/)
  const tWords = t.split(/\s+/)

  return qWords.every(qw => {
    if (tWords.some(tw => tw.includes(qw))) return true

    return tWords.some(tw => {
      const maxDistance = qw.length <= 4 ? 1 : 2
      const dist = levenshteinDistance(qw, tw)
      if (dist <= maxDistance) return true

      if (tw.length > qw.length) {
        for (let i = 0; i <= tw.length - qw.length; i++) {
          const sub = tw.substring(i, i + qw.length)
          if (levenshteinDistance(qw, sub) <= Math.max(0, maxDistance - 1)) {
            return true
          }
        }
      }
      return false
    })
  })
}

// Constants matching professional minimalist zinc-white styling guidelines
const STATUS_COLORS = {
  'Delivered': '#10b981',  // Emerald Green
  'InTransit': '#f59e0b',  // Warm Amber / Gold
  'Delayed': '#ef4444'     // Vibrant Red
}

const PIE_COLORS = [
  '#ffffff', // Crisp Zinc White
  '#e4e4e7', // Zinc 200 (Light Silver)
  '#cbd5e1', // Slate 300 (Titanium Silver)
  '#94a3b8', // Slate 400 (Cool Steel)
  '#64748b', // Slate 500 (Mid Slate)
  '#475569', // Slate 600 (Dark Slate)
  '#334155'  // Slate 700 (Deep Charcoal)
]

// Date Formatting helpers
const getDispatchMonthYear = (dtStr) => {
  if (!dtStr) return 'N/A'
  try {
    const d = new Date(dtStr)
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()
  } catch {
    return 'N/A'
  }
}
const getDispatchDate = (dtStr) => {
  if (!dtStr) return 'N/A'
  try {
    const d = new Date(dtStr)
    return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }).toUpperCase()
  } catch {
    return 'N/A'
  }
}
const getDispatchTime = (dtStr) => {
  if (!dtStr) return 'N/A'
  try {
    const d = new Date(dtStr)
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  } catch {
    return 'N/A'
  }
}

// Persistent memory cache to store orders by time range key
let _weeklyOrdersCache = {}

// Custom Glassmorphism Tooltip for Area Chart
const CustomFulfillmentTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const total = payload.reduce((acc, entry) => acc + (entry.value || 0), 0)
    return (
      <div className="bg-zinc-950/95 border border-zinc-800 backdrop-blur-md px-4 py-3 rounded-xl shadow-2xl space-y-2">
        <p className="text-xs font-black text-white uppercase tracking-wider border-b border-zinc-800/80 pb-1.5">
          {label}
        </p>
        <div className="space-y-1.5">
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center justify-between gap-6 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: entry.color }} />
                <span className="text-zinc-300 font-semibold">{entry.name}</span>
              </div>
              <span className="text-white font-bold">{entry.value}</span>
            </div>
          ))}
        </div>
        {total > 0 && (
          <div className="pt-1.5 border-t border-zinc-800/80 flex items-center justify-between text-[11px]">
            <span className="text-zinc-400 font-semibold">Total Orders</span>
            <span className="text-emerald-400 font-bold">{total}</span>
          </div>
        )}
      </div>
    )
  }
  return null
}

export default function WeeklyCustomersPage() {
  const navigate = useNavigate()
  const [timeRange, setTimeRange] = useState('all') // all, 7days, 14days, thisweek
  const [orders, setOrders] = useState(() => _weeklyOrdersCache['all'] ?? [])
  const [loading, setLoading] = useState(() => !_weeklyOrdersCache['all'])
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedOrdersModal, setSelectedOrdersModal] = useState(null)

  const handleCardClick = (customer, statusType, statusTitle) => {
    let matches = []
    if (statusType === 'Delivered') {
      matches = customer.orders.filter(o => o.order_status && o.order_status.includes('Delivered'))
    } else if (statusType === 'InTransit') {
      matches = customer.orders.filter(o => o.order_status === 'In Transit')
    } else if (statusType === 'Delayed') {
      matches = customer.orders.filter(o => o.order_status === 'Delayed')
    } else if (statusType === 'Share') {
      matches = customer.orders
    }

    if (matches.length === 1) {
      navigate(`/orders/${matches[0].id}`)
    } else if (matches.length > 1) {
      setSelectedOrdersModal({
        customerName: customer.name,
        statusTitle,
        orders: matches
      })
    }
  }

  // Mouse hover states for charting
  const [hoveredSlice, setHoveredSlice] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
  }

  // Calculate dates based on selected range
  const dateBounds = useMemo(() => {
    if (timeRange === 'all') {
      return {
        start: null,
        end: null,
        displayStart: 'Beginning',
        displayEnd: 'Present',
        isAllTime: true
      }
    }

    const now = new Date()
    let startDate = new Date()
    let endDate = new Date()

    if (timeRange === '7days') {
      startDate.setDate(now.getDate() - 7)
    } else if (timeRange === '14days') {
      startDate.setDate(now.getDate() - 14)
    } else if (timeRange === 'thisweek') {
      // Monday of this week
      const day = now.getDay()
      const diff = now.getDate() - day + (day === 0 ? -6 : 1)
      const monday = new Date(now)
      monday.setDate(diff)
      monday.setHours(0, 0, 0, 0)
      startDate = monday

      // Sunday of this week
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      sunday.setHours(23, 59, 59, 999)
      endDate = sunday
    }

    return {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      displayStart: startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      displayEnd: endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      isAllTime: false
    }
  }, [timeRange])

  // Fetch orders for the calculated date bounds
  useEffect(() => {
    // Instantly retrieve cached data if available for this time range to avoid loading layout state shifts
    if (_weeklyOrdersCache[timeRange]) {
      setOrders(_weeklyOrdersCache[timeRange])
    } else {
      setOrders([])
    }

    const fetchWeeklyData = async () => {
      try {
        if (!_weeklyOrdersCache[timeRange]) {
          setLoading(true)
        }
        const baseParams = {}
        if (!dateBounds.isAllTime) {
          baseParams.start_date = dateBounds.start
          baseParams.end_date = dateBounds.end
        }

        // 1. Single fast initial request with limit 500 & trailing slash (prevents 307 redirects)
        const limit = 500
        const firstRes = await api.get('/orders/', { params: { ...baseParams, limit, skip: 0 } })
        let allItems = firstRes.data.items || []
        const total = firstRes.data.total || 0

        // 2. Parallel fetch for remaining items if dataset exceeds 500
        if (total > allItems.length) {
          const remainingPromises = []
          for (let skip = limit; skip < total; skip += limit) {
            remainingPromises.push(api.get('/orders/', { params: { ...baseParams, limit, skip } }))
          }
          const restResponses = await Promise.all(remainingPromises)
          restResponses.forEach(res => {
            if (res.data?.items) {
              allItems = allItems.concat(res.data.items)
            }
          })
        }

        setOrders(allItems)
        _weeklyOrdersCache[timeRange] = allItems
        setError(null)
      } catch (err) {
        console.error('Failed to load weekly orders data:', err)
        if (!_weeklyOrdersCache[timeRange]) {
          setError('Failed to load logistics audit data')
        }
      } finally {
        setLoading(false)
      }
    }

    fetchWeeklyData()
  }, [dateBounds.start, dateBounds.end, dateBounds.isAllTime, timeRange])

  // Process data for analytics and list
  const processedData = useMemo(() => {
    if (orders.length === 0) {
      return {
        customersList: [],
        totalOrdersCount: 0,
        totalWeeklyValue: 0,
        onTimeRate: 0
      }
    }

    const customerMap = {}
    let totalWeeklyValue = 0
    let deliveredOnTime = 0
    let totalEvaluated = 0

    orders.forEach(order => {
      // Calculate order total from items
      let orderVal = 0
      if (order.line_items) {
        order.line_items.forEach(item => {
          orderVal += (item.quantity || 0) * (item.unit_price || 0)
        })
      }
      totalWeeklyValue += orderVal

      // Operational efficiency (on-time rate) calculations
      if (order.order_status) {
        if (order.order_status.includes('Delivered')) {
          totalEvaluated++
          if (order.order_status.includes('On Time')) {
            deliveredOnTime++
          }
        } else if (order.order_status === 'Delayed') {
          totalEvaluated++
        }
      }

      const custId = order.customer_id || (order.customer ? order.customer.id : 'unknown')
      const custName = order.customer ? order.customer.name : 'Unknown Customer'
      const custState = order.customer ? order.customer.state : 'Unknown State'

      if (!customerMap[custId]) {
        customerMap[custId] = {
          id: custId,
          name: custName,
          state: custState,
          orders: [],
          totalValue: 0,
          statusBreakdown: {
            Delivered: 0,
            InTransit: 0,
            Delayed: 0
          }
        }
      }

      customerMap[custId].orders.push(order)
      customerMap[custId].totalValue += orderVal

      // Classify statuses
      const status = order.order_status || ''
      if (status.includes('Delivered')) {
        customerMap[custId].statusBreakdown.Delivered++
      } else if (status === 'In Transit') {
        customerMap[custId].statusBreakdown.InTransit++
      } else if (status === 'Delayed') {
        customerMap[custId].statusBreakdown.Delayed++
      }
    })

    const totalOrdersCount = orders.length
    const onTimeRate = totalEvaluated > 0 ? (deliveredOnTime / totalEvaluated) * 100 : 0

    const customersList = Object.values(customerMap).map(c => {
      const count = c.orders.length
      const share = totalOrdersCount > 0 ? (count / totalOrdersCount) * 100 : 0
      const valueShare = totalWeeklyValue > 0 ? (c.totalValue / totalWeeklyValue) * 100 : 0

      return {
        ...c,
        orderCount: count,
        orderShare: Number(share.toFixed(1)),
        valueShare: Number(valueShare.toFixed(1))
      }
    })

    // Sort by order count descending
    customersList.sort((a, b) => b.orderCount - a.orderCount)

    return {
      customersList,
      totalOrdersCount,
      totalWeeklyValue,
      onTimeRate: Number(onTimeRate.toFixed(1))
    }
  }, [orders])

  // Filter list based on search term
  const filteredCustomers = useMemo(() => {
    const term = searchTerm.toLowerCase().trim()
    if (!term) return processedData.customersList

    return processedData.customersList.filter(c =>
      fuzzyMatch(term, c.name) || fuzzyMatch(term, c.state)
    )
  }, [processedData.customersList, searchTerm])

  // Visualisation 1: Donut Share Data (Top 5 + Others)
  const chartPieData = useMemo(() => {
    const list = processedData.customersList
    if (list.length === 0) return []

    if (list.length <= 5) {
      return list.map(c => ({ name: c.name, value: c.orderCount, share: c.orderShare }))
    }

    const top5 = list.slice(0, 5).map(c => ({ name: c.name, value: c.orderCount, share: c.orderShare }))
    const othersCount = list.slice(5).reduce((sum, c) => sum + c.orderCount, 0)
    const othersShare = list.slice(5).reduce((sum, c) => sum + c.orderShare, 0)

    top5.push({
      name: 'Others',
      value: othersCount,
      share: Number(othersShare.toFixed(1))
    })
    return top5
  }, [processedData.customersList])

  // Visualisation 2: Stacked Status Data (Top 8 customers)
  const chartBarData = useMemo(() => {
    return processedData.customersList.slice(0, 8).map(c => ({
      name: c.name.length > 12 ? c.name.substring(0, 12) + '...' : c.name,
      Delivered: c.statusBreakdown.Delivered,
      InTransit: c.statusBreakdown.InTransit,
      Delayed: c.statusBreakdown.Delayed
    }))
  }, [processedData.customersList])

  return (
    <div className="animate-in fade-in duration-300">
      {/* Back button & Title Section */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm font-semibold mb-3 group"
          >
            <ArrowLeft size={16} className="transform group-hover:-translate-x-1 transition-transform" />
            Back to Dashboard
          </button>
          <h1 className="text-3xl font-black tracking-tight text-white uppercase">
            Weekly Logistics Audit
          </h1>
          <p className="text-zinc-400 text-sm mt-1">
            Analyzing customer contributions and delivery health from <span className="text-zinc-200 font-semibold">{dateBounds.displayStart}</span> to <span className="text-zinc-200 font-semibold">{dateBounds.displayEnd}</span>
          </p>
        </div>

        {/* Time Selector Dropdown */}
        <div className="flex items-center gap-2 self-start md:self-center">
          <Calendar size={16} className="text-zinc-400" />
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-xl px-4 py-2 text-sm font-semibold focus:outline-none focus:border-zinc-700 cursor-pointer"
          >
            <option value="all">All Time</option>
            <option value="7days">Past 7 Days</option>
            <option value="thisweek">This Current Week</option>
            <option value="14days">Past 14 Days</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center text-zinc-400">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500 mb-3"></div>
          <p>Analyzing weekly customer data...</p>
        </div>
      ) : error ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center text-red-400">
          <p>{error}</p>
        </div>
      ) : (
        <>
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-5 flex items-center justify-between shadow-lg shadow-black/10">
              <div>
                <span className="text-[10px] font-bold text-zinc-500 tracking-wider uppercase">Active Customers</span>
                <h3 className="text-3xl font-black text-white mt-1">{processedData.customersList.length}</h3>
                <p className="text-[10px] text-zinc-400 mt-0.5">Placed orders in duration</p>
              </div>
              <div className="bg-zinc-950 border border-zinc-800/60 p-3 rounded-xl text-zinc-400">
                <Users size={22} />
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-5 flex items-center justify-between shadow-lg shadow-black/10">
              <div>
                <span className="text-[10px] font-bold text-zinc-500 tracking-wider uppercase">Weekly Volume</span>
                <h3 className="text-3xl font-black text-white mt-1">{processedData.totalOrdersCount}</h3>
                <p className="text-[10px] text-zinc-400 mt-0.5">Total dispatched waybills</p>
              </div>
              <div className="bg-zinc-950 border border-zinc-800/60 p-3 rounded-xl text-zinc-400">
                <ShoppingBag size={22} />
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-5 flex items-center justify-between shadow-lg shadow-black/10">
              <div>
                <span className="text-[10px] font-bold text-zinc-500 tracking-wider uppercase">Gross Load Value</span>
                <h3 className="text-2xl font-black text-white mt-1.5 font-mono">
                  ₦{processedData.totalWeeklyValue.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </h3>
                <p className="text-[10px] text-zinc-400 mt-0.5">Estimated total revenue</p>
              </div>
              <div className="bg-zinc-950 border border-zinc-800/60 p-3 rounded-xl text-zinc-400">
                <DollarSign size={22} />
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-5 flex items-center justify-between shadow-lg shadow-black/10">
              <div>
                <span className="text-[10px] font-bold text-zinc-500 tracking-wider uppercase">Logistics Accuracy</span>
                <h3 className="text-3xl font-black text-white mt-1">{processedData.onTimeRate}%</h3>
                <p className="text-[10px] text-zinc-400 mt-0.5">Delivered on-time efficiency</p>
              </div>
              <div className="bg-zinc-950 border border-zinc-800/60 p-3 rounded-xl text-zinc-400">
                <Activity size={22} />
              </div>
            </div>
          </div>

          {/* Visualizations Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Chart 1: Donut (Contribution Share) */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between shadow-xl group">
              <div>
                <h3 className="text-md font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                  <TrendingUp size={18} className="text-zinc-400" />
                  Order Contribution Share
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">Percentage share of total weekly order counts by customer</p>
              </div>

              <div
                className="h-56 relative flex items-center justify-center my-4"
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoveredSlice(null)}
              >
                {chartPieData.length === 0 ? (
                  <p className="text-zinc-500 text-sm">No volume data to chart</p>
                ) : (
                  <div className="w-full h-full spin-roll">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartPieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={65}
                          outerRadius={85}
                          paddingAngle={2}
                          dataKey="value"
                          stroke="#09090b"
                          strokeWidth={2}
                          onMouseEnter={(entry) => setHoveredSlice(entry)}
                          onMouseLeave={() => setHoveredSlice(null)}
                        >
                          {chartPieData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={PIE_COLORS[index % PIE_COLORS.length]}
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Donut Inner HUD */}
                {!hoveredSlice ? (
                  <div className="absolute flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-3xl font-black text-white">{processedData.totalOrdersCount}</span>
                    <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">Total Orders</span>
                  </div>
                ) : (
                  <div className="absolute flex flex-col items-center justify-center pointer-events-none px-4 text-center max-w-[120px]">
                    <span className="text-xs font-bold text-zinc-400 truncate w-full uppercase">{hoveredSlice.name}</span>
                    <span className="text-2xl font-black text-white mt-0.5">{hoveredSlice.share}%</span>
                    <span className="text-[9px] text-zinc-500 font-semibold">{hoveredSlice.value} orders</span>
                  </div>
                )}

                {/* Precision Floating Tooltip */}
                {hoveredSlice && (
                  <div
                    className="absolute z-50 bg-zinc-950 border border-zinc-800 rounded-xl p-2.5 px-3.5 shadow-2xl pointer-events-none"
                    style={{
                      left: mousePos.x + 12,
                      top: mousePos.y - 12,
                      transform: 'translate(0, -50%)'
                    }}
                  >
                    <p className="text-xs font-black text-white uppercase whitespace-nowrap">
                      {hoveredSlice.name}
                    </p>
                    <p className="text-[10px] text-zinc-400 mt-0.5">
                      Share: <span className="font-bold text-white">{hoveredSlice.share}%</span>
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      Volume: <span className="font-bold text-white">{hoveredSlice.value} orders</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Legends list */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 mt-4 pt-4 border-t border-zinc-800/60">
                {chartPieData.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                    />
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] text-zinc-400 truncate uppercase font-semibold max-w-[100px] sm:max-w-[120px]" title={item.name}>
                        {item.name}
                      </span>
                      <span className="text-[11px] text-zinc-300 font-bold flex-shrink-0">
                        {item.share}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Chart 2: Stacked Bar (Fulfillment states) */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between shadow-xl">
              <div>
                <h3 className="text-md font-bold text-white flex items-center gap-2 uppercase tracking-wide">
                  <Activity size={18} className="text-zinc-400" />
                  Customer Fulfillment Health
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">Dispatched status composition for the top 8 customers</p>
              </div>

              <div className="h-64 w-full my-4">
                {chartBarData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
                    No status distribution data available.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartBarData} margin={{ top: 10, right: 10, left: -20, bottom: 35 }}>
                      <defs>
                        <linearGradient id="deliveredGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={STATUS_COLORS.Delivered} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={STATUS_COLORS.Delivered} stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="inTransitGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={STATUS_COLORS.InTransit} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={STATUS_COLORS.InTransit} stopOpacity={0.0} />
                        </linearGradient>
                        <linearGradient id="delayedGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={STATUS_COLORS.Delayed} stopOpacity={0.25} />
                          <stop offset="95%" stopColor={STATUS_COLORS.Delayed} stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                      <XAxis
                        dataKey="name"
                        stroke="#71717a"
                        fontSize={9}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: '#71717a', fontWeight: 600 }}
                        angle={-25}
                        textAnchor="end"
                        interval={0}
                      />
                      <YAxis
                        stroke="#71717a"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        content={<CustomFulfillmentTooltip />}
                        cursor={{ stroke: '#52525b', strokeWidth: 1, strokeDasharray: '4 4' }}
                      />
                      <Legend
                        verticalAlign="top"
                        align="right"
                        height={36}
                        iconSize={8}
                        iconType="circle"
                        wrapperStyle={{ fontSize: '10px', color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: '12px' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="Delivered"
                        stroke={STATUS_COLORS.Delivered}
                        strokeWidth={1.75}
                        fillOpacity={1}
                        fill="url(#deliveredGrad)"
                        dot={{ r: 2.5, fill: STATUS_COLORS.Delivered, stroke: '#18181b', strokeWidth: 1 }}
                        activeDot={{ r: 5, fill: STATUS_COLORS.Delivered, stroke: '#18181b', strokeWidth: 2 }}
                        isAnimationActive={true}
                        animationDuration={1200}
                        animationEasing="ease-in-out"
                      />
                      <Area
                        type="monotone"
                        dataKey="InTransit"
                        stroke={STATUS_COLORS.InTransit}
                        strokeWidth={1.5}
                        fillOpacity={1}
                        fill="url(#inTransitGrad)"
                        dot={{ r: 2.5, fill: STATUS_COLORS.InTransit, stroke: '#18181b', strokeWidth: 1 }}
                        activeDot={{ r: 5, fill: STATUS_COLORS.InTransit, stroke: '#18181b', strokeWidth: 2 }}
                        isAnimationActive={true}
                        animationDuration={1400}
                        animationEasing="ease-in-out"
                      />
                      <Area
                        type="monotone"
                        dataKey="Delayed"
                        stroke={STATUS_COLORS.Delayed}
                        strokeWidth={1.5}
                        fillOpacity={1}
                        fill="url(#delayedGrad)"
                        dot={{ r: 2.5, fill: STATUS_COLORS.Delayed, stroke: '#18181b', strokeWidth: 1 }}
                        activeDot={{ r: 5, fill: STATUS_COLORS.Delayed, stroke: '#18181b', strokeWidth: 2 }}
                        isAnimationActive={true}
                        animationDuration={1600}
                        animationEasing="ease-in-out"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Customer Activity Matrix — Bento Grid */}
          <div className="mb-12">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
              <div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tight">Customer Activity Matrix</h2>
                <p className="text-xs text-zinc-500 mt-1">Logistics snapshot per customer — delivery health at a glance</p>
              </div>

              {/* Search Box */}
              <div className="relative max-w-sm w-full">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" size={16} />
                <input
                  type="text"
                  placeholder="Filter by customer name or state..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700 focus:border-zinc-600 text-zinc-200 text-xs rounded-xl pl-10 pr-4 py-2.5 focus:outline-none transition-colors"
                />
              </div>
            </div>

            {/* Matrix List */}
            {filteredCustomers.length === 0 ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center text-zinc-500 text-sm">
                No matching customer activity found.
              </div>
            ) : (
              <div className="space-y-16 pb-20">
                {filteredCustomers.map((customer) => (
                  <div key={customer.id} className="w-full">
                    {/* Customer Name Header */}
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-2xl bg-zinc-800 border border-zinc-700/50 flex items-center justify-center text-zinc-400 flex-shrink-0">
                        <User size={18} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-lg font-black text-white uppercase tracking-tight truncate flex items-center gap-2.5">
                          {customer.name}
                          <span className="text-[9px] font-bold tracking-widest text-zinc-500 bg-zinc-800 border border-zinc-700/50 px-2 py-0.5 rounded-lg uppercase flex-shrink-0">
                            {customer.state}
                          </span>
                        </h4>
                        <div className="flex items-center gap-3 text-[11px] text-zinc-500 mt-0.5 font-semibold">
                          <span>{customer.orderCount} orders</span>
                          <span className="text-zinc-700">·</span>
                          <span className="font-mono">₦{customer.totalValue.toLocaleString()}</span>
                        </div>
                      </div>
                      <Link
                        to={`/customers/${customer.id}`}
                        className="text-[10px] font-bold text-zinc-500 hover:text-white uppercase tracking-widest transition-colors flex items-center gap-1 flex-shrink-0"
                      >
                        View Profile
                        <ChevronRight size={12} />
                      </Link>
                    </div>

                    {/* Bento Grid — 4 Cards (exact replica of reference layout) */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '3fr 2fr 2fr',
                        gridTemplateRows: '3fr 2fr',
                        gap: '5px',
                        height: '400px'
                      }}
                    >

                      {/* Card 1: DELIVERED — Tall left card spanning both rows */}
                      <div
                        className="cursor-pointer transition-all hover:scale-[1.01] hover:brightness-[1.08] active:scale-[0.99] select-none"
                        onClick={() => handleCardClick(customer, 'Delivered', 'Delivered')}
                        style={{
                          gridColumn: '1 / 2',
                          gridRow: '1 / 3',
                          backgroundColor: '#c03030',
                          borderRadius: '0px',
                          padding: '28px 24px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'flex-start',
                          gap: '20px',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                      >
                        {/* Watermark */}
                        <div style={{
                          position: 'absolute',
                          bottom: '-45px',
                          right: '-15px',
                          fontSize: '230px',
                          fontWeight: 900,
                          lineHeight: 1,
                          color: 'rgba(0,0,0,0.14)',
                          userSelect: 'none',
                          pointerEvents: 'none',
                          fontFamily: 'Inter, system-ui, sans-serif'
                        }}>
                          {customer.statusBreakdown.Delivered}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{
                            fontSize: '52px',
                            fontWeight: 900,
                            color: '#eedfa2',
                            lineHeight: 1,
                            fontFamily: 'Inter, system-ui, sans-serif'
                          }}>
                            {customer.statusBreakdown.Delivered}+
                          </div>
                          <div style={{
                            fontSize: '36px',
                            fontWeight: 900,
                            color: '#eedfa2',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02em',
                            lineHeight: 1.05,
                            fontFamily: 'Inter, system-ui, sans-serif'
                          }}>
                            DELIVERED
                          </div>
                        </div>

                        <p style={{
                          fontSize: '16px',
                          color: 'rgba(238, 223, 162, 0.85)',
                          lineHeight: 1.6,
                          maxWidth: '95%',
                          position: 'relative',
                          zIndex: 1,
                          margin: 0,
                          fontFamily: 'Inter, system-ui, sans-serif'
                        }}>
                          Successfully fulfilled and confirmed at delivery point. No further action needed.
                        </p>
                      </div>

                      {/* Card 2: IN TRANSIT — Wide top-right card */}
                      <div
                        className="cursor-pointer transition-all hover:scale-[1.01] hover:brightness-[1.08] active:scale-[0.99] select-none"
                        onClick={() => handleCardClick(customer, 'InTransit', 'In Transit')}
                        style={{
                          gridColumn: '2 / 4',
                          gridRow: '1 / 2',
                          backgroundColor: '#eedfa2',
                          borderRadius: '0px',
                          padding: '24px 28px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'flex-start',
                          gap: '16px',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{
                            color: '#c03030',
                            fontSize: '28px',
                            lineHeight: 1,
                            fontFamily: 'Inter, system-ui, sans-serif'
                          }}>
                            ✦
                          </div>
                          <div style={{
                            fontSize: '32px',
                            fontWeight: 900,
                            color: '#1a1a1a',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02em',
                            lineHeight: 1.05,
                            fontFamily: 'Inter, system-ui, sans-serif'
                          }}>
                            IN TRANSIT
                          </div>
                        </div>

                        <p style={{
                          fontSize: '16px',
                          color: '#4a4540',
                          lineHeight: 1.6,
                          maxWidth: '90%',
                          margin: 0,
                          fontFamily: 'Inter, system-ui, sans-serif'
                        }}>
                          {customer.statusBreakdown.InTransit > 0
                            ? `${customer.statusBreakdown.InTransit} active consignment${customer.statusBreakdown.InTransit === 1 ? '' : 's'} currently en route. Tracking is live and updated in real-time.`
                            : 'No shipments currently on the road. All orders are either delivered or awaiting dispatch.'}
                        </p>
                      </div>

                      {/* Card 3: DELAYED — Bottom-middle */}
                      <div
                        className="cursor-pointer transition-all hover:scale-[1.01] hover:brightness-[1.08] active:scale-[0.99] select-none"
                        onClick={() => handleCardClick(customer, 'Delayed', 'Delayed')}
                        style={{
                          gridColumn: '2 / 3',
                          gridRow: '2 / 3',
                          backgroundColor: '#132e0e',
                          borderRadius: '0px',
                          padding: '20px 24px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'flex-start',
                          gap: '12px',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                      >
                        <Clock size={24} color="#eedfa2" />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{
                            fontSize: '22px',
                            fontWeight: 900,
                            color: '#eedfa2',
                            textTransform: 'uppercase',
                            letterSpacing: '0.03em',
                            lineHeight: 1.1,
                            fontFamily: 'Inter, system-ui, sans-serif'
                          }}>
                            {customer.statusBreakdown.Delayed} DELAYED
                          </div>
                          <p style={{
                            fontSize: '14px',
                            color: '#cbd2c9',
                            lineHeight: 1.55,
                            margin: 0,
                            fontFamily: 'Inter, system-ui, sans-serif'
                          }}>
                            {customer.statusBreakdown.Delayed > 0
                              ? 'Overdue shipments found. Requires immediate intervention.'
                              : 'No delays. All routes performing within schedule.'}
                          </p>
                        </div>
                      </div>

                      {/* Card 4: CONTRIBUTION — Bottom-right */}
                      <div
                        className="cursor-pointer transition-all hover:scale-[1.01] hover:brightness-[1.08] active:scale-[0.99] select-none"
                        onClick={() => handleCardClick(customer, 'Share', 'Volume Contribution')}
                        style={{
                          gridColumn: '3 / 4',
                          gridRow: '2 / 3',
                          backgroundColor: '#2a1c1c',
                          borderRadius: '0px',
                          padding: '20px 24px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'flex-start',
                          gap: '12px',
                          position: 'relative',
                          overflow: 'hidden'
                        }}
                      >
                        <Percent size={24} color="#e8c0c0" />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{
                            fontSize: '22px',
                            fontWeight: 900,
                            color: '#e8c0c0',
                            textTransform: 'uppercase',
                            letterSpacing: '0.03em',
                            lineHeight: 1.1,
                            fontFamily: 'Inter, system-ui, sans-serif'
                          }}>
                            {customer.orderShare}% SHARE
                          </div>
                          <p style={{
                            fontSize: '14px',
                            color: '#b09090',
                            lineHeight: 1.55,
                            margin: 0,
                            fontFamily: 'Inter, system-ui, sans-serif'
                          }}>
                            Volume contribution relative to total weekly dispatch load.
                          </p>
                        </div>
                      </div>

                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Multiple Orders Selection Modal */}
          {selectedOrdersModal && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-zinc-950 border border-zinc-800 rounded-3xl max-w-md w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                      {selectedOrdersModal.statusTitle} Orders
                    </span>
                    <h3 className="text-lg font-black text-white uppercase mt-0.5">
                      {selectedOrdersModal.customerName}
                    </h3>
                  </div>
                  <button
                    onClick={() => setSelectedOrdersModal(null)}
                    className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-white transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>

                <p className="text-xs text-zinc-400 mb-4">
                  Select an order to view its real-time logistics tracking details:
                </p>

                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {selectedOrdersModal.orders.map((order) => {
                    let orderVal = 0
                    if (order.line_items) {
                      order.line_items.forEach(item => {
                        orderVal += (item.quantity || 0) * (item.unit_price || 0)
                      })
                    }

                    return (
                      <div
                        key={order.id}
                        onClick={() => {
                          setSelectedOrdersModal(null)
                          navigate(`/orders/${order.id}`)
                        }}
                        className="bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700/80 p-3.5 rounded-xl cursor-pointer transition-all flex items-center justify-between group"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white group-hover:text-cyan-400 transition-colors uppercase tracking-tight">
                            Order #{order.order_number || order.id.substring(0, 8)}
                          </p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">
                            Dispatched: {order.dispatch_date ? new Date(order.dispatch_date).toLocaleDateString('en-US', {month: 'short', day: '2-digit'}) : 'N/A'}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-xs font-mono font-bold text-zinc-300">
                              ₦{orderVal.toLocaleString()}
                            </p>
                            <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">
                              {order.order_status || 'Pending'}
                            </p>
                          </div>
                          <ChevronRight size={14} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

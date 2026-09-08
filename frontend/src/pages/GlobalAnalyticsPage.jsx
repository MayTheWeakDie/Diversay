import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  BarChart3,
  Loader2,
  TrendingUp,
  DollarSign,
  Package,
  Users,
  ShoppingCart,
  Truck,
  ChevronDown,
  CloudRain,
  Sun,
  Wind,
  Globe,
  Store,
  Crown,
  Calendar,
  Activity,
  Layers,
  PieChart as PieIcon,
  Zap,
  X,
  Search,
  FileText
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  AreaChart, Area,
  PieChart, Pie, Cell,
  ScatterChart, Scatter,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  LineChart, Line,
  ZAxis
} from 'recharts'
import api, { getWithCache, isCached } from '../services/api'

// ── Color Palettes ──────────────────────────────────
const GRADIENTS = {
  emerald: ['#10b981', '#059669'],
  cyan: ['#06b6d4', '#0891b2'],
  purple: ['#a855f7', '#7c3aed'],
  amber: ['#f59e0b', '#d97706'],
  rose: ['#f43f5e', '#e11d48'],
  blue: ['#3b82f6', '#2563eb'],
  lime: ['#84cc16', '#65a30d'],
  indigo: ['#6366f1', '#4f46e5'],
  pink: ['#ec4899', '#db2777'],
  teal: ['#14b8a6', '#0d9488'],
}

const CHART_COLORS = [
  '#10b981', '#06b6d4', '#a855f7', '#f59e0b', '#3b82f6',
  '#ec4899', '#14b8a6', '#84cc16', '#6366f1', '#f43f5e',
  '#eab308', '#22d3ee', '#c084fc', '#fb923c', '#38bdf8'
]

const EXECUTIVE_BAR_COLORS = [
  '#059669', // Deep Emerald
  '#0891b2', // Ocean Teal
  '#7c3aed', // Imperial Violet
  '#d97706', // Warm Bronze
  '#2563eb', // Royal Blue
  '#be123c', // Deep Crimson / Burgundy
  '#0d9488', // Dark Forest Teal
  '#4f46e5', // Executive Indigo
  '#c2410c', // Terracotta Rust
  '#a21caf', // Deep Plum
  '#0284c7', // Sapphire Blue
  '#b45309', // Antique Gold
  '#047857', // Deep Pine Green
  '#6d28d9', // Deep Violet
  '#9f1239', // Rose Wine
]

const ZONE_COLORS = {
  'North West': '#e4e4e7', // Light Silver Gray (Zinc 200)
  'North East': '#d4d4d8', // Light Gray (Zinc 300)
  'Middle Belt': '#a1a1aa', // Mid Gray (Zinc 400)
  'South West': '#71717a', // Slate Gray (Zinc 500)
  'South East': '#52525b', // Dark Gray (Zinc 600)
  'South South': '#3f3f46', // Dark Slate (Zinc 700)
  'Other': '#27272a', // Charcoal (Zinc 800)
}

const SEASON_COLORS = {
  'Rainy Season': '#e4e4e7',
  'Harmattan': '#a1a1aa',
  'Dry Season': '#71717a',
}

const EXPENSE_COLORS = ['#10b981', '#06b6d4', '#f59e0b']

const TIMEFRAME_OPTIONS = [
  { value: 'all', label: 'All-Time' },
  { value: '90', label: 'Last 90 Days' },
  { value: '30', label: 'Last 30 Days' },
  { value: '7', label: 'This Week' },
]

// ── Reusable Components ─────────────────────────────

const ChartCard = ({ title, subtitle, icon: Icon, action, children, className = '', span = '' }) => (
  <div className={`bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/80 rounded-2xl overflow-hidden group hover:border-zinc-700 transition-all duration-300 hover:shadow-2xl ${span} ${className}`}>
    <div className="px-5 py-4 border-b border-zinc-800/60 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700/80 flex items-center justify-center text-white shrink-0 group-hover:scale-105 transition-transform">
            <Icon size={18} />
          </div>
        )}
        <div>
          <h3 className="text-sm font-bold text-white">{title}</h3>
          {subtitle && <p className="text-[10px] text-zinc-500 font-medium mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && (
        <div className="shrink-0">{action}</div>
      )}
    </div>
    <div className="p-5">
      {children}
    </div>
  </div>
)

const MetricToggle = ({ activeMetric, onChange, option1, option2 }) => {
  const isSecond = activeMetric === option2.value

  return (
    <div className="relative bg-zinc-950/90 p-1 border border-zinc-800/90 rounded-xl flex items-center text-[11px] font-semibold select-none shadow-inner w-56 sm:w-64">
      {/* Sliding active pill indicator */}
      <div
        className="absolute top-1 bottom-1 rounded-lg bg-zinc-800 border border-zinc-700/70 shadow-md transition-all duration-300 ease-out"
        style={{
          left: isSecond ? 'calc(50% + 2px)' : '4px',
          width: 'calc(50% - 6px)',
        }}
      />

      {/* Option 1 Button */}
      <button
        type="button"
        onClick={() => onChange(option1.value)}
        className={`relative z-10 flex-1 px-2.5 py-1 rounded-lg transition-colors duration-200 flex items-center justify-center gap-1.5 ${
          !isSecond ? 'text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'
        }`}
        title={option1.title}
      >
        <option1.icon size={13} className="shrink-0" />
        <span className="truncate">{option1.label}</span>
      </button>

      {/* Option 2 Button */}
      <button
        type="button"
        onClick={() => onChange(option2.value)}
        className={`relative z-10 flex-1 px-2.5 py-1 rounded-lg transition-colors duration-200 flex items-center justify-center gap-1.5 ${
          isSecond ? 'text-white font-bold' : 'text-zinc-400 hover:text-zinc-200'
        }`}
        title={option2.title}
      >
        <option2.icon size={13} className="shrink-0" />
        <span className="truncate">{option2.label}</span>
      </button>
    </div>
  )
}

const KPICard = ({ label, value, icon: Icon, prefix = '', suffix = '' }) => {
  return (
    <div className="bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-4 sm:p-5 hover:border-zinc-700/90 hover:bg-zinc-900/95 transition-all duration-300 shadow-xl group">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] sm:text-[11px] font-bold text-zinc-400 uppercase tracking-wider">{label}</p>
        {Icon && <Icon size={16} className="text-zinc-400 group-hover:text-white transition-colors" />}
      </div>
      <p className="text-xl sm:text-2xl font-black text-white group-hover:text-zinc-100 transition-colors tracking-tight">
        {prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}
      </p>
    </div>
  )
}

const getSolidBarPath = (x, y, w, h, isLast) => {
  if (!isLast) {
    return `M ${x},${y} h ${w} v ${h} h -${w} Z`
  }
  const r = Math.min(6, w, h / 2)
  return `
    M ${x},${y}
    L ${x + w - r},${y}
    A ${r},${r} 0 0 1 ${x + w},${y + r}
    L ${x + w},${y + h - r}
    A ${r},${r} 0 0 1 ${x + w - r},${y + h}
    L ${x},${y + h}
    Z
  `
}

const handleSegmentHover = (e, product, zoneName, value, color) => {
  const tooltip = document.getElementById('zone-bar-custom-tooltip')
  if (!tooltip) return
  const titleEl = tooltip.querySelector('.tt-title')
  const bodyEl = tooltip.querySelector('.tt-body')
  if (titleEl) titleEl.textContent = product
  if (bodyEl) {
    bodyEl.innerHTML = `
      <div class="flex items-center justify-between gap-4 text-xs font-semibold">
        <div class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${color}"></span>
          <span class="text-zinc-300 font-semibold text-[11px]">${zoneName}</span>
        </div>
        <span class="text-white font-bold text-[11px]">${typeof value === 'number' ? value.toLocaleString() : value}</span>
      </div>
    `
  }
  const left = Math.min(e.clientX + 16, window.innerWidth - 220)
  const top = Math.min(e.clientY - 20, window.innerHeight - 150)
  tooltip.style.left = `${left}px`
  tooltip.style.top = `${top}px`
  tooltip.style.opacity = '1'
}

const handleProductLabelHover = (e, fullItem) => {
  const tooltip = document.getElementById('zone-bar-custom-tooltip')
  if (!tooltip || !fullItem) return
  const titleEl = tooltip.querySelector('.tt-title')
  const bodyEl = tooltip.querySelector('.tt-body')
  if (titleEl) titleEl.textContent = fullItem.fullName || fullItem.product
  
  const activeZones = Object.keys(ZONE_COLORS).filter(z => (fullItem[z] || 0) > 0)
  if (bodyEl) {
    bodyEl.innerHTML = activeZones.map(z => `
      <div class="flex items-center justify-between gap-4 text-xs font-semibold">
        <div class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background-color: ${ZONE_COLORS[z]}"></span>
          <span class="text-zinc-300 font-semibold text-[11px]">${z}</span>
        </div>
        <span class="text-white font-bold text-[11px]">${typeof fullItem[z] === 'number' ? fullItem[z].toLocaleString() : fullItem[z]}</span>
      </div>
    `).join('')
  }
  const left = Math.min(e.clientX + 16, window.innerWidth - 240)
  const top = Math.min(e.clientY - 20, window.innerHeight - 250)
  tooltip.style.left = `${left}px`
  tooltip.style.top = `${top}px`
  tooltip.style.opacity = '1'
}

const handleZoneLeave = () => {
  const tooltip = document.getElementById('zone-bar-custom-tooltip')
  if (tooltip) tooltip.style.opacity = '0'
}

const CustomYAxisTick = ({ x, y, payload, fullData }) => {
  const truncatedName = payload.value.length > 16 ? payload.value.slice(0, 16) + '…' : payload.value
  const fullItem = fullData?.find(d => (d.product && (d.product.slice(0, 16) === payload.value || d.product === payload.value)))

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={-6}
        y={4}
        textAnchor="end"
        className="fill-zinc-400 font-semibold text-[11px] hover:fill-white cursor-pointer transition-colors"
        onMouseEnter={(e) => handleProductLabelHover(e, fullItem)}
        onMouseLeave={handleZoneLeave}
      >
        {truncatedName}
      </text>
    </g>
  )
}

const StackedBarSegment = (props) => {
  const { x, y, width, height, fill, payload, dataKey } = props
  if (!width || width <= 0) return null

  const activeZones = Object.keys(ZONE_COLORS).filter(z => (payload[z] || 0) > 0)
  const isLastActiveSegment = activeZones[activeZones.length - 1] === dataKey
  const val = payload[dataKey] || 0
  const fullProductName = payload.fullName || payload.product

  const path = getSolidBarPath(x, y, width, height, isLastActiveSegment)

  return (
    <g
      className="transition-all duration-150 cursor-pointer"
      onMouseEnter={(e) => handleSegmentHover(e, fullProductName, dataKey, val, fill)}
      onMouseLeave={handleZoneLeave}
    >
      <path
        d={path}
        fill={fill}
        fillOpacity={0.92}
        className="transition-all duration-150 hover:!fill-white hover:!fill-opacity-100 cursor-pointer"
      />
      {!isLastActiveSegment && (
        <line x1={x + width} y1={y} x2={x + width} y2={y + height} stroke="#18181b" strokeOpacity={0.4} strokeWidth={1.5} />
      )}
    </g>
  )
}

const CustomBarTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const nonZeroPayload = payload.filter(p => p.value > 0)
    const displayPayload = nonZeroPayload.length > 0 ? nonZeroPayload : payload

    return (
      <div className="bg-zinc-900/95 backdrop-blur-md border border-zinc-700/80 p-3.5 rounded-xl shadow-2xl space-y-1.5 min-w-[160px]">
        <p className="text-white font-bold text-xs border-b border-zinc-800 pb-1.5 mb-2">{label}</p>
        {displayPayload.map((entry, idx) => (
          <div key={idx} className="flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: entry.color || entry.fill }} />
              <span className="text-zinc-300 font-semibold text-[11px]">{entry.name}</span>
            </div>
            <span className="text-white font-bold text-[11px]">
              {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
            </span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

const CustomPieTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const d = payload[0]
    return (
      <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-xl shadow-2xl">
        <p className="text-white font-bold text-xs mb-1">{d.name}</p>
        <p className="text-emerald-400 font-semibold text-xs">
          ₦{d.value.toLocaleString()}
        </p>
      </div>
    )
  }
  return null
}

const CustomScatterTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload
    return (
      <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-xl shadow-2xl space-y-1">
        <p className="text-white font-bold text-xs border-b border-zinc-800 pb-1 mb-1">{d.product}</p>
        <p className="text-[11px] font-semibold text-zinc-400 mb-1">{d.season}</p>
        <div className="flex items-center justify-between gap-4 text-xs font-semibold">
          <span className="text-zinc-400">Order Count:</span>
          <span className="text-white font-bold">{(d.orders || 0).toLocaleString()} orders</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-xs font-semibold">
          <span className="text-zinc-400">Units Sold:</span>
          <span className="text-emerald-400 font-bold">{(d.quantity || 0).toLocaleString()} units</span>
        </div>
      </div>
    )
  }
  return null
}

// ── Main Component ──────────────────────────────────

export default function GlobalAnalyticsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const initialTimeframe = searchParams.get('timeframe') || 'all'
  const [timeframe, setTimeframe] = useState(initialTimeframe)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isDonutHovered, setIsDonutHovered] = useState(false)
  const [hoveredExpenseSlice, setHoveredExpenseSlice] = useState(null)
  const [selectedBrandModal, setSelectedBrandModal] = useState(null)
  const [brandSearchTerm, setBrandSearchTerm] = useState('')
  const [topProductsMetric, setTopProductsMetric] = useState('quantity') // 'quantity' | 'orders'
  const [seasonalMetric, setSeasonalMetric] = useState('quantity') // 'quantity' | 'orders'
  const [zoneMetric, setZoneMetric] = useState('quantity') // 'quantity' | 'orders'
  const [expenseTrendMetric, setExpenseTrendMetric] = useState('orders') // 'orders' | 'units'
  const [zoneDetailsMetric, setZoneDetailsMetric] = useState('quantity') // 'quantity' | 'orders'

  useEffect(() => {
    setSearchParams({ timeframe })
  }, [timeframe, setSearchParams])

  useEffect(() => {
    const fetchData = async () => {
      const cacheKey = `/analytics/global?timeframe=${timeframe}`
      const hasCached = isCached(cacheKey)
      if (!hasCached && !data) {
        setLoading(true)
      }
      setError(null)
      try {
        const res = await getWithCache(cacheKey, {
          onCacheUpdate: (newData) => setData(newData)
        })
        setData(res.data)
      } catch (err) {
        console.error('Failed to load global analytics:', err)
        setError('Failed to load analytics data.')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [timeframe])

  // Truncate product names for chart labels
  const truncate = (str, maxLen = 18) => str.length > maxLen ? str.slice(0, maxLen) + '…' : str

  // ── Derived data for charts ──
  const topProductsChartData = useMemo(() => {
    if (!data?.top_products) return []

    const sorted = [...data.top_products].sort((a, b) => {
      if (topProductsMetric === 'orders') {
        return (b.total_orders || 0) - (a.total_orders || 0) || (b.total_quantity || 0) - (a.total_quantity || 0)
      }
      return (b.total_quantity || 0) - (a.total_quantity || 0)
    })

    return sorted.slice(0, 15).map(p => ({
      name: truncate(p.product_name),
      fullName: p.product_name,
      quantity: p.total_quantity,
      orders: p.total_orders || 0,
      revenue: p.total_revenue,
    })).reverse() // reverse for horizontal bar (bottom = highest)
  }, [data, topProductsMetric])

  const monthlyVolumeData = useMemo(() => {
    if (!data?.monthly_volume) return []
    return data.monthly_volume.map(m => ({
      ...m,
      label: m.month.length > 7 ? m.month : m.month, // YYYY-MM
    }))
  }, [data])

  const seasonalBubbles = useMemo(() => {
    if (!data?.seasonal_scatter || data.seasonal_scatter.length === 0) return []
    const seasonY = { 'Rainy Season': 3, 'Harmattan': 2, 'Dry Season': 1 }

    // 1. Calculate baseline volume (units sold) for each product across all seasons
    // Keeps X-axis product positions fixed so bubble size changes are immediately visible when toggling metric
    const productVolumeTotals = {}
    data.seasonal_scatter.forEach(s => {
      const p = s.product
      productVolumeTotals[p] = (productVolumeTotals[p] || 0) + (s.quantity || 0)
    })

    // 2. Sort product names descending by baseline volume (units sold)
    const sortedProductNames = Object.keys(productVolumeTotals).sort((a, b) => productVolumeTotals[b] - productVolumeTotals[a])

    // Map each product to its fixed baseline rank index
    const productRank = {}
    sortedProductNames.forEach((p, idx) => {
      productRank[p] = idx
    })

    // 3. Sort scatter items by the fixed baseline product rank
    const sortedScatter = [...data.seasonal_scatter].sort((a, b) => {
      const rankDiff = (productRank[a.product] ?? 999) - (productRank[b.product] ?? 999)
      if (rankDiff !== 0) return rankDiff
      return seasonY[b.season] - seasonY[a.season]
    })

    const values = sortedScatter.map(s => seasonalMetric === 'orders' ? (s.orders || 0) : s.quantity)
    const maxVal = Math.max(...values, 1)
    const minVal = Math.min(...values, 0)
    const range = maxVal - minVal || 1

    return sortedScatter.map(s => {
      const val = seasonalMetric === 'orders' ? (s.orders || 0) : s.quantity
      const normalized = (val - minVal) / range
      const opacity = Math.max(0.38, Math.min(0.92, 0.38 + normalized * 0.54))

      return {
        ...s,
        orders: s.orders || 0,
        productShort: truncate(s.product, 14),
        seasonY: seasonY[s.season] || 0,
        fill: SEASON_COLORS[s.season] || '#10b981',
        opacity: Number(opacity.toFixed(2)),
      }
    })
  }, [data, seasonalMetric])

  const uniqueSeasonalProducts = useMemo(() => {
    if (!data?.seasonal_scatter) return []
    return Array.from(new Set(data.seasonal_scatter.map(s => s.product)))
  }, [data])

  const zoneStackedChartData = useMemo(() => {
    if (!data?.zone_stacked) return []

    return data.zone_stacked.map(d => {
      const entry = {
        product: truncate(d.product || '', 16),
        fullName: d.product,
        zones_qty: d.zones_qty || {},
        zones_orders: d.zones_orders || {},
      }

      const sourceMap = zoneMetric === 'orders' ? (d.zones_orders || {}) : (d.zones_qty || d)
      Object.keys(ZONE_COLORS).forEach(z => {
        entry[z] = sourceMap[z] || 0
      })

      return entry
    })
  }, [data, zoneMetric])

  const expenseTrendChartData = useMemo(() => {
    const raw = data?.expense_value_trend || data?.order_value_trend || []
    return raw.map(d => {
      const avgExpOrder = d.avg_expense_per_order ?? d.avg_expense ?? 0
      const avgExpUnit = d.avg_expense_per_unit ?? (d.total_units > 0 ? d.total_expense / d.total_units : 0)
      const val = expenseTrendMetric === 'units' ? avgExpUnit : avgExpOrder

      return {
        ...d,
        val: Number(val.toFixed(2)),
        displayMetric: expenseTrendMetric === 'units' ? 'Per Unit' : 'Per Order'
      }
    })
  }, [data, expenseTrendMetric])

  const activeExpenseItem = useMemo(() => {
    if (!data?.expense_breakdown || data.expense_breakdown.length === 0) return null
    if (hoveredExpenseSlice) return hoveredExpenseSlice
    const fuel = data.expense_breakdown.find(e => e.name.toLowerCase().includes('fuel'))
    return fuel || data.expense_breakdown[0]
  }, [data, hoveredExpenseSlice])

  const activeExpensePct = useMemo(() => {
    if (!data?.expense_breakdown || !activeExpenseItem) return '0%'
    const total = data.expense_breakdown.reduce((sum, item) => sum + (item.value || 0), 0)
    if (total === 0) return '0%'
    return `${((activeExpenseItem.value / total) * 100).toFixed(1)}%`
  }, [data, activeExpenseItem])

  const storeColorMap = useMemo(() => {
    if (!data?.store_orders_ranked) return {}
    const map = {}
    const monoShades = ['#e4e4e7', '#a1a1aa', '#71717a', '#52525b', '#3f3f46']
    data.store_orders_ranked.forEach((item, index) => {
      map[item.name] = monoShades[index % monoShades.length]
    })
    return map
  }, [data])

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-[70vh] space-y-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center animate-pulse">
            <BarChart3 size={32} className="text-white" />
          </div>
          <Loader2 className="absolute -bottom-1 -right-1 w-6 h-6 text-zinc-300 animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-white font-bold text-lg">Crunching analytics…</p>
          <p className="text-zinc-500 text-sm mt-1">Aggregating data from all stores</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center h-[70vh]">
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8 text-center max-w-md">
          <p className="text-red-400 font-bold text-lg mb-2">Something went wrong</p>
          <p className="text-red-400/70 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  const { summary } = data

  return (
    <div className="animate-in fade-in duration-300 space-y-8 pb-12">
      {/* ── Header ────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/store')}
            className="p-2.5 bg-zinc-800 text-zinc-400 hover:text-white rounded-xl transition-colors hover:bg-zinc-700"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center shadow-lg">
                <Activity size={22} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white uppercase">
                  Global Analytics
                </h1>
                <p className="text-zinc-400 text-xs mt-0.5">Cross-store intelligence & insights</p>
              </div>
            </div>
          </div>
        </div>

        {/* Timeframe Selector */}
        <div className="relative flex items-center self-start md:self-auto">
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="appearance-none bg-zinc-950 text-white border border-zinc-800/80 hover:border-zinc-700 rounded-xl px-4 py-2 pr-9 text-xs font-bold focus:outline-none focus:border-zinc-500 cursor-pointer shadow-sm transition-colors"
            style={{ colorScheme: 'dark' }}
          >
            {TIMEFRAME_OPTIONS.map(o => (
              <option key={o.value} value={o.value} className="bg-zinc-900 text-zinc-100">
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 pointer-events-none text-zinc-400" />
        </div>
      </div>

      {/* ── KPI Summary Row ──────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <KPICard label="Total Orders" value={summary.total_orders} icon={ShoppingCart} color="emerald" />
        <KPICard label="Units Sold" value={Math.round(summary.total_units_sold)} icon={Package} color="cyan" />
        <KPICard label="Total Revenue" value={`₦${(summary.total_revenue / 1).toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={DollarSign} color="purple" />
        <KPICard label="Unique Customers" value={summary.unique_customers} icon={Users} color="amber" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <KPICard label="Total Expense" value={`₦${summary.total_expense.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={Truck} color="rose" />
        <KPICard label="Avg Expense / Order" value={`₦${summary.avg_expense_per_order.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={DollarSign} color="blue" />
        <KPICard label="Avg Revenue / Order" value={`₦${summary.avg_revenue_per_order.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={TrendingUp} color="emerald" />
        <KPICard label="Unique Products" value={summary.unique_products} icon={Layers} color="cyan" />
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* 1. TOP SELLING PRODUCTS — Horizontal Bar   */}
      {/* ═══════════════════════════════════════════ */}
      <ChartCard
        title="Top Selling Products"
        subtitle={
          topProductsMetric === 'orders'
            ? "Products ranked by total individual orders across all stores"
            : "Products ranked by total units sold across all stores"
        }
        icon={TrendingUp}
        action={
          <MetricToggle
            activeMetric={topProductsMetric}
            onChange={setTopProductsMetric}
            option1={{ value: 'quantity', label: 'Units Sold', icon: Package, title: 'Rank products by total volume / pieces sold' }}
            option2={{ value: 'orders', label: 'Individual Orders', icon: ShoppingCart, title: 'Rank products by count of individual orders' }}
          />
        }
      >
        {topProductsChartData.length > 0 ? (
          <div style={{ height: Math.max(400, topProductsChartData.length * 34) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topProductsChartData}
                layout="vertical"
                margin={{ left: 10, right: 30, top: 5, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fill: '#a1a1aa', fontSize: 11, fontWeight: 600 }} />
                <Bar
                  dataKey={topProductsMetric}
                  name={topProductsMetric === 'orders' ? "Individual Orders" : "Quantity Sold"}
                  radius={[0, 6, 6, 0]}
                  maxBarSize={22}
                  isAnimationActive={true}
                  animationDuration={750}
                  animationEasing="ease-in-out"
                >
                  {topProductsChartData.map((entry, i) => {
                    const sortedByMetric = [...topProductsChartData].sort((a, b) =>
                      topProductsMetric === 'orders' ? b.orders - a.orders : b.quantity - a.quantity
                    )
                    const rank = sortedByMetric.findIndex(item => item.fullName === entry.fullName)
                    const monoProductShades = ['#e4e4e7', '#d4d4d8', '#a1a1aa', '#8a8a93', '#71717a', '#5f5f67', '#52525b', '#3f3f46', '#27272a']
                    const color = monoProductShades[Math.min(rank, monoProductShades.length - 1)]
                    return (
                      <Cell
                        key={i}
                        fill={color}
                        fillOpacity={0.9}
                        stroke="transparent"
                        strokeWidth={0}
                        onMouseEnter={(e) => {
                          const tooltip = document.getElementById('top-bar-custom-tooltip')
                          if (!tooltip) return
                          const rect = e.currentTarget.getBoundingClientRect()
                          const titleEl = tooltip.querySelector('.tt-title')
                          const qtyEl = tooltip.querySelector('.tt-qty')
                          if (titleEl) titleEl.textContent = entry.fullName
                          if (qtyEl) {
                            qtyEl.textContent = topProductsMetric === 'orders'
                              ? `Individual Orders: ${entry.orders.toLocaleString()} (${entry.quantity.toLocaleString()} units)`
                              : `Quantity Sold: ${entry.quantity.toLocaleString()} (${entry.orders.toLocaleString()} orders)`
                          }
                          const left = Math.min(rect.right + 12, window.innerWidth - 240)
                          const top = rect.top + rect.height / 2 - 24
                          tooltip.style.left = `${left}px`
                          tooltip.style.top = `${top}px`
                          tooltip.style.opacity = '1'
                        }}
                        onMouseLeave={() => {
                          const tooltip = document.getElementById('top-bar-custom-tooltip')
                          if (tooltip) tooltip.style.opacity = '0'
                        }}
                        style={{
                          transition: 'fill 0.15s ease, opacity 0.15s ease',
                          cursor: 'pointer'
                        }}
                        className="hover:!fill-white hover:!fill-opacity-100 hover:brightness-135 cursor-pointer"
                      />
                    )
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-zinc-500 text-sm text-center py-8">No product data available</p>
        )}
      </ChartCard>

      {/* ═══════════════════════════════════════════ */}
      {/* 2. SEASONAL SCATTER (Bubble Chart)         */}
      {/* ═══════════════════════════════════════════ */}
      <ChartCard
        title="Seasonal Sales Patterns"
        subtitle={
          seasonalMetric === 'orders'
            ? "Product order frequency across Nigerian seasons — bubble size = order count"
            : "Product sales volume across Nigerian seasons — bubble size = units sold"
        }
        icon={CloudRain}
        action={
          <MetricToggle
            activeMetric={seasonalMetric}
            onChange={setSeasonalMetric}
            option1={{ value: 'quantity', label: 'Units Sold', icon: Package, title: 'Scale bubbles by volume / pieces sold' }}
            option2={{ value: 'orders', label: 'Order Frequency', icon: ShoppingCart, title: 'Scale bubbles by count of individual orders' }}
          />
        }
      >
        {seasonalBubbles.length > 0 ? (
          <div>
            {/* Season Legend */}
            <div className="flex flex-wrap gap-4 mb-4">
              {Object.entries(SEASON_COLORS).map(([season, color]) => (
                <div key={season} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-xs text-zinc-300 font-semibold">{season}</span>
                  {season === 'Rainy Season' && <CloudRain size={13} className="text-zinc-400" />}
                  {season === 'Harmattan' && <Wind size={13} className="text-zinc-400" />}
                  {season === 'Dry Season' && <Sun size={13} className="text-zinc-400" />}
                </div>
              ))}
            </div>
            <div style={{ height: 380 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis
                    type="category"
                    dataKey="productShort"
                    name="Product"
                    allowDuplicatedCategory={false}
                    tick={{ fill: '#a1a1aa', fontSize: 10, fontWeight: 600 }}
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis
                    type="number"
                    dataKey="seasonY"
                    name="Season"
                    domain={[0.5, 3.5]}
                    ticks={[1, 2, 3]}
                    tickFormatter={(v) => ({ 1: 'Dry', 2: 'Harmattan', 3: 'Rainy' }[v] || '')}
                    tick={{ fill: '#a1a1aa', fontSize: 11, fontWeight: 600 }}
                  />
                  <ZAxis type="number" dataKey={seasonalMetric} range={[80, 800]} name={seasonalMetric === 'orders' ? "Order Count" : "Quantity"} />
                  <Tooltip content={<CustomScatterTooltip />} />
                  <Scatter
                    data={seasonalBubbles}
                    isAnimationActive={true}
                    animationDuration={750}
                    animationEasing="ease-in-out"
                  >
                    {seasonalBubbles.map((entry, idx) => (
                      <Cell
                        key={idx}
                        fill={entry.fill}
                        fillOpacity={0.88}
                        stroke="#ffffff"
                        strokeOpacity={0.3}
                        strokeWidth={1.5}
                        className="hover:!fill-white hover:!fill-opacity-100 hover:brightness-135 cursor-pointer transition-all duration-150"
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <p className="text-zinc-500 text-sm text-center py-8">No seasonal data available</p>
        )}
      </ChartCard>

      {/* ═══════════════════════════════════════════ */}
      {/* 3. MONTHLY ORDER VOLUME — Area Chart       */}
      {/* ═══════════════════════════════════════════ */}
      <ChartCard
        title="Monthly Order Volume"
        subtitle="Number of orders per month over time"
        icon={Calendar}
      >
        {monthlyVolumeData.length > 0 ? (
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyVolumeData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ffffff" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#ffffff" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="month" tick={{ fill: '#71717a', fontSize: 11 }} />
                <YAxis tick={{ fill: '#71717a', fontSize: 11 }} />
                <Tooltip content={<CustomBarTooltip />} />
                <Area
                  type="monotone"
                  dataKey="orders"
                  name="Orders"
                  stroke="#ffffff"
                  strokeWidth={2.5}
                  fill="url(#areaGradient)"
                  dot={{ fill: '#ffffff', r: 4, stroke: '#18181b', strokeWidth: 1.5 }}
                  activeDot={{ r: 6, fill: '#ffffff', stroke: '#ffffff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-zinc-500 text-sm text-center py-8">No monthly data available</p>
        )}
      </ChartCard>

      {/* ═══════════════════════════════════════════ */}
      {/* 4. PRODUCTS BY GEOPOLITICAL ZONE — Stacked */}
      {/* ═══════════════════════════════════════════ */}
      <ChartCard
        title={zoneMetric === 'orders' ? "Product Orders by Geopolitical Zone" : "Products Sold by Geopolitical Zone"}
        subtitle={
          zoneMetric === 'orders'
            ? "Top product order frequency broken down by customer region"
            : "Top product units sold broken down by customer region"
        }
        icon={Globe}
        action={
          <MetricToggle
            activeMetric={zoneMetric}
            onChange={setZoneMetric}
            option1={{ value: 'quantity', label: 'Units Sold', icon: Package, title: 'Break down product volume by geopolitical zone' }}
            option2={{ value: 'orders', label: 'Order Frequency', icon: ShoppingCart, title: 'Break down order count by geopolitical zone' }}
          />
        }
      >
        {zoneStackedChartData && zoneStackedChartData.length > 0 ? (
          <div>
            {/* Zone Legend */}
            <div className="flex flex-wrap gap-3 mb-4">
              {Object.entries(ZONE_COLORS).map(([zone, color]) => (
                <div key={zone} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-[10px] text-zinc-400 font-semibold">{zone}</span>
                </div>
              ))}
            </div>
            <div style={{ height: Math.max(350, zoneStackedChartData.length * 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={zoneStackedChartData}
                  layout="vertical"
                  margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                  <XAxis type="number" tick={{ fill: '#71717a', fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} />
                  <YAxis type="category" dataKey="product" width={130} tick={<CustomYAxisTick fullData={zoneStackedChartData} />} />
                  {Object.entries(ZONE_COLORS).map(([zone, color]) => (
                    <Bar
                      key={zone}
                      dataKey={zone}
                      name={zone}
                      stackId="zones"
                      fill={color}
                      shape={<StackedBarSegment />}
                      maxBarSize={22}
                      isAnimationActive={true}
                      animationDuration={750}
                      animationEasing="ease-in-out"
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <p className="text-zinc-500 text-sm text-center py-8">No zone data available</p>
        )}
      </ChartCard>

      {/* ═══════════════════════════════════════════ */}
      {/* 5 & 6. EXPENSE SECTION                     */}
      {/* ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expense Breakdown Pie */}
        <ChartCard
          title="Expense Breakdown"
          subtitle="Distribution of logistics costs across all orders"
          icon={DollarSign}
        >
          <style>{`
            @keyframes spinSlow {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
            .rotating-pie-container .recharts-pie {
              transform-origin: 50% 50%;
              transform-box: fill-box;
              animation: spinSlow 28s linear infinite;
            }
            .rotating-pie-container:hover .recharts-pie {
              animation-play-state: paused;
            }
          `}</style>
          {data.expense_breakdown && data.expense_breakdown.some(e => e.value > 0) ? (
            <div
              className="relative h-[290px] flex flex-col items-center justify-between rotating-pie-container"
              onMouseEnter={() => setIsDonutHovered(true)}
              onMouseLeave={() => {
                setIsDonutHovered(false)
                setHoveredExpenseSlice(null)
              }}
            >
              {/* Donut Ring Container */}
              <div className="w-full h-[230px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.expense_breakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={98}
                      paddingAngle={4}
                      cornerRadius={6}
                      dataKey="value"
                      stroke="#ffffff"
                      strokeWidth={2.5}
                      isAnimationActive={false}
                      activeShape={false}
                      onMouseEnter={(slice) => setHoveredExpenseSlice(slice)}
                    >
                      {data.expense_breakdown.map((_, i) => (
                        <Cell
                          key={i}
                          fill={EXPENSE_COLORS[i % EXPENSE_COLORS.length]}
                          className="transition-all duration-200 hover:brightness-125 cursor-pointer"
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Center Callout Text directly ON the Donut Hole */}
              <div className="absolute top-[72px] left-1/2 -translate-x-1/2 flex flex-col items-center justify-center pointer-events-none text-center z-10 w-[120px]">
                <span className="text-zinc-400 text-[10px] font-bold uppercase tracking-wider truncate max-w-[110px]">
                  {activeExpenseItem?.name || 'Fuel Cost'}
                </span>
                <span className="text-white text-xl sm:text-2xl font-black tracking-tight mt-0.5">
                  {activeExpensePct}
                </span>
                {activeExpenseItem?.value != null && (
                  <span className="text-emerald-400 text-[11px] font-bold mt-0.5">
                    ₦{activeExpenseItem.value.toLocaleString()}
                  </span>
                )}
              </div>

              {/* Stationary Legend at Bottom */}
              <div className="flex justify-center flex-wrap gap-4 w-full pb-1">
                {data.expense_breakdown.map((entry, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: EXPENSE_COLORS[i % EXPENSE_COLORS.length] }}
                    />
                    <span className="text-xs text-zinc-300 font-semibold">{entry.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-8">No expense data</p>
          )}
        </ChartCard>

        {/* Top Customers by Expense */}
        <ChartCard
          title="Top Customers by Order Expense"
          subtitle="Customers we spend the most logistics costs on"
          icon={Crown}
        >
          {data.top_customers_expense && data.top_customers_expense.length > 0 ? (
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-2" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 transparent' }}>
              {data.top_customers_expense.map((c, idx) => {
                const maxExpense = data.top_customers_expense[0]?.total_expense || 1
                const pct = (c.total_expense / maxExpense) * 100
                return (
                  <div key={idx} className="flex flex-col gap-1.5 p-1 rounded-lg">
                    <div className="flex justify-between items-end text-xs">
                      <div className="flex items-center gap-2 truncate max-w-[65%]">
                        {idx === 0 && <Crown size={12} className="text-zinc-200 fill-zinc-200 shrink-0" />}
                        <span className={`font-semibold truncate ${idx === 0 ? 'text-white font-bold' : 'text-zinc-300'}`}>
                          {c.name}
                        </span>
                        <span className="text-zinc-500 text-[10px]">{c.state ? `(${c.state})` : ''}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-bold text-zinc-100">₦{c.total_expense.toLocaleString()}</span>
                        <span className="text-zinc-500 ml-1.5 text-[10px]">{c.order_count} orders</span>
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden cursor-pointer">
                      <div
                        className={`h-full rounded-full transition-colors duration-150 hover:!bg-white cursor-pointer ${
                          idx === 0 ? 'bg-zinc-200' : idx === 1 ? 'bg-zinc-300' : idx === 2 ? 'bg-zinc-400' : 'bg-zinc-600'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-8">No customer expense data</p>
          )}
        </ChartCard>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* 7 & 8. STORE RANKINGS                      */}
      {/* ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Store by Order Count */}
        <ChartCard
          title="Busiest Stores (by Orders)"
          subtitle="Stores ranked by number of customer orders dispatched"
          icon={Store}
        >
          {data.store_orders_ranked && data.store_orders_ranked.length > 0 ? (
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.store_orders_ranked} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11, fontWeight: 600 }} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 11 }} />
                  <Tooltip cursor={false} content={<CustomBarTooltip />} />
                  <Bar
                    dataKey="count"
                    name="Orders"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={50}
                    isAnimationActive={false}
                    activeBar={{
                      fillOpacity: 1,
                      stroke: '#ffffff',
                      strokeWidth: 2,
                      style: { filter: 'brightness(1.35) drop-shadow(0 0 6px rgba(255,255,255,0.35))', cursor: 'pointer' }
                    }}
                  >
                    {data.store_orders_ranked.map((item, i) => (
                      <Cell key={i} fill={storeColorMap[item.name] || EXECUTIVE_BAR_COLORS[i % EXECUTIVE_BAR_COLORS.length]} fillOpacity={0.88} className="cursor-pointer" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-8">No store data</p>
          )}
        </ChartCard>

        {/* Store by Volume */}
        <ChartCard
          title="Busiest Stores (by Volume)"
          subtitle="Stores ranked by total units dispatched to customers"
          icon={Truck}
        >
          {data.store_volume_ranked && data.store_volume_ranked.length > 0 ? (
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.store_volume_ranked} margin={{ top: 5, right: 20, bottom: 5, left: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 11, fontWeight: 600 }} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} />
                  <Tooltip cursor={false} content={<CustomBarTooltip />} />
                  <Bar
                    dataKey="total_quantity"
                    name="Units Dispatched"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={50}
                    isAnimationActive={false}
                    activeBar={{
                      fillOpacity: 1,
                      stroke: '#ffffff',
                      strokeWidth: 2,
                      style: { filter: 'brightness(1.35) drop-shadow(0 0 6px rgba(255,255,255,0.35))', cursor: 'pointer' }
                    }}
                  >
                    {data.store_volume_ranked.map((item, i) => (
                      <Cell key={i} fill={storeColorMap[item.name] || EXECUTIVE_BAR_COLORS[i % EXECUTIVE_BAR_COLORS.length]} fillOpacity={0.88} className="cursor-pointer" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-8">No store volume data</p>
          )}
        </ChartCard>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* 9 & 10. CATEGORY & BRAND PIE CHARTS        */}
      {/* ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orders by Product Category */}
        <ChartCard
          title="Orders by Product Category"
          subtitle="Total product units & order volume across categories (Poultry, Equine, etc.)"
          icon={PieIcon}
        >
          {data.category_data && data.category_data.length > 0 ? (
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.category_data} margin={{ top: 20, right: 30, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#e4e4e7', fontSize: 12, fontWeight: 700 }} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} />
                  <Tooltip cursor={false} content={<CustomBarTooltip />} />
                  <Bar
                    dataKey="quantity"
                    name="Units Sold"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={55}
                    isAnimationActive={false}
                    activeBar={{
                      fillOpacity: 1,
                      stroke: '#ffffff',
                      strokeWidth: 2,
                      style: { filter: 'brightness(1.35) drop-shadow(0 0 6px rgba(255,255,255,0.35))', cursor: 'pointer' }
                    }}
                  >
                    {data.category_data.map((_, i) => (
                      <Cell
                        key={i}
                        fill={['#e4e4e7', '#a1a1aa', '#71717a', '#52525b', '#3f3f46'][i % 5]}
                        fillOpacity={0.9}
                        className="cursor-pointer"
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-8">No category data available</p>
          )}
        </ChartCard>

        {/* Brand Order Volume Comparison */}
        <ChartCard
          title="DSL vs DSLP Order Volume"
          subtitle="Comparison of product units & orders dispatched between DSL and DSLP brands"
          icon={Layers}
        >
          {data.brand_data && data.brand_data.length > 0 ? (
            <div>
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.brand_data} margin={{ top: 20, right: 30, bottom: 5, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: '#e4e4e7', fontSize: 13, fontWeight: 700 }} />
                    <YAxis tick={{ fill: '#71717a', fontSize: 11 }} tickFormatter={(v) => v.toLocaleString()} />
                    <Tooltip cursor={false} content={<CustomBarTooltip />} />
                    <Bar
                      dataKey="quantity"
                      name="Units Dispatched"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={55}
                      isAnimationActive={false}
                      activeBar={{
                        fillOpacity: 1,
                        stroke: '#ffffff',
                        strokeWidth: 2,
                        style: { filter: 'brightness(1.35) drop-shadow(0 0 6px rgba(255,255,255,0.35))', cursor: 'pointer' }
                      }}
                    >
                      <Cell fill="#e4e4e7" fillOpacity={0.9} className="cursor-pointer" onClick={() => setSelectedBrandModal(data.brand_data[0])} />
                      <Cell fill="#71717a" fillOpacity={0.9} className="cursor-pointer" onClick={() => setSelectedBrandModal(data.brand_data[1])} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-2.5 mt-2 pt-2 border-t border-zinc-800/60">
                {data.brand_data.map(b => (
                  <button
                    key={b.name}
                    onClick={() => setSelectedBrandModal(b)}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border border-zinc-700/80 shadow-sm cursor-pointer hover:border-zinc-500"
                  >
                    <FileText size={13} className="text-zinc-300" />
                    View {b.name} Orders ({b.orders})
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-8">No brand volume data available</p>
          )}
        </ChartCard>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* 11. DAY-OF-WEEK — Radar Chart              */}
      {/* ═══════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard
          title="Orders by Day of Week"
          subtitle="Which days see the most order activity"
          icon={Calendar}
        >
          {data.weekday_data && data.weekday_data.some(d => d.orders > 0) ? (
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={data.weekday_data} cx="50%" cy="50%" outerRadius="75%">
                  <PolarGrid stroke="#27272a" />
                  <PolarAngleAxis dataKey="day" tick={{ fill: '#e4e4e7', fontSize: 11, fontWeight: 700 }} />
                  <PolarRadiusAxis
                    tick={{ fill: '#71717a', fontSize: 10 }}
                    axisLine={false}
                  />
                  <Radar
                    name="Orders"
                    dataKey="orders"
                    stroke="#ffffff"
                    fill="#ffffff"
                    fillOpacity={0.2}
                    strokeWidth={2}
                    dot={{ fill: '#ffffff', r: 4, stroke: '#18181b', strokeWidth: 1.5 }}
                  />
                  <Tooltip content={<CustomBarTooltip />} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-8">No weekday data</p>
          )}
        </ChartCard>

        {/* ═══════════════════════════════════════════ */}
        {/* 12. AVERAGE EXPENSE VALUE TREND — Line Chart */}
        {/* ═══════════════════════════════════════════ */}
        <ChartCard
          title="Average Expense Value Trend"
          subtitle={
            expenseTrendMetric === 'units'
              ? "How the average logistics expense per unit dispatched changes month over month"
              : "How the average logistics expense per order changes month over month"
          }
          icon={TrendingUp}
          action={
            <MetricToggle
              activeMetric={expenseTrendMetric}
              onChange={setExpenseTrendMetric}
              option1={{ value: 'orders', label: 'Per Order', icon: ShoppingCart, title: 'Average logistics expense calculated per order dispatched' }}
              option2={{ value: 'units', label: 'Per Unit', icon: Package, title: 'Average logistics expense calculated per unit/piece dispatched' }}
            />
          }
        >
          {expenseTrendChartData && expenseTrendChartData.length > 0 ? (
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={expenseTrendChartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="month" tick={{ fill: '#e4e4e7', fontSize: 11, fontWeight: 700 }} />
                  <YAxis tick={{ fill: '#71717a', fontSize: 11 }} tickFormatter={(v) => `₦${v >= 1000 ? (v/1000).toFixed(0) + 'k' : v}`} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload
                        return (
                          <div className="bg-zinc-900/95 border border-zinc-700/90 p-3.5 rounded-xl shadow-2xl backdrop-blur-md space-y-1">
                            <p className="text-white font-bold text-xs uppercase tracking-wide border-b border-zinc-800 pb-1">{label}</p>
                            <p className="text-white font-black text-xs pt-0.5">
                              {expenseTrendMetric === 'units' ? 'Avg Expense / Unit' : 'Avg Expense / Order'}: ₦{payload[0].value.toLocaleString()}
                            </p>
                            {item.total_expense != null && (
                              <p className="text-zinc-400 text-[11px]">
                                Total Expense: ₦{item.total_expense.toLocaleString()}
                              </p>
                            )}
                            <div className="text-zinc-500 text-[10px] flex items-center gap-1.5 pt-0.5">
                              <span>{item.total_orders} orders</span>
                              {item.total_units != null && (
                                <>
                                  <span>•</span>
                                  <span>{item.total_units.toLocaleString()} units</span>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="val"
                    name={expenseTrendMetric === 'units' ? "Avg Expense / Unit" : "Avg Expense / Order"}
                    stroke="#ffffff"
                    strokeWidth={2.5}
                    dot={{ fill: '#ffffff', r: 4, stroke: '#18181b', strokeWidth: 1.5 }}
                    activeDot={{ r: 6, stroke: '#ffffff', strokeWidth: 2, fill: '#ffffff' }}
                    isAnimationActive={true}
                    animationDuration={750}
                    animationEasing="ease-in-out"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-zinc-500 text-sm text-center py-8">No expense trend data available</p>
          )}
        </ChartCard>
      </div>

      {/* ═══════════════════════════════════════════ */}
      {/* ZONE DETAILS TABLE / CARDS                 */}
      {/* ═══════════════════════════════════════════ */}
      <ChartCard
        title="Geopolitical Zone Details"
        subtitle={
          zoneDetailsMetric === 'orders'
            ? "Orders and top products per zone by order frequency"
            : "Orders and top products per zone with volume indicators"
        }
        icon={Globe}
        action={
          <MetricToggle
            activeMetric={zoneDetailsMetric}
            onChange={setZoneDetailsMetric}
            option1={{ value: 'quantity', label: 'Units Sold', icon: Package, title: 'Rank regional top products by total volume / units sold' }}
            option2={{ value: 'orders', label: 'Order Frequency', icon: ShoppingCart, title: 'Rank regional top products by count of individual orders' }}
          />
        }
      >
        {data.zone_data && data.zone_data.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.zone_data.map((z, idx) => {
              const color = ZONE_COLORS[z.zone] || '#71717a'

              // Sort products in this zone based on active zoneDetailsMetric
              const sortedProducts = [...z.products].sort((a, b) => {
                if (zoneDetailsMetric === 'orders') {
                  const oDiff = (b.orders || 0) - (a.orders || 0)
                  if (oDiff !== 0) return oDiff
                  return (b.quantity || 0) - (a.quantity || 0)
                } else {
                  const qDiff = (b.quantity || 0) - (a.quantity || 0)
                  if (qDiff !== 0) return qDiff
                  return (b.orders || 0) - (a.orders || 0)
                }
              })

              const topItem = sortedProducts[0]
              const maxVal = zoneDetailsMetric === 'orders' ? (topItem?.orders || 1) : (topItem?.quantity || 1)

              return (
                <div
                  key={idx}
                  className="bg-zinc-900/60 border border-zinc-800/90 rounded-2xl p-5 hover:border-zinc-700/90 hover:bg-zinc-900/90 transition-all duration-300 shadow-xl group flex flex-col justify-between"
                >
                  <div>
                    {/* Zone Header */}
                    <div className="flex items-center justify-between gap-2 mb-3.5 pb-3 border-b border-zinc-800/80">
                      <div className="flex items-center gap-2.5">
                        <div className="w-3 h-3 rounded-full border border-zinc-500/50 shadow-sm shrink-0" style={{ backgroundColor: color }} />
                        <h4 className="text-sm font-black text-white uppercase tracking-wide group-hover:text-zinc-100 transition-colors">{z.zone}</h4>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-zinc-300 bg-zinc-800/80 border border-zinc-700/60 px-2 py-0.5 rounded-md">
                          {z.total_orders.toLocaleString()} orders
                        </span>
                        <span className="text-[10px] font-bold text-white bg-zinc-800/80 border border-zinc-700/60 px-2 py-0.5 rounded-md">
                          {z.total_quantity.toLocaleString()} units
                        </span>
                      </div>
                    </div>

                    {/* Top Products Label */}
                    <p className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider mb-2.5">
                      {zoneDetailsMetric === 'orders' ? 'Top Products Order Frequency' : 'Top Products Volume'}
                    </p>

                    {/* Top Products Progress Bar List */}
                    <div className="space-y-2.5">
                      {sortedProducts.slice(0, 5).map((p, pidx) => {
                        const val = zoneDetailsMetric === 'orders' ? (p.orders || 0) : (p.quantity || 0)
                        const barPct = Math.min(100, Math.max(4, (val / maxVal) * 100))
                        const valLabel = zoneDetailsMetric === 'orders' ? `${val.toLocaleString()} orders` : val.toLocaleString()

                        return (
                          <div key={pidx} className="space-y-1">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-zinc-300 font-medium truncate max-w-[70%] group-hover:text-zinc-200">{p.product}</span>
                              <span className="text-white font-extrabold text-[11px]">{valLabel}</span>
                            </div>
                            <div className="w-full h-1 bg-zinc-950 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-zinc-400 group-hover:bg-zinc-200 rounded-full transition-all duration-500"
                                style={{ width: `${barPct}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-zinc-500 text-sm text-center py-8">No zone data available</p>
        )}
      </ChartCard>

      {/* Persistent Zero-Latency Tooltip for Top Selling Products */}
      <div
        id="top-bar-custom-tooltip"
        className="fixed z-[9999] pointer-events-none bg-zinc-900/95 border border-zinc-700/90 px-3.5 py-2.5 rounded-xl shadow-2xl backdrop-blur-md opacity-0 transition-opacity duration-100 font-sans"
        style={{ left: 0, top: 0 }}
      >
        <p className="tt-title text-white font-bold text-xs mb-1"></p>
        <p className="tt-qty text-emerald-400 font-semibold text-xs"></p>
      </div>

      {/* Persistent Dark Tooltip for Geopolitical Zone Chart */}
      <div
        id="zone-bar-custom-tooltip"
        className="fixed z-[9999] pointer-events-none bg-zinc-900/95 text-white border border-zinc-700/90 p-3.5 rounded-xl shadow-2xl backdrop-blur-md opacity-0 transition-opacity duration-150 font-sans min-w-[170px]"
        style={{ left: 0, top: 0 }}
      >
        <p className="tt-title text-white font-bold text-xs border-b border-zinc-800 pb-1.5 mb-2 uppercase tracking-wide"></p>
        <div className="tt-body space-y-1.5 text-xs"></div>
      </div>

      {/* Contributing Orders Modal */}
      {selectedBrandModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-white" />
                  <h3 className="text-lg font-black text-white">
                    {selectedBrandModal.name} Contributing Orders
                  </h3>
                </div>
                <p className="text-zinc-400 text-xs mt-0.5">
                  {selectedBrandModal.orders} orders ({selectedBrandModal.quantity?.toLocaleString()} units • ₦{selectedBrandModal.revenue?.toLocaleString()})
                </p>
              </div>
              <button
                onClick={() => { setSelectedBrandModal(null); setBrandSearchTerm(''); }}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Search Filter */}
            <div className="p-4 border-b border-zinc-800/60 bg-zinc-900">
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search by customer, order code, or store..."
                  value={brandSearchTerm}
                  onChange={(e) => setBrandSearchTerm(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 text-white placeholder-zinc-500 text-xs rounded-xl pl-10 pr-4 py-2.5 focus:outline-none focus:border-zinc-500 transition-colors"
                />
              </div>
            </div>

            {/* Orders Table List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5" style={{ scrollbarWidth: 'thin' }}>
              {selectedBrandModal.order_list && selectedBrandModal.order_list.length > 0 ? (
                selectedBrandModal.order_list
                  .filter(o =>
                    !brandSearchTerm ||
                    o.customer.toLowerCase().includes(brandSearchTerm.toLowerCase()) ||
                    o.tracking_code.toLowerCase().includes(brandSearchTerm.toLowerCase()) ||
                    o.store.toLowerCase().includes(brandSearchTerm.toLowerCase())
                  )
                  .map((o, idx) => (
                    <div key={idx} className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3.5 flex items-center justify-between hover:border-zinc-700 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-bold text-xs">{o.customer}</span>
                          <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-full font-mono">
                            {o.tracking_code}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500">
                          {o.store} • <span className="text-zinc-400">{o.date}</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-white">{o.quantity.toLocaleString()} units</p>
                        <p className="text-[11px] font-semibold text-emerald-400">₦{o.amount.toLocaleString()}</p>
                      </div>
                    </div>
                  ))
              ) : (
                <p className="text-zinc-500 text-xs text-center py-8">No matching orders found</p>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-950/40 text-right">
              <button
                onClick={() => { setSelectedBrandModal(null); setBrandSearchTerm(''); }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

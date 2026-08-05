import React, { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { 
  ArrowLeft, 
  TrendingUp, 
  BarChart3, 
  Loader2, 
  Package, 
  Search, 
  ChevronDown, 
  Percent, 
  Hash, 
  PieChart as PieIcon, 
  Globe, 
  X, 
  Users, 
  MapPin, 
  ChevronRight,
  Maximize2,
  Crown,
  Receipt,
  DollarSign,
  Calendar
} from 'lucide-react'
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'
import api from '../services/api'

const TRENDING_RANGES = [
  { value: '1', label: 'Today' },
  { value: '7', label: 'This Week' },
  { value: '30', label: 'Last 30 Days' },
  { value: '90', label: 'Last 3 Months' },
  { value: 'all', label: 'All-Time' }
]

// Distinct color palette for customer & region pie charts (Non-red)
const PIE_COLORS = [
  '#10b981', // Emerald Green
  '#f59e0b', // Amber / Yellow
  '#06b6d4', // Cyan
  '#a855f7', // Purple
  '#3b82f6', // Blue
  '#ec4899', // Pink
  '#14b8a6', // Teal
  '#84cc16', // Lime
  '#6366f1', // Indigo
  '#eab308'  // Gold
]

const REGION_COLOR_MAP = {
  'North West': '#10b981',        // Emerald
  'North East': '#84cc16',        // Lime
  'Middle Belt': '#f59e0b',       // Amber / Yellow
  'South West': '#06b6d4',        // Cyan
  'South East': '#a855f7',        // Purple
  'South South': '#ec4899',       // Pink
  'Inter-Store Transfer': '#6366f1', // Indigo
  'Other Regions': '#71717a'      // Zinc
}

// Geopolitical zone mapping helper
const getRegionForCustomer = (c) => {
  if (c.is_transfer || (c.state && c.state.includes('Transfer')) || (c.name && c.name.includes('Transfer'))) {
    return 'Inter-Store Transfer'
  }
  const state = (c.state || '').trim().toLowerCase()
  const city = (c.city || '').trim().toLowerCase()
  const loc = `${state} ${city} ${c.address || ''}`.toLowerCase()
  
  if (['kaduna', 'kano', 'katsina', 'kebbi', 'jigawa', 'sokoto', 'zamfara', 'north west', 'nw'].some(x => loc.includes(x))) {
    return 'North West'
  }
  if (['adamawa', 'bauchi', 'borno', 'gombe', 'taraba', 'yobe', 'north east', 'ne'].some(x => loc.includes(x))) {
    return 'North East'
  }
  if (['benue', 'kogi', 'kwara', 'nasarawa', 'niger', 'plateau', 'fct', 'abuja', 'north central', 'middle belt', 'nc'].some(x => loc.includes(x))) {
    return 'Middle Belt'
  }
  if (['ekiti', 'lagos', 'ogun', 'ondo', 'osun', 'oyo', 'south west', 'sw'].some(x => loc.includes(x))) {
    return 'South West'
  }
  if (['abia', 'anambra', 'ebonyi', 'enugu', 'imo', 'south east', 'se'].some(x => loc.includes(x))) {
    return 'South East'
  }
  if (['akwa ibom', 'bayelsa', 'cross river', 'delta', 'edo', 'rivers', 'south south', 'ss'].some(x => loc.includes(x))) {
    return 'South South'
  }
  
  return c.state && c.state !== 'Unspecified State' ? c.state : 'Other Regions'
}

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0];
    return (
      <div className="bg-zinc-900 border border-zinc-700 p-3 rounded-xl shadow-2xl relative z-[100]">
        <p className="text-white font-bold text-sm mb-1 drop-shadow-md">{data.name}</p>
        <p className="text-emerald-400 font-semibold text-xs drop-shadow-md">
          {data.value.toLocaleString()} units ({data.payload.percentage}%)
        </p>
      </div>
    );
  }
  return null;
};

const StoreTrendingPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  
  const [store, setStore] = useState(null)
  const [trendingData, setTrendingData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState('pieces') // 'pieces' or 'percent'
  
  // Interactive Modal state
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [modalTab, setModalTab] = useState('customers') // 'customers' or 'regions'
  const [selectedRegion, setSelectedRegion] = useState('all')
  const [customerDetailsModal, setCustomerDetailsModal] = useState(null)

  // PieChart hover pause state for CSS spin animation
  const [isPieHovered, setIsPieHovered] = useState(false)
  
  const initialTimeframe = searchParams.get('timeframe') || 'all'
  const [timeframe, setTimeframe] = useState(initialTimeframe)

  useEffect(() => {
    // Sync URL when timeframe changes
    setSearchParams({ timeframe })
  }, [timeframe, setSearchParams])

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const storeRes = await api.get(`/stores/${id}`)
        setStore(storeRes.data)

        const trendingRes = await api.get(`/stores/${id}/analytics/trending-details?timeframe=${timeframe}`)
        setTrendingData(trendingRes.data.products || [])
      } catch (err) {
        console.error('Error fetching trending details:', err)
        setError('Failed to load trending data.')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [id, timeframe])

  const filteredData = trendingData.filter(item => 
    item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    item.customers.some(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  // Regional breakdown data calculation for selected product
  const regionBreakdown = useMemo(() => {
    if (!selectedProduct) return { list: [], map: {} }
    
    const map = {}
    selectedProduct.customers.forEach(c => {
      const reg = getRegionForCustomer(c)
      if (!map[reg]) {
        map[reg] = { name: reg, quantity: 0, customers: [] }
      }
      map[reg].quantity += c.quantity
      map[reg].customers.push(c)
    })

    const list = Object.values(map).sort((a, b) => b.quantity - a.quantity)
    return { list, map }
  }, [selectedProduct])

  // Filtered customers inside modal based on selected region filter
  const modalCustomers = useMemo(() => {
    if (!selectedProduct) return []
    if (selectedRegion === 'all') return selectedProduct.customers
    return selectedProduct.customers.filter(c => getRegionForCustomer(c) === selectedRegion)
  }, [selectedProduct, selectedRegion])

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-zinc-950 relative">
      {/* Header */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-6 py-4 bg-zinc-900 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(`/store/${id}`)}
            className="p-2 bg-zinc-800 text-zinc-400 hover:text-white rounded-xl transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp size={20} className="text-emerald-400" />
              <h1 className="text-lg font-bold text-white">Trending Products Detailed View</h1>
            </div>
            {store && <p className="text-xs text-zinc-400 font-medium">Store: {store.name}</p>}
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          {/* View Mode Toggle: Pieces vs Percent */}
          <div className="flex bg-zinc-950 p-1 border border-zinc-800 rounded-xl">
            <button
              onClick={() => setViewMode('pieces')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === 'pieces'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
              }`}
              title="Show values in actual pieces/units"
            >
              <Hash size={13} />
              <span>Pieces</span>
            </button>
            <button
              onClick={() => setViewMode('percent')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                viewMode === 'percent'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
              }`}
              title="Show values as percentage of total product sales"
            >
              <Percent size={13} />
              <span>Percent</span>
            </button>
          </div>

          {/* Timeframe Select Dropdown */}
          <div className="relative flex items-center">
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="appearance-none bg-zinc-950 text-emerald-400 border border-zinc-800/80 hover:border-zinc-700 rounded-xl px-3.5 py-1.5 pr-8 text-xs font-bold focus:outline-none focus:border-emerald-500/50 cursor-pointer shadow-sm transition-colors"
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
      </header>

      {/* Main Content Area */}
      <div 
        className="flex-1 overflow-y-auto p-6"
        style={{ colorScheme: 'dark', scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 transparent' }}
      >
        {/* Search Bar */}
        <div className="mb-6 flex gap-4 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-zinc-500" size={18} />
            <input 
              type="text" 
              placeholder="Search product or customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50"
            />
          </div>
        </div>

        {loading ? (
          <div className="h-64 flex flex-col items-center justify-center space-y-4">
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            <p className="text-zinc-400 text-sm font-medium">Crunching analytics data...</p>
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
            <p className="text-red-400 text-sm font-medium">{error}</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center flex flex-col items-center">
            <Package size={48} className="text-zinc-700 mb-4" />
            <h3 className="text-white font-bold text-lg mb-2">No Products Found</h3>
            <p className="text-zinc-400 text-sm">No transaction data available for the selected timeframe.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredData.map((item, idx) => {
              const maxQty = Math.max(...item.customers.map(c => c.quantity))
              
              return (
                <div 
                  key={idx} 
                  onClick={() => {
                    setSelectedProduct(item)
                    setModalTab('customers')
                    setSelectedRegion('all')
                  }}
                  className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-5 shadow-xl flex flex-col hover:border-emerald-500/50 hover:shadow-2xl hover:scale-[1.01] transition-all duration-300 cursor-pointer group relative overflow-hidden"
                  title="Click to view detailed customer & region pie chart breakdown"
                >
                  {/* Hover visual cue */}
                  <div className="absolute top-3 right-3 text-zinc-600 group-hover:text-emerald-400 transition-colors">
                    <Maximize2 size={15} />
                  </div>

                  {/* Card Header */}
                  <div className="flex justify-between items-start mb-4 pr-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center border border-zinc-700/50 shrink-0 group-hover:border-emerald-500/40 transition-colors">
                        <BarChart3 size={20} className="text-sky-400 group-hover:text-emerald-400 transition-colors" />
                      </div>
                      <div>
                        <h3 className="text-white font-bold text-sm line-clamp-2" title={item.product_name}>
                          {item.product_name}
                        </h3>
                        <p className="text-xs font-medium text-emerald-400 mt-0.5">
                          Total: {item.total_quantity.toLocaleString()} units
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Customer Breakdown List */}
                  <div className="flex-1 space-y-3 mt-2">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Customer Breakdown</p>
                      <span className="text-[10px] text-emerald-400 font-bold group-hover:underline flex items-center gap-0.5">
                        Pie Chart <ChevronRight size={10} />
                      </span>
                    </div>

                    <div 
                      className="max-h-[160px] overflow-y-auto pr-2 space-y-3"
                      style={{ 
                        colorScheme: 'dark', 
                        scrollbarWidth: 'thin', 
                        scrollbarColor: '#3f3f46 transparent' 
                      }}
                    >
                      {item.customers.map((c, cIdx) => {
                        const relativePct = maxQty > 0 ? (c.quantity / maxQty) * 100 : 0
                        const sharePct = item.total_quantity > 0 ? (c.quantity / item.total_quantity) * 100 : 0
                        const isTopBuyer = cIdx === 0
                        
                        let barGradient = isTopBuyer ? 'from-emerald-400 via-teal-400 to-emerald-500' : 'from-emerald-500/80 to-teal-500/80'
                        let textClass = isTopBuyer ? 'text-emerald-400 font-bold' : 'text-emerald-400'
                        
                        if (cIdx === 1) {
                          barGradient = 'from-cyan-400 to-blue-500'
                          textClass = 'text-cyan-400'
                        } else if (cIdx >= 2) {
                          barGradient = 'from-sky-400 to-indigo-400'
                          textClass = 'text-sky-400'
                        }

                        return (
                          <div key={cIdx} className="flex flex-col gap-1.5 group/item">
                            <div className="flex justify-between items-end text-xs">
                              <span className="text-zinc-300 font-medium truncate max-w-[70%] flex items-center gap-1" title={c.name}>
                                {isTopBuyer && <Crown size={12} className="text-emerald-400 fill-emerald-400 shrink-0 inline" />}
                                <span className={isTopBuyer ? 'text-emerald-300 font-bold' : ''}>{c.name}</span>
                              </span>
                              <span className={`font-bold ${textClass}`}>
                                {viewMode === 'percent' 
                                  ? `${sharePct.toFixed(1)}%` 
                                  : `${c.quantity.toLocaleString()} pcs`
                                }
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden">
                              <div 
                                className={`h-full bg-gradient-to-r ${barGradient} rounded-full transition-all duration-700 ease-out relative`}
                                style={{ width: `${relativePct}%` }}
                              >
                                <div className="absolute inset-0 bg-white/20 w-full transform -translate-x-full group-hover/item:translate-x-full transition-transform duration-700"></div>
                              </div>
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
        )}
      </div>

      {/* Product Detailed Breakdown Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <BarChart3 size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white line-clamp-1">{selectedProduct.product_name}</h2>
                  <div className="flex items-center gap-3 text-xs mt-0.5">
                    <span className="text-emerald-400 font-semibold">
                      Total Volume: {selectedProduct.total_quantity.toLocaleString()} units
                    </span>
                    {selectedProduct.total_revenue > 0 && (
                      <span className="text-emerald-400 font-bold">
                        • Total Value: ₦{selectedProduct.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedProduct(null)}
                className="p-2 bg-zinc-800 text-zinc-400 hover:text-white rounded-xl transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="px-6 py-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between shrink-0 gap-4 flex-wrap">
              <div className="flex bg-zinc-950 p-1 border border-zinc-800 rounded-xl">
                <button
                  onClick={() => { setModalTab('customers'); setSelectedRegion('all') }}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
                    modalTab === 'customers'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 shadow-sm'
                      : 'text-zinc-400 hover:text-white border border-transparent'
                  }`}
                >
                  <PieIcon size={14} />
                  <span>Customer Pie Breakdown</span>
                </button>
                <button
                  onClick={() => setModalTab('regions')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
                    modalTab === 'regions'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 shadow-sm'
                      : 'text-zinc-400 hover:text-white border border-transparent'
                  }`}
                >
                  <Globe size={14} />
                  <span>Regional Breakdown (Geopolitical)</span>
                </button>
              </div>

              <span className="text-xs text-zinc-500 font-medium">
                {selectedProduct.customers.length} total customer entries
              </span>
            </div>

            {/* Modal Body */}
            <div 
              className="flex-1 overflow-y-auto p-6 space-y-6"
              style={{ colorScheme: 'dark', scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 transparent' }}
            >
              {modalTab === 'customers' ? (
                /* Tab 1: Customer Share Pie Chart & Table */
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                  {/* Pie Chart */}
                  <div 
                    onMouseEnter={() => setIsPieHovered(true)}
                    onMouseLeave={() => setIsPieHovered(false)}
                    className="h-[280px] w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex items-center justify-center relative cursor-pointer group"
                  >
                    {/* Center Vital Stats Display */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
                      <p className="text-2xl font-black text-white tracking-tight drop-shadow-md">
                        {((selectedProduct.customers[0]?.quantity / selectedProduct.total_quantity) * 100).toFixed(1)}%
                      </p>
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 drop-shadow-sm mt-0.5">
                        TOP BUYER SHARE
                      </p>
                    </div>

                    <div 
                      className="w-full h-full"
                      style={{
                        animation: 'spin 25s linear infinite',
                        animationPlayState: isPieHovered ? 'paused' : 'running'
                      }}
                    >
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={selectedProduct.customers.map(c => ({
                              name: c.name,
                              value: c.quantity,
                              percentage: ((c.quantity / selectedProduct.total_quantity) * 100).toFixed(1)
                            }))}
                            cx="50%"
                            cy="50%"
                            innerRadius={65}
                            outerRadius={95}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {selectedProduct.customers.map((c, index) => (
                              <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Customer List */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Customer Share Breakdown</h3>
                      <span className="text-[10px] text-zinc-500 italic">Click customer for order history</span>
                    </div>

                    <div 
                      className="max-h-[260px] overflow-y-auto space-y-2 pr-2"
                      style={{ colorScheme: 'dark', scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 transparent' }}
                    >
                      {selectedProduct.customers.map((c, idx) => {
                        const pct = ((c.quantity / selectedProduct.total_quantity) * 100).toFixed(1)
                        const color = PIE_COLORS[idx % PIE_COLORS.length]
                        const isTopBuyer = idx === 0
                        
                        return (
                          <div 
                            key={idx} 
                            onClick={() => setCustomerDetailsModal(c)}
                            className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                              isTopBuyer
                                ? 'bg-emerald-500/10 border-emerald-500/40 shadow-md shadow-emerald-500/5 hover:border-emerald-400'
                                : 'bg-zinc-950 border-zinc-800/80 hover:border-emerald-500/40'
                            }`}
                          >
                            <div className="flex items-center gap-3 truncate max-w-[65%]">
                              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                              <div className="truncate">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-xs font-bold text-white truncate" title={c.name}>{c.name}</p>
                                  {isTopBuyer && (
                                    <span className="flex items-center gap-1 bg-emerald-500/20 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[9px] font-black text-emerald-400 uppercase tracking-widest shrink-0">
                                      <Crown size={10} className="fill-emerald-400 text-emerald-400" /> TOP BUYER
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-zinc-400 font-medium">
                                  {c.state || 'Unspecified State'} {c.city ? `• ${c.city}` : ''}
                                  {c.total_spent > 0 && <span className="text-emerald-400 font-semibold ml-1.5">• ₦{c.total_spent.toLocaleString()}</span>}
                                </p>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-black text-emerald-400">
                                {c.quantity.toLocaleString()} pcs
                              </p>
                              <p className="text-[10px] text-zinc-400 font-semibold">{pct}% share</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                /* Tab 2: Regional & Geopolitical Zone Breakdown */
                <div className="space-y-6">
                  {/* Region Summary Pie Chart & Cards */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                    {/* Region Pie Chart */}
                    <div 
                      onMouseEnter={() => setIsPieHovered(true)}
                      onMouseLeave={() => setIsPieHovered(false)}
                      className="h-[260px] w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex items-center justify-center relative cursor-pointer group"
                    >
                      {/* Center Vital Stats Display */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
                        <p className="text-xl font-black text-white tracking-tight drop-shadow-md">
                          {regionBreakdown.list[0] ? `${((regionBreakdown.list[0].quantity / selectedProduct.total_quantity) * 100).toFixed(1)}%` : '100%'}
                        </p>
                        <p className="text-[9px] font-extrabold uppercase tracking-widest text-emerald-400 drop-shadow-sm mt-0.5">
                          {regionBreakdown.list[0]?.name || 'TOP REGION'}
                        </p>
                      </div>

                      <div 
                        className="w-full h-full"
                        style={{
                          animation: 'spin 25s linear infinite',
                          animationPlayState: isPieHovered ? 'paused' : 'running'
                        }}
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={regionBreakdown.list.map(r => ({
                                name: r.name,
                                value: r.quantity,
                                percentage: ((r.quantity / selectedProduct.total_quantity) * 100).toFixed(1)
                              }))}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={90}
                              paddingAngle={4}
                              dataKey="value"
                            >
                              {regionBreakdown.list.map((r, index) => (
                                <Cell key={`r-cell-${index}`} fill={REGION_COLOR_MAP[r.name] || PIE_COLORS[index % PIE_COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Region Cards Grid */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Select Region to Filter Customers</h3>
                        {selectedRegion !== 'all' && (
                          <button
                            onClick={() => setSelectedRegion('all')}
                            className="text-xs text-emerald-400 font-semibold hover:underline"
                          >
                            Show All Regions
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div
                          onClick={() => setSelectedRegion('all')}
                          className={`p-3 rounded-xl border cursor-pointer transition-all ${
                            selectedRegion === 'all'
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-sm'
                              : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-white'
                          }`}
                        >
                          <p className="text-xs font-bold">All Regions</p>
                          <p className="text-[10px] opacity-80 mt-0.5">{selectedProduct.customers.length} Customers</p>
                        </div>

                        {regionBreakdown.list.map((r) => {
                          const pct = ((r.quantity / selectedProduct.total_quantity) * 100).toFixed(1)
                          const color = REGION_COLOR_MAP[r.name] || '#9ca3af'
                          const isSelected = selectedRegion === r.name
                          const topBuyerInRegion = r.customers && r.customers[0]

                          return (
                            <div
                              key={r.name}
                              onClick={() => setSelectedRegion(r.name)}
                              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-zinc-800 border-emerald-500/50 shadow-md scale-[1.02]'
                                  : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <div className="flex items-center gap-2 truncate">
                                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                  <p className="text-xs font-bold text-white truncate">{r.name}</p>
                                </div>
                                <span className="text-[10px] font-extrabold text-emerald-400">{pct}%</span>
                              </div>
                              <p className="text-[10px] text-zinc-400 mt-1 font-medium">
                                {r.quantity.toLocaleString()} units ({r.customers.length} buyers)
                              </p>
                              {topBuyerInRegion && (
                                <p className="text-[9px] text-emerald-400 font-semibold truncate mt-1 flex items-center gap-1 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                  <Crown size={9} className="fill-emerald-400 shrink-0" />
                                  <span className="truncate">Top: {topBuyerInRegion.name}</span>
                                </p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Customers in Selected Region Drill-Down Table */}
                  <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                      <div className="flex items-center gap-2">
                        <Globe size={16} className="text-emerald-400" />
                        <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                          {selectedRegion === 'all' ? 'All Customers Nationwide' : `Customers in ${selectedRegion} Region`}
                        </h3>
                      </div>
                      <span className="text-xs text-zinc-400 font-medium">
                        {modalCustomers.length} buyers
                      </span>
                    </div>

                    <div 
                      className="max-h-[220px] overflow-y-auto space-y-2.5 pr-2"
                      style={{ colorScheme: 'dark', scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 transparent' }}
                    >
                      {modalCustomers.map((c, cIdx) => {
                        const productPct = ((c.quantity / selectedProduct.total_quantity) * 100).toFixed(1)
                        const regTotal = selectedRegion === 'all' ? selectedProduct.total_quantity : (regionBreakdown.map[selectedRegion]?.quantity || 1)
                        const regionSharePct = ((c.quantity / regTotal) * 100).toFixed(1)
                        const isTopBuyer = cIdx === 0

                        return (
                          <div 
                            key={cIdx} 
                            onClick={() => setCustomerDetailsModal(c)}
                            className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                              isTopBuyer
                                ? 'bg-emerald-500/10 border-emerald-500/40 shadow-md hover:border-emerald-400'
                                : 'bg-zinc-900 border-zinc-800/80 hover:border-emerald-500/40'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                                isTopBuyer ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-zinc-800 text-zinc-400'
                              }`}>
                                {isTopBuyer ? <Crown size={14} className="fill-emerald-400 text-emerald-400" /> : `#${cIdx + 1}`}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="text-xs font-bold text-white">{c.name}</p>
                                  {isTopBuyer && (
                                    <span className="flex items-center gap-1 bg-emerald-500/20 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[9px] font-black text-emerald-400 uppercase tracking-wider">
                                      <Crown size={9} className="fill-emerald-400 text-emerald-400" />
                                      {selectedRegion === 'all' ? 'TOP BUYER' : `TOP BUYER IN ${selectedRegion.toUpperCase()}`}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-0.5">
                                  <span className="flex items-center gap-1">
                                    <MapPin size={10} className="text-emerald-400" />
                                    {c.state || 'Unspecified State'} {c.city ? `(${c.city})` : ''}
                                  </span>
                                  <span>•</span>
                                  <span className="text-zinc-400">{getRegionForCustomer(c)}</span>
                                  {c.total_spent > 0 && (
                                    <>
                                      <span>•</span>
                                      <span className="text-emerald-400 font-bold">₦{c.total_spent.toLocaleString()}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="text-right">
                              <p className="text-xs font-black text-emerald-400">
                                {c.quantity.toLocaleString()} pcs
                              </p>
                              <p className="text-[10px] text-zinc-400 font-semibold">
                                {productPct}% of product {selectedRegion !== 'all' && `(${regionSharePct}% of ${selectedRegion})`}
                              </p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Customer Cumulative Expense & Order History Modal */}
      {customerDetailsModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[60] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-700 rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Crown size={20} className="fill-emerald-400 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    {customerDetailsModal.name}
                  </h2>
                  <p className="text-xs text-zinc-400 font-medium mt-0.5">
                    {customerDetailsModal.state || 'Unspecified State'} {customerDetailsModal.city ? `• ${customerDetailsModal.city}` : ''} ({getRegionForCustomer(customerDetailsModal)})
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setCustomerDetailsModal(null)}
                className="p-2 bg-zinc-800 text-zinc-400 hover:text-white rounded-xl transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 space-y-6 overflow-y-auto" style={{ colorScheme: 'dark', scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 transparent' }}>
              {/* Cumulative Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-zinc-950 border border-emerald-500/30 rounded-2xl p-4">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Cumulative Total Spent</p>
                  <p className="text-base font-black text-emerald-400 mt-1">
                    ₦{(customerDetailsModal.total_spent || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>

                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total Quantity Purchased</p>
                  <p className="text-base font-black text-white mt-1">
                    {(customerDetailsModal.quantity || 0).toLocaleString()} pcs
                  </p>
                </div>

                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4">
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Total Orders</p>
                  <p className="text-base font-black text-sky-400 mt-1">
                    {customerDetailsModal.order_count || (customerDetailsModal.orders ? customerDetailsModal.orders.length : 1)} orders
                  </p>
                </div>
              </div>

              {/* Order History Breakdown Table */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-2">
                  <Receipt size={14} className="text-emerald-400" />
                  Order Purchase History Breakdown
                </h3>

                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden">
                  <div className="grid grid-cols-4 px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                    <span>Order Number</span>
                    <span>Date</span>
                    <span className="text-right">Quantity</span>
                    <span className="text-right">Total Amount</span>
                  </div>

                  <div className="divide-y divide-zinc-800/60 max-h-[220px] overflow-y-auto" style={{ colorScheme: 'dark', scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 transparent' }}>
                    {(customerDetailsModal.orders && customerDetailsModal.orders.length > 0) ? (
                      customerDetailsModal.orders.map((ord, oIdx) => (
                        <div key={oIdx} className="grid grid-cols-4 px-4 py-3 text-xs items-center hover:bg-zinc-900/50 transition-colors">
                          <span className="font-bold text-white">{ord.order_number}</span>
                          <span className="text-zinc-400">{ord.date}</span>
                          <span className="text-right font-bold text-zinc-200">{ord.quantity.toLocaleString()} pcs</span>
                          <span className="text-right font-black text-emerald-400">
                            ₦{(ord.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 text-center text-zinc-500 text-xs">
                        No individual order breakdown recorded.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default StoreTrendingPage

import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, TrendingUp, BarChart3, Loader2, Package, Search } from 'lucide-react'
import api from '../services/api'

const TRENDING_RANGES = [
  { value: '1', label: 'Today' },
  { value: '7', label: 'This Week' },
  { value: '30', label: 'Last 30 Days' },
  { value: '90', label: 'Last 3 Months' },
  { value: 'all', label: 'All-Time' }
]

const StoreTrendingPage = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  
  const [store, setStore] = useState(null)
  const [trendingData, setTrendingData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  
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
        // Fetch store details to display name in header
        const storeRes = await api.get(`/stores/${id}`)
        setStore(storeRes.data)

        // Fetch detailed trending data
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

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-zinc-950">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-zinc-900 border-b border-zinc-800 shrink-0">
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

        <div className="flex bg-zinc-950 p-1 border border-zinc-800 rounded-xl overflow-x-auto">
          {TRENDING_RANGES.map(range => (
            <button
              key={range.value}
              onClick={() => setTimeframe(range.value)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 whitespace-nowrap ${
                timeframe === range.value
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
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
                <div key={idx} className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-5 shadow-xl flex flex-col hover:border-emerald-500/30 transition-all duration-300">
                  {/* Card Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center border border-zinc-700/50 shrink-0">
                        <BarChart3 size={20} className="text-sky-400" />
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
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-3 border-b border-zinc-800 pb-2">Customer Breakdown</p>
                    <div className="max-h-[150px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent space-y-3">
                      {item.customers.map((c, cIdx) => {
                        const percentage = maxQty > 0 ? (c.quantity / maxQty) * 100 : 0
                        return (
                          <div key={cIdx} className="flex flex-col gap-1.5 group">
                            <div className="flex justify-between items-end text-xs">
                              <span className="text-zinc-300 font-medium truncate max-w-[75%]" title={c.name}>
                                {c.name}
                              </span>
                              <span className="text-zinc-100 font-bold">
                                {c.quantity.toLocaleString()}
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-emerald-500 to-sky-400 rounded-full transition-all duration-1000 ease-out relative"
                                style={{ width: `${percentage}%` }}
                              >
                                <div className="absolute inset-0 bg-white/20 w-full transform -translate-x-full group-hover:translate-x-full transition-transform duration-700"></div>
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
    </div>
  )
}

export default StoreTrendingPage

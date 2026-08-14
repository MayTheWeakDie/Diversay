import React, { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import api, { getWithCache, isCached, invalidateCache, clearCache } from '../services/api'
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
import AccessGatewayModal from '../components/AccessGatewayModal'
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Truck,
  FileText,
  Activity,
  User,
  Hash,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Info,
  Plus,
  Trash2,
  Edit3,
  Download
} from 'lucide-react'
import { generateDeliveryAcknowledgment } from '../utils/pdfGenerator'
import DownloadAcknowledgmentModal from '../components/DownloadAcknowledgmentModal'

// Dropdown component for fuzzy product search
const ProductSearchDropdown = ({ query, products, onSelect }) => {
  const filtered = products
    .filter(p => p.name.toLowerCase().includes(query.toLowerCase()))

  if (filtered.length === 0) return null

  return (
    <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-800 border border-zinc-700/80 rounded-xl shadow-xl z-50 max-h-[132px] overflow-y-auto custom-product-dropdown-scroll backdrop-blur-md">
      <ul className="divide-y divide-zinc-800">
        {filtered.map((product) => (
          <li key={product.id}>
            <button
              type="button"
              onClick={() => onSelect(product)}
              className="w-full px-4 py-2.5 text-left text-sm text-zinc-300 hover:text-white hover:bg-zinc-700/55 transition-colors flex justify-between items-center"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-zinc-100">{product.name}</span>
                {product.brand && (
                  <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                    product.brand.toUpperCase() === 'DSLP'
                      ? 'bg-purple-500/25 text-purple-400 border border-purple-500/35'
                      : 'bg-sky-500/25 text-sky-400 border border-sky-500/35'
                  }`}>
                    {product.brand}
                  </span>
                )}
              </div>
              {product.category && (
                <span className="text-[10px] text-zinc-400 font-semibold px-2 py-0.5 bg-zinc-800 rounded uppercase tracking-wider">
                  {product.category}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function OrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showAccessGateway, setShowAccessGateway] = useState(false)
  const [isAcknowledgmentModalOpen, setIsAcknowledgmentModalOpen] = useState(false)
  const { hasWriteAccess } = useAuth()

  // Preview state
  const [previewCommit, setPreviewCommit] = useState(null)

  const handlePreviewCommit = (log, detailsObj, idx) => {
    if (previewCommit?.id === log.id) {
      setPreviewCommit(null)
    } else {
      const prevSnapshot = getPreviousSnapshot(idx)
      setPreviewCommit({
        id: log.id,
        commit_hash: detailsObj.commit_hash,
        author: log.user_name || "Operator",
        timestamp: log.timestamp,
        state_snapshot: detailsObj.state_snapshot,
        previous_snapshot: prevSnapshot
      })
    }
  }

  const isFieldDifferent = (key, val) => {
    if (!previewCommit) return false
    const dateFields = ['dispatch_time', 'expected_delivery_time', 'actual_delivery_time']
    const currentVal = order[key]
    
    if (dateFields.includes(key)) {
      const parseAsUtcIfNaive = (dateString) => {
        if (!dateString) return null
        let s = dateString
        if (typeof s === 'string' && !s.includes('Z') && !/\+\d{2}:\d{2}$/.test(s) && !/-\d{2}:\d{2}$/.test(s)) {
          s = s + 'Z'
        }
        try {
          const ms = new Date(s).getTime()
          return isNaN(ms) ? null : ms
        } catch {
          return null
        }
      }
      return parseAsUtcIfNaive(currentVal) !== parseAsUtcIfNaive(val)
    }
    
    return (currentVal || '').toString().trim() !== (val || '').toString().trim()
  }

  const getFieldDiffMarker = (key, val) => {
    if (!previewCommit) return null
    if (!isFieldDifferent(key, val)) return null
    
    const dateFields = ['dispatch_time', 'expected_delivery_time', 'actual_delivery_time']
    const currentVal = order[key]
    let formattedVal = currentVal
    if (dateFields.includes(key) && currentVal) {
      formattedVal = formatDate(currentVal)
    }
    return (
      <span className="text-[10px] text-white/40 font-medium block mt-0.5 leading-none">
        Current: {formattedVal || 'N/A'}
      </span>
    )
  }

  const isLineItemDifferent = (item) => {
    if (!previewCommit) return false
    const currentItem = order.line_items?.find(it => it.product_id === item.product_id)
    if (!currentItem) return true
    return currentItem.quantity !== item.quantity || currentItem.unit !== item.unit
  }

  const getLineItemDiffMarker = (item) => {
    if (!previewCommit) return null
    const currentItem = order.line_items?.find(it => it.product_id === item.product_id)
    if (!currentItem) {
      return (
        <span className="text-[9px] text-white/40 font-medium block mt-0.5 leading-none">
          Current: Not in order
        </span>
      )
    }
    if (currentItem.quantity !== item.quantity || currentItem.unit !== item.unit) {
      return (
        <span className="text-[9px] text-white/40 font-medium block mt-0.5 leading-none">
          Current: {currentItem.quantity} {currentItem.unit}
        </span>
      )
    }
    return null
  }

  // Products state for editing
  const [products, setProducts] = useState([])
  const [isEditing, setIsEditing] = useState(false)

  // Edit fields state
  const [editWaybill, setEditWaybill] = useState('')
  const [editInvoice, setEditInvoice] = useState('')
  const [editDriver, setEditDriver] = useState('')
  const [editVehicle, setEditVehicle] = useState('')
  const [editDispatchTime, setEditDispatchTime] = useState('')
  const [editExpectedDelivery, setEditExpectedDelivery] = useState('')
  const [editActualDelivery, setEditActualDelivery] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editLineItems, setEditLineItems] = useState([])
  const [editReferenceCards, setEditReferenceCards] = useState([])
  const [editFuelCost, setEditFuelCost] = useState('0')
  const [editWaybillCost, setEditWaybillCost] = useState('0')
  const [editOtherCosts, setEditOtherCosts] = useState([])
  const [commitMessage, setCommitMessage] = useState('')
  const [activeProductSearchIndex, setActiveProductSearchIndex] = useState(null)
  const [activeCardProductSearch, setActiveCardProductSearch] = useState(null)

  const getPreviousSnapshot = (currentIdx) => {
    for (let i = currentIdx + 1; i < auditLogs.length; i++) {
      const log = auditLogs[i]
      try {
        const detailsObj = typeof log.details === 'string' ? JSON.parse(log.details) : log.details
        if (detailsObj && detailsObj.state_snapshot) {
          return detailsObj.state_snapshot
        }
      } catch (e) {
        // ignore
      }
    }
    return null
  }

  const getSnapshotDiff = (prev, curr) => {
    if (!curr) return []
    if (!prev) {
      return [{ type: 'info', text: 'Initial order creation' }]
    }

    const changes = []

    const fields = [
      { key: 'invoice_number', label: 'Invoice No' },
      { key: 'waybill_number', label: 'Delivery No' },
      { key: 'driver_name', label: 'Driver Name' },
      { key: 'vehicle_number', label: 'Vehicle Number' },
      { key: 'notes', label: 'Notes' }
    ]

    fields.forEach(({ key, label }) => {
      const prevVal = (prev[key] || '').toString().trim()
      const currVal = (curr[key] || '').toString().trim()
      if (prevVal !== currVal) {
        changes.push({
          type: 'modify',
          text: `Changed ${label} from "${prevVal || 'N/A'}" to "${currVal || 'N/A'}"`
        })
      }
    })

    const dateFields = [
      { key: 'dispatch_time', label: 'Dispatch Time' },
      { key: 'expected_delivery_time', label: 'Expected Delivery Time' },
      { key: 'actual_delivery_time', label: 'Actual Delivery Time' }
    ]

    const parseAsUtcIfNaive = (dateString) => {
      if (!dateString) return null
      let s = dateString
      if (typeof s === 'string' && !s.includes('Z') && !/\+\d{2}:\d{2}$/.test(s) && !/-\d{2}:\d{2}$/.test(s)) {
        s = s + 'Z'
      }
      try {
        const ms = new Date(s).getTime()
        return isNaN(ms) ? null : ms
      } catch {
        return null
      }
    }

    const formatTime = (isoStr) => {
      if (!isoStr) return 'N/A'
      try {
        let s = isoStr
        if (typeof s === 'string' && !s.includes('Z') && !/\+\d{2}:\d{2}$/.test(s) && !/-\d{2}:\d{2}$/.test(s)) {
          s = s + 'Z'
        }
        return new Date(s).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      } catch {
        return isoStr
      }
    }

    dateFields.forEach(({ key, label }) => {
      const prevMs = parseAsUtcIfNaive(prev[key])
      const currMs = parseAsUtcIfNaive(curr[key])
      if (prevMs !== currMs) {
        const prevVal = prev[key] ? formatTime(prev[key]) : 'N/A'
        const currVal = curr[key] ? formatTime(curr[key]) : 'N/A'
        changes.push({
          type: 'modify',
          text: `Changed ${label} from ${prevVal} to ${currVal}`
        })
      }
    })

    const prevItems = prev.line_items || []
    const currItems = curr.line_items || []

    const prevMap = {}
    prevItems.forEach(item => {
      prevMap[item.product_id] = item
    })

    const currMap = {}
    currItems.forEach(item => {
      currMap[item.product_id] = item
    })

    prevItems.forEach(prevItem => {
      const currItem = currMap[prevItem.product_id]
      if (!currItem) {
        changes.push({
          type: 'delete',
          text: `Removed ${prevItem.product_name || 'Product'} (${prevItem.quantity} ${prevItem.unit})`
        })
      } else {
        if (prevItem.quantity !== currItem.quantity || prevItem.unit !== currItem.unit) {
          changes.push({
            type: 'modify',
            text: `Updated ${currItem.product_name || 'Product'}: ${prevItem.quantity} ${prevItem.unit} → ${currItem.quantity} ${currItem.unit}`
          })
        }
      }
    })

    currItems.forEach(currItem => {
      const prevItem = prevMap[currItem.product_id]
      if (!prevItem) {
        changes.push({
          type: 'add',
          text: `Added ${currItem.product_name || 'Product'} (${currItem.quantity} ${currItem.unit})`
        })
      }
    })

    return changes
  }

  useEffect(() => {
    fetchOrderDetails()
  }, [id])

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.product-search-container')) {
        setActiveProductSearchIndex(null)
        setActiveCardProductSearch(null)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [])

  const fetchOrderDetails = async () => {
    try {
      if (!isCached(`/orders/${id}`)) {
        setLoading(true)
      }

      // Fetch order details with SWR cache
      const { data: orderData } = await getWithCache(`/orders/${id}`, {
        onCacheUpdate: (freshOrder) => {
          setOrder(freshOrder)
        }
      })
      setOrder(orderData)

      // Fetch audit logs with SWR cache
      try {
        const { data: auditData } = await getWithCache(`/orders/${id}/audit-log`, {
          onCacheUpdate: (freshAudit) => {
            setAuditLogs(freshAudit || [])
          }
        })
        setAuditLogs(auditData || [])
      } catch (auditErr) {
        console.error("Failed to load audit logs for order:", auditErr)
      }

      setError(null)
    } catch (err) {
      console.error("Failed to fetch order details:", err)
      if (!order) {
        setError("Failed to load order details. Please verify the order ID.")
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchProducts = async () => {
    try {
      const res = await getWithCache('/products', { params: { limit: 1000 } })
      setProducts(res.data.items || res.data || [])
    } catch (err) {
      console.error("Failed to load products registry:", err)
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN'
    }).format(amount)
  }

  const formatPhoneNumber = (phone) => {
    if (!phone) return 'N/A'
    const cleaned = phone.replace(/\D/g, '')
    if (!cleaned) return phone
    let localNumber = cleaned
    if (localNumber.startsWith('234')) {
      localNumber = localNumber.slice(3)
    } else if (localNumber.startsWith('0')) {
      localNumber = localNumber.slice(1)
    }
    if (localNumber.length === 10) {
      const part1 = localNumber.slice(0, 3)
      const part2 = localNumber.slice(3, 6)
      const part3 = localNumber.slice(6)
      return `(+234) ${part1}-${part2}-${part3}`
    }
    return `(+234) ${localNumber}`
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A'
    try {
      let s = dateString
      if (typeof s === 'string' && !s.includes('Z') && !/\+\d{2}:\d{2}$/.test(s) && !/-\d{2}:\d{2}$/.test(s)) {
        s = s.endsWith(' ') ? s.trim() + 'Z' : s + 'Z'
      }
      return new Date(s).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return 'N/A'
    }
  }

  const formatForInput = (dateString) => {
    if (!dateString) return ''
    try {
      let s = dateString
      if (typeof s === 'string' && !s.includes('Z') && !/\+\d{2}:\d{2}$/.test(s) && !/-\d{2}:\d{2}$/.test(s)) {
        s = s + 'Z'
      }
      const date = new Date(s)
      const pad = (num) => String(num).padStart(2, '0')
      const yyyy = date.getFullYear()
      const mm = pad(date.getMonth() + 1)
      const dd = pad(date.getDate())
      const hh = date.getHours()
      const min = date.getMinutes()
      return `${yyyy}-${mm}-${dd}T${pad(hh)}:${pad(min)}`
    } catch {
      return ''
    }
  }

  const getStatusConfig = (status) => {
    const configs = {
      'In Transit': { color: 'text-blue-400 border-blue-500/30 bg-blue-500/10', icon: Clock },
      'Delayed': { color: 'text-red-400 border-red-500/30 bg-red-500/10', icon: AlertTriangle },
      'Delivered (On Time)': { color: 'text-green-400 border-green-500/30 bg-green-500/10', icon: CheckCircle2 },
      'Delivered (Late)': { color: 'text-orange-400 border-orange-500/30 bg-orange-500/10', icon: AlertTriangle },
      'Draft': { color: 'text-zinc-400 border-zinc-500/30 bg-zinc-500/10', icon: FileText }
    }
    return configs[status] || { color: 'text-zinc-400 border-zinc-500/30 bg-zinc-500/10', icon: FileText }
  }

  // Edit transition
  const handleStartEdit = () => {
    setEditWaybill(order.waybill_number || '')
    setEditInvoice(order.invoice_number || '')
    setEditDriver(order.driver_name || '')
    setEditVehicle(order.vehicle_number || '')
    setEditDispatchTime(formatForInput(order.dispatch_time))
    setEditExpectedDelivery(formatForInput(order.expected_delivery_time))
    setEditActualDelivery(formatForInput(order.actual_delivery_time))
    setEditNotes(order.notes || '')
    setEditFuelCost(order.fuel_cost !== undefined ? order.fuel_cost.toString() : '0')
    setEditWaybillCost(order.waybill_cost !== undefined ? order.waybill_cost.toString() : '0')
    setEditOtherCosts(order.other_costs ? order.other_costs.map(c => ({ id: Math.random().toString(36).substr(2, 9), ...c })) : [])
    
    if (order.reference_cards && order.reference_cards.length > 0) {
      setEditReferenceCards(order.reference_cards.map(card => ({
        id: card.id || Math.random().toString(36).substr(2, 9),
        invoice_number: card.invoice_number || '',
        waybill_number: card.waybill_number || '',
        brand: card.brand || 'DSL',
        line_items: card.line_items.map(item => ({
          product_id: item.product_id.toString(),
          searchQuery: item.product_name || '',
          quantity: item.quantity,
          unit: item.unit
        }))
      })))
      setEditLineItems([])
    } else {
      setEditLineItems(order.line_items.map(item => ({
        product_id: item.product_id.toString(),
        searchQuery: item.product_name || '',
        quantity: item.quantity,
        unit: item.unit
      })))
      setEditReferenceCards([])
    }
    
    setCommitMessage('')
    setIsEditing(true)
    fetchProducts()
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
  }

  const handleAddLineItem = () => {
    setEditLineItems([...editLineItems, { product_id: '', searchQuery: '', quantity: 1, unit: 'Carton' }])
  }

  const handleRemoveLineItem = (idx) => {
    if (editLineItems.length === 1) return
    setEditLineItems(editLineItems.filter((_, i) => i !== idx))
  }

  // Reference Card Edit Helpers
  const handleReferenceCardChange = (cardId, field, value) => {
    setEditReferenceCards(prev => prev.map(card => {
      if (card.id === cardId) {
        return { ...card, [field]: value }
      }
      return card
    }))
  }

  const handleAddReferenceCard = () => {
    setEditReferenceCards(prev => [
      ...prev,
      {
        id: Math.random().toString(36).substr(2, 9),
        invoice_number: '',
        waybill_number: '',
        brand: 'DSL',
        line_items: [{ product_id: '', searchQuery: '', quantity: 1, unit: 'Carton' }]
      }
    ])
  }

  const handleRemoveReferenceCard = (cardId) => {
    if (editReferenceCards.length === 1) return
    setEditReferenceCards(prev => prev.filter(card => card.id !== cardId))
  }

  const handleCardLineItemChange = (cardId, itemIdx, field, value) => {
    setEditReferenceCards(prev => prev.map(card => {
      if (card.id === cardId) {
        const updatedItems = [...card.line_items]
        updatedItems[itemIdx] = { ...updatedItems[itemIdx], [field]: value }
        
        // Auto-select product id if exact match
        if (field === 'searchQuery') {
          const exactProd = products.find(p => p.name.toLowerCase() === value.trim().toLowerCase())
          if (exactProd) {
            updatedItems[itemIdx].product_id = exactProd.id.toString()
          } else {
            updatedItems[itemIdx].product_id = ''
          }
        }
        
        return { ...card, line_items: updatedItems }
      }
      return card
    }))
  }

  const handleCardAddLineItem = (cardId) => {
    setEditReferenceCards(prev => prev.map(card => {
      if (card.id === cardId) {
        return {
          ...card,
          line_items: [...card.line_items, { product_id: '', searchQuery: '', quantity: 1, unit: 'Carton' }]
        }
      }
      return card
    }))
  }

  const handleCardRemoveLineItem = (cardId, itemIdx) => {
    setEditReferenceCards(prev => prev.map(card => {
      if (card.id === cardId) {
        if (card.line_items.length === 1) return card
        return {
          ...card,
          line_items: card.line_items.filter((_, i) => i !== itemIdx)
        }
      }
      return card
    }))
  }

  const getFilteredProductsForCard = (brand) => {
    if (!brand) return products
    return products.filter(p => (p.brand || '').toLowerCase() === brand.toLowerCase())
  }

  const getProductRate = (productId) => {
    if (!productId) return 0.0
    const prod = products.find(p => p.id === parseInt(productId))
    return prod ? prod.unit_price : 0.0
  }

  const handleSaveEdit = async () => {
    const safeToISO = (val) => {
      if (!val) return null
      let s = val
      if (typeof s === 'string' && !s.includes('Z') && !/\+\d{2}:\d{2}$/.test(s) && !/-\d{2}:\d{2}$/.test(s)) {
        s = s + 'Z'
      }
      const d = new Date(s)
      if (isNaN(d.getTime())) return null
      return d.toISOString()
    }

    const dispatchISO = safeToISO(editDispatchTime)
    const expectedISO = safeToISO(editExpectedDelivery)
    const actualISO = safeToISO(editActualDelivery)

    if (!dispatchISO || !expectedISO) {
      alert("Please specify valid dispatch and expected delivery times.")
      return
    }

    const hasRefCards = order.reference_cards && order.reference_cards.length > 0

    if (hasRefCards) {
      // Validate reference cards fields are filled
      const invalidCard = editReferenceCards.find(card => !card.invoice_number || !card.waybill_number || !card.brand)
      if (invalidCard) {
        alert("Please fill in Invoice No, Delivery No, and Brand for all reference cards.")
        return
      }

      // Check for duplicate invoice/delivery numbers within the form
      const invoices = editReferenceCards.map(c => (c.invoice_number || '').trim().toLowerCase())
      const waybills = editReferenceCards.map(c => (c.waybill_number || '').trim().toLowerCase())
      if (new Set(invoices).size !== invoices.length) {
        alert("Duplicate Invoice Numbers detected in reference cards.")
        return
      }
      if (new Set(waybills).size !== waybills.length) {
        alert("Duplicate Delivery Numbers detected in reference cards.")
        return
      }

      // Check for invalid line items inside cards
      let itemError = false
      editReferenceCards.forEach(card => {
        const invalidItem = card.line_items.find(item => !item.product_id || parseFloat(item.quantity) <= 0)
        if (invalidItem) {
          itemError = true
        }
      })
      if (itemError) {
        alert("Please select a valid product and quantity for all ledger items in every reference card.")
        return
      }
    } else {
      const invalidItem = editLineItems.find(item => !item.product_id || parseFloat(item.quantity) <= 0)
      if (invalidItem) {
        alert("Please select a valid product and quantity for all ledger items.")
        return
      }
    }

    try {
      setLoading(true)
      const payload = {
        customer_id: order.customer_id,
        waybill_number: hasRefCards ? null : (editWaybill || null),
        invoice_number: hasRefCards ? null : (editInvoice || null),
        dispatch_time: dispatchISO,
        expected_delivery_time: expectedISO,
        actual_delivery_time: actualISO,
        driver_name: editDriver || null,
        vehicle_number: editVehicle || null,
        notes: editNotes || null,
        fuel_cost: parseFloat(editFuelCost || 0),
        waybill_cost: parseFloat(editWaybillCost || 0),
        other_costs: editOtherCosts.map(c => ({ name: c.name, amount: parseFloat(c.amount || 0) })),
        commit_message: commitMessage.trim() || "Updated manifest details"
      }

      if (hasRefCards) {
        payload.reference_cards = editReferenceCards.map(card => ({
          invoice_number: (card.invoice_number || '').trim(),
          waybill_number: (card.waybill_number || '').trim(),
          brand: card.brand,
          line_items: card.line_items.map(item => ({
            product_id: parseInt(item.product_id),
            quantity: parseFloat(item.quantity),
            unit: item.unit
          }))
        }))
      } else {
        payload.line_items = editLineItems.map(item => ({
          product_id: parseInt(item.product_id),
          quantity: parseFloat(item.quantity),
          unit: item.unit
        }))
      }

      await api.put(`/orders/${id}`, payload)
      setIsEditing(false)
      await fetchOrderDetails()
    } catch (err) {
      console.error("Failed to save changes:", err)
      alert(err.response?.data?.detail || err.message || "Failed to save manifest details.")
    } finally {
      setLoading(false)
    }
  }

  // Revert implementation
  const handleRevert = async (log, detailsObj) => {
    if (!detailsObj || !detailsObj.state_snapshot) {
      alert("This commit does not contain a snapshot of the order state.")
      return
    }

    const snapshot = detailsObj.state_snapshot
    const shortHash = detailsObj.commit_hash || `log-${log.id}`

    if (!window.confirm(`Are you sure you want to revert this order's specification and ledger to commit [${shortHash}]?`)) {
      return
    }

    try {
      setLoading(true)
      const payload = {
        customer_id: snapshot.customer_id,
        waybill_number: snapshot.reference_cards && snapshot.reference_cards.length > 0 ? null : (snapshot.waybill_number || null),
        invoice_number: snapshot.reference_cards && snapshot.reference_cards.length > 0 ? null : (snapshot.invoice_number || null),
        dispatch_time: snapshot.dispatch_time,
        expected_delivery_time: snapshot.expected_delivery_time,
        actual_delivery_time: snapshot.actual_delivery_time || null,
        driver_name: snapshot.driver_name || null,
        vehicle_number: snapshot.vehicle_number || null,
        notes: snapshot.notes || null,
        commit_message: `Reverted to commit [${shortHash}]`
      }

      if (snapshot.reference_cards && snapshot.reference_cards.length > 0) {
        payload.reference_cards = snapshot.reference_cards.map(card => ({
          invoice_number: card.invoice_number,
          waybill_number: card.waybill_number,
          brand: card.brand,
          line_items: card.line_items.map(item => ({
            product_id: parseInt(item.product_id),
            quantity: parseFloat(item.quantity),
            unit: item.unit
          }))
        }))
      } else {
        payload.line_items = snapshot.line_items.map(item => ({
          product_id: parseInt(item.product_id),
          quantity: parseFloat(item.quantity),
          unit: item.unit
        }))
      }

      await api.put(`/orders/${id}`, payload)
      await fetchOrderDetails()
      alert(`Successfully reverted order to commit [${shortHash}]!`)
    } catch (err) {
      console.error("Failed to revert order:", err)
      setError("Failed to revert order to previous commit. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteOrder = async () => {
    if (!window.confirm("Are you sure you want to delete this order? This action cannot be undone and will restore stock inventory levels.")) {
      return
    }
    setIsDeleting(true)
    setTimeout(async () => {
      setLoading(true)
      try {
        setError(null)
        await api.delete(`/orders/${id}`)
        clearCache()
        alert("Order deleted successfully.")
        navigate("/orders")
      } catch (err) {
        console.error("Failed to delete order:", err)
        setIsDeleting(false)
        setError(err.response?.data?.detail || "Failed to delete order. Please try again.")
        setLoading(false)
      }
    }, 450)
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-zinc-400">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-500 mb-4"></div>
        <p className="text-sm">Fetching manifest details...</p>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="max-w-3xl mx-auto mt-8 bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
        <AlertTriangle size={48} className="mx-auto text-red-400 mb-4" />
        <p className="text-zinc-300 font-semibold text-lg">{error || "Order not found"}</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-all"
        >
          <ArrowLeft size={16} /> Go Back
        </button>
      </div>
    )
  }  const displayOrder = previewCommit ? previewCommit.state_snapshot : order
  const statusConfig = getStatusConfig(order.order_status)
  const StatusIcon = statusConfig.icon

  return (
    <>
    <div className={`transition-all duration-500 ease-out max-w-7xl mx-auto ${isEditing ? 'pb-32' : 'pb-12'} ${isDeleting ? '-translate-x-[150%] opacity-0 scale-95 pointer-events-none' : 'animate-in fade-in duration-300'}`}>
      {/* Navigation & Actions Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-3 text-sm bg-transparent border-none cursor-pointer"
          >
            <ArrowLeft size={16} /> Go Back
          </button>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold text-white">{order.order_number}</h1>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusConfig.color}`}>
              <StatusIcon size={12} />
              {order.order_status}
            </span>
          </div>
        </div>
        <div className="flex flex-col md:items-end gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {!isEditing && (
              <button
                onClick={() => setIsAcknowledgmentModalOpen(true)}
                className="px-4 py-2 border border-emerald-500/40 hover:border-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 font-semibold rounded-xl transition-all duration-200 text-sm flex items-center gap-2 shadow-sm"
              >
                <Download size={14} />
                Download Acknowledgment
              </button>
            )}
            {!isEditing && !previewCommit && (
              <>
                <button
                  onClick={() => {
                    if (hasWriteAccess) {
                      handleStartEdit()
                    } else {
                      setShowAccessGateway(true)
                    }
                  }}
                  className="px-4 py-2 border border-zinc-750 hover:border-white bg-transparent hover:bg-white text-zinc-300 hover:text-zinc-900 font-semibold rounded-xl transition-all duration-200 text-sm flex items-center gap-2"
                >
                  <Edit3 size={14} />
                  Edit Manifest & Ledger
                </button>
                <button
                  onClick={() => {
                    if (hasWriteAccess) {
                      handleDeleteOrder()
                    } else {
                      setShowAccessGateway(true)
                    }
                  }}
                  className="px-4 py-2 border border-red-900/50 hover:border-red-500 bg-red-950/20 hover:bg-red-500 text-red-400 hover:text-white font-semibold rounded-xl transition-all duration-200 text-sm flex items-center gap-2"
                >
                  <Trash2 size={14} />
                  Delete Order
                </button>
              </>
            )}
          </div>
          <div className="text-xs text-zinc-500 font-mono">
            Created: {formatDate(order.created_at)}
          </div>
        </div>
      </div>

      {/* Preview Mode Alert Banner */}
      {previewCommit && (
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in slide-in-from-top duration-300">
          {/* Status info box (narrow/auto width, doesn't stretch long) */}
          <div className="inline-flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 w-fit">
            <div className="p-2 bg-yellow-500/10 text-yellow-400 rounded-xl shrink-0">
              <Info size={20} />
            </div>
            <div className="min-w-0">
              <span className="text-sm font-bold text-yellow-400 block">
                Preview Mode: Commit [{previewCommit.commit_hash}]
              </span>
              <span className="text-xs text-zinc-400">
                Viewing manifest state as of {formatDate(previewCommit.timestamp)} by {previewCommit.author}.
              </span>
            </div>
          </div>
          
          {/* Buttons on the side on their own */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setPreviewCommit(null)}
              className="px-4 py-2 bg-transparent border border-white/60 hover:bg-white text-white hover:text-zinc-950 font-semibold rounded-xl transition-all duration-200 text-xs"
            >
              Exit Preview
            </button>
            <button
              onClick={() => {
                if (hasWriteAccess) {
                  const logItem = auditLogs.find(l => l.id === previewCommit.id)
                  handleRevert(logItem || previewCommit, {
                    commit_hash: previewCommit.commit_hash,
                    state_snapshot: previewCommit.state_snapshot
                  })
                } else {
                  setShowAccessGateway(true)
                }
              }}
              className="px-4 py-2 bg-transparent border border-white hover:bg-white text-white hover:text-zinc-950 font-semibold rounded-xl transition-all duration-200 text-xs"
            >
              Revert to this State
            </button>
          </div>
        </div>
      )}

      {/* Transit Route Progress Visualizer */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mb-8 shadow-xl">
        <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-6 flex items-center gap-2">
          <Truck size={16} className="text-zinc-500" />
          Fulfillment Route Pipeline
        </h3>
               {displayOrder.source_store_is_central && displayOrder.destination_store_name ? (
          /* 3-Node Pipeline: Central Store -> Regional Store -> Customer */
          <div className="flex flex-col lg:flex-row items-center justify-between gap-3 w-full">
            {/* Node 1: Central Store */}
            <div className="bg-zinc-950/50 p-3.5 rounded-xl border border-zinc-800/80 flex items-start gap-2.5 flex-1 min-w-0 w-full">
              <div className="p-2 bg-zinc-900 rounded-lg text-amber-500 border border-amber-500/20 shadow-[0_0_8px_rgba(245,158,11,0.15)] shrink-0">
                <MapPin size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block">Supply Source</span>
                <span className="text-xs text-white font-bold block mt-0.5 truncate">
                  {displayOrder.source_store_name || "Lagos Store"}
                </span>
                <span className="text-[10px] text-zinc-400 block mt-0.5 truncate">
                  Central HQ
                </span>
              </div>
            </div>

            {/* Supply Line */}
            <div className="flex flex-col items-center justify-center px-1 shrink-0 lg:rotate-0 rotate-90 my-2 lg:my-0">
              <div className="text-[9px] font-bold text-amber-500/80 uppercase tracking-wider mb-1">Supply</div>
              <div className="text-amber-500 flex items-center justify-center w-full">
                <svg className="w-10 h-4" fill="none" viewBox="0 0 40 16" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h32M28 3l5 5-5 5" />
                </svg>
              </div>
            </div>

            {/* Node 2: Regional Store */}
            <div className="bg-zinc-950/50 p-3.5 rounded-xl border border-zinc-800/80 flex items-start gap-2.5 flex-1 min-w-0 w-full">
              <div className="p-2 bg-zinc-900 rounded-lg text-sky-400 border border-sky-500/20 shadow-[0_0_8px_rgba(14,165,233,0.15)] shrink-0">
                <MapPin size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block">Transfer Hub</span>
                <span className="text-xs text-white font-bold block mt-0.5 truncate">
                  {displayOrder.destination_store_name}
                </span>
                <span className="text-[10px] text-zinc-400 block mt-0.5 truncate">
                  Regional Inventory Store
                </span>
              </div>
            </div>

            {/* Transit Line */}
            <div className="flex flex-col items-center justify-center px-1 shrink-0 lg:rotate-0 rotate-90 my-2 lg:my-0">
              <div className="text-[9px] font-bold text-emerald-500/80 uppercase tracking-wider mb-1">Transit</div>
              <div className="text-emerald-500 flex items-center justify-center w-full">
                <svg className="w-10 h-4" fill="none" viewBox="0 0 40 16" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h32M28 3l5 5-5 5" />
                </svg>
              </div>
            </div>

            {/* Node 3: Customer Destination */}
            <div className="bg-zinc-950/50 p-3.5 rounded-xl border border-zinc-800/80 flex items-start gap-2.5 flex-1 min-w-0 w-full">
              <div className="p-2 bg-white/10 text-white shadow-[0_0_12px_rgba(255,255,255,0.2)] border border-white/20 rounded-lg shrink-0">
                <MapPin size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block">Destination Address</span>
                <span className="text-xs text-white font-bold block mt-0.5 truncate" title={displayOrder.customer_address}>
                  {displayOrder.customer_address || "No Address Registry"}
                </span>
                <span className="text-[10px] text-zinc-400 block mt-0.5 truncate">
                  {displayOrder.customer_state ? `${displayOrder.customer_state} State, Nigeria` : "Customer Direct"}
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* 2-Node Pipeline: Regional Store -> Customer */
          <div className="flex flex-col lg:flex-row items-center justify-between gap-3 w-full">
            {/* Departure Port */}
            <div className="bg-zinc-950/50 p-3.5 rounded-xl border border-zinc-800/80 flex items-start gap-2.5 flex-1 min-w-0 w-full">
              <div className="p-2 bg-zinc-900 rounded-lg text-zinc-400 border border-zinc-700/30 shrink-0">
                <MapPin size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block">Departure Port (Source)</span>
                <span className="text-xs text-white font-bold block mt-0.5 truncate">
                  {displayOrder.source_store_name || "Agege Warehouse"}
                </span>
                <span className="text-[10px] text-zinc-400 block mt-0.5 truncate">
                  {displayOrder.source_store_name ? "Regional Inventory Store" : "Agege, Lagos State"}
                </span>
              </div>
            </div>

            {/* Transit line */}
            <div className="flex flex-col items-center justify-center px-1 shrink-0 lg:rotate-0 rotate-90 my-2 lg:my-0">
              <div className="text-[9px] font-bold text-emerald-500/80 uppercase tracking-wider mb-1">Transit</div>
              <div className="text-emerald-500 flex items-center justify-center w-full">
                <svg className="w-10 h-4" fill="none" viewBox="0 0 40 16" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h32M28 3l5 5-5 5" />
                </svg>
              </div>
            </div>

            {/* Destination Address */}
            <div className="bg-zinc-950/50 p-3.5 rounded-xl border border-zinc-800/80 flex items-start gap-2.5 flex-1 min-w-0 w-full">
              <div className="p-2 bg-white/10 text-white shadow-[0_0_12px_rgba(255,255,255,0.2)] border border-white/20 rounded-lg shrink-0">
                <MapPin size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block">Destination Address</span>
                <span className="text-xs text-white font-bold block mt-0.5 truncate" title={displayOrder.destination_store_name || displayOrder.customer_address || "No Address Registry"}>
                  {displayOrder.destination_store_name || displayOrder.customer_address || "No Address Registry"}
                </span>
                <span className="text-[10px] text-zinc-400 block mt-0.5 truncate">
                  {displayOrder.destination_store_name 
                    ? (displayOrder.destination_store_address || (displayOrder.destination_store_city ? `${displayOrder.destination_store_city}, ${displayOrder.destination_store_state || ''}` : `${displayOrder.destination_store_state || ''} State, Nigeria`))
                    : (displayOrder.customer_state ? `${displayOrder.customer_state} State, Nigeria` : "Customer Direct")}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Details Ledger and Audit log section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left Column (Main Information) */}
        <div className="lg:col-span-2 space-y-8">

          {/* Order Details Manifest Card */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-6 flex items-center gap-2">
              <FileText size={16} className="text-zinc-500" />
              Manifest Specifications
            </h3>

            {isEditing ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {order.reference_cards && order.reference_cards.length > 0 ? (
                  <div className="md:col-span-2 bg-zinc-950/20 border border-zinc-800/80 rounded-xl p-3.5 text-xs text-zinc-400">
                    <span className="font-bold text-zinc-350 block mb-1">Multi-Invoice Order Mode</span>
                    Invoice, delivery, and brand info are managed on reference cards in the ledger section below.
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-455 mb-1">Invoice No</label>
                      <input
                        type="text"
                        value={editInvoice}
                        onChange={(e) => setEditInvoice(e.target.value)}
                        className="w-full px-4 py-2 bg-zinc-950/60 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:border-zinc-700 transition-colors text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-450 mb-1">Delivery No</label>
                      <input
                        type="text"
                        value={editWaybill}
                        onChange={(e) => setEditWaybill(e.target.value)}
                        className="w-full px-4 py-2 bg-zinc-950/60 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:border-zinc-700 transition-colors text-sm"
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-xs font-semibold text-zinc-450 mb-1">Driver Name</label>
                  <input
                    type="text"
                    value={editDriver}
                    onChange={(e) => setEditDriver(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-950/60 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:border-zinc-700 transition-colors text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-455 mb-1">Vehicle Registration</label>
                  <input
                    type="text"
                    value={editVehicle}
                    onChange={(e) => setEditVehicle(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-950/60 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:border-zinc-700 transition-colors text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-450 mb-1">Dispatch Departure *</label>
                  <input
                    type="datetime-local"
                    value={editDispatchTime}
                    onChange={(e) => {
                      const val = e.target.value
                      setEditDispatchTime(val)
                      if (val) {
                        const d = new Date(val)
                        if (!isNaN(d.getTime())) {
                          const twoDaysLater = new Date(d.getTime() + 48 * 60 * 60 * 1000)
                          const offset = twoDaysLater.getTimezoneOffset()
                          const localDate = new Date(twoDaysLater.getTime() - offset * 60 * 1000)
                          setEditExpectedDelivery(localDate.toISOString().substring(0, 16))
                        }
                      }
                    }}
                    className="w-full px-4 py-2 bg-zinc-950/60 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:border-zinc-700 transition-colors text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-455 mb-1">Expected Arrival *</label>
                  <input
                    type="datetime-local"
                    value={editExpectedDelivery}
                    onChange={(e) => setEditExpectedDelivery(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-950/60 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:border-zinc-700 transition-colors text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-450 mb-1">Actual Delivery Time (Optional)</label>
                  <input
                    type="datetime-local"
                    value={editActualDelivery}
                    onChange={(e) => setEditActualDelivery(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-950/60 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:border-zinc-700 transition-colors text-sm"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-455 mb-1">Transit Manifest Notes</label>
                  <textarea
                    rows="3"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-950/60 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:border-zinc-700 transition-colors text-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                {displayOrder.reference_cards && displayOrder.reference_cards.length > 0 ? (
                  <div className="col-span-2 md:col-span-3">
                    <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider block mb-2">Order Reference Cards</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {displayOrder.reference_cards.map((card, cardIdx) => (
                        <div key={card.id || cardIdx} className="bg-zinc-950/40 border border-zinc-800/80 rounded-xl p-3 flex flex-col justify-between">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Ref Card #{cardIdx + 1}</span>
                            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                              card.brand?.toUpperCase() === 'DSLP'
                                ? 'bg-purple-500/25 text-purple-400 border border-purple-500/35'
                                : 'bg-sky-500/25 text-sky-400 border border-sky-500/35'
                            }`}>
                              {card.brand}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-[10px] text-zinc-550 block">Invoice No</span>
                              <span className="font-mono text-zinc-200 font-semibold">{card.invoice_number}</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-zinc-550 block">Delivery No</span>
                              <span className="font-mono text-zinc-200 font-semibold">{card.waybill_number}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <span className="text-xs text-zinc-300 font-medium block">Invoice No</span>
                      <span className={`text-sm font-mono block mt-1 ${isFieldDifferent('invoice_number', displayOrder.invoice_number) ? 'text-yellow-500 font-bold' : 'text-white font-semibold'}`}>
                        {displayOrder.invoice_number || "N/A"}
                      </span>
                      {getFieldDiffMarker('invoice_number', displayOrder.invoice_number)}
                    </div>
                    <div>
                      <span className="text-xs text-zinc-300 font-medium block">Delivery No</span>
                      <span className={`text-sm font-mono block mt-1 ${isFieldDifferent('waybill_number', displayOrder.waybill_number) ? 'text-yellow-500 font-bold' : 'text-white font-semibold'}`}>
                        {displayOrder.waybill_number || "N/A"}
                      </span>
                      {getFieldDiffMarker('waybill_number', displayOrder.waybill_number)}
                    </div>
                  </>
                )}
                <div>
                  <span className="text-xs text-zinc-300 font-medium block">Driver Name</span>
                  <span className={`text-sm block mt-1 ${isFieldDifferent('driver_name', displayOrder.driver_name) ? 'text-yellow-500 font-bold' : 'text-white font-semibold'}`}>
                    {displayOrder.driver_name || "N/A"}
                  </span>
                  {getFieldDiffMarker('driver_name', displayOrder.driver_name)}
                </div>
                <div>
                  <span className="text-xs text-zinc-300 font-medium block">Vehicle Registration</span>
                  <span className={`text-sm font-mono block mt-1 ${isFieldDifferent('vehicle_number', displayOrder.vehicle_number) ? 'text-yellow-500 font-bold' : 'text-white font-semibold'}`}>
                    {displayOrder.vehicle_number || "N/A"}
                  </span>
                  {getFieldDiffMarker('vehicle_number', displayOrder.vehicle_number)}
                </div>
                <div>
                  <span className="text-xs text-zinc-300 font-medium block">Dispatch Departure</span>
                  <span className={`text-sm block mt-1 ${isFieldDifferent('dispatch_time', displayOrder.dispatch_time) ? 'text-yellow-500 font-bold' : 'text-white font-semibold'}`}>
                    {formatDate(displayOrder.dispatch_time)}
                  </span>
                  {getFieldDiffMarker('dispatch_time', displayOrder.dispatch_time)}
                </div>
                <div>
                  <span className="text-xs text-zinc-300 font-medium block">Expected Arrival</span>
                  <span className={`text-sm block mt-1 ${isFieldDifferent('expected_delivery_time', displayOrder.expected_delivery_time) ? 'text-yellow-500 font-bold' : 'text-white font-semibold'}`}>
                    {formatDate(displayOrder.expected_delivery_time)}
                  </span>
                  {getFieldDiffMarker('expected_delivery_time', displayOrder.expected_delivery_time)}
                </div>
                {displayOrder.actual_delivery_time && (
                  <div>
                    <span className="text-xs text-zinc-300 font-medium block">Actual Delivery Time</span>
                    <span className={`text-sm block mt-1 ${isFieldDifferent('actual_delivery_time', displayOrder.actual_delivery_time) ? 'text-yellow-500 font-bold' : 'text-green-400 font-semibold'}`}>
                      {formatDate(displayOrder.actual_delivery_time)}
                    </span>
                    {getFieldDiffMarker('actual_delivery_time', displayOrder.actual_delivery_time)}
                  </div>
                )}
                {displayOrder.dispatch_time && displayOrder.actual_delivery_time && (
                  <div>
                    <span className="text-xs text-zinc-300 font-medium block">Delivery Timeframe</span>
                    <span className="text-sm text-white block mt-1 font-semibold">
                      {Math.round((new Date(displayOrder.actual_delivery_time.endsWith('Z') || displayOrder.actual_delivery_time.includes('+') ? displayOrder.actual_delivery_time : displayOrder.actual_delivery_time + 'Z') - new Date(displayOrder.dispatch_time.endsWith('Z') || displayOrder.dispatch_time.includes('+') ? displayOrder.dispatch_time : displayOrder.dispatch_time + 'Z')) / (1000 * 60 * 60))} hours
                    </span>
                  </div>
                )}
              </div>
            )}

            {!isEditing && displayOrder.notes && (
              <div className="mt-6 pt-6 border-t border-zinc-800">
                <span className="text-xs text-zinc-300 font-medium block mb-2">Transit Manifest Notes</span>
                <div className={`bg-zinc-950/40 border rounded-xl p-3 text-xs leading-relaxed font-sans ${isFieldDifferent('notes', displayOrder.notes) ? 'text-yellow-500 font-semibold border-yellow-500/20' : 'text-zinc-300 border-zinc-800/60'}`}>
                  {displayOrder.notes}
                </div>
                {getFieldDiffMarker('notes', displayOrder.notes)}
              </div>
            )}
          </div>

          {/* Product Ledger Table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                <DollarSign size={16} className="text-zinc-500" />
                Consignment Ledger
              </h3>
              {isEditing && !order.reference_cards?.length && (
                <button
                  type="button"
                  onClick={handleAddLineItem}
                  className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-xs font-bold rounded-lg border border-zinc-800 transition-colors"
                >
                  <Plus size={12} /> Add Product Item
                </button>
              )}
            </div>

            {isEditing ? (
              order.reference_cards && order.reference_cards.length > 0 ? (
                <div className="space-y-6">
                  {editReferenceCards.map((card, cardIdx) => (
                    <div key={card.id || cardIdx} className="bg-zinc-950/20 border border-zinc-800/80 rounded-xl p-4 space-y-4">
                      <div className="flex justify-between items-center pb-2 border-b border-zinc-800/60">
                        <span className="text-xs font-bold text-zinc-300">Reference Card #{cardIdx + 1}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveReferenceCard(card.id)}
                          disabled={editReferenceCards.length === 1}
                          className="flex items-center gap-1 px-2 py-1 text-red-400 hover:text-red-300 disabled:opacity-30 disabled:cursor-not-allowed text-xs transition-colors"
                        >
                          <Trash2 size={12} /> Remove Card
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] font-semibold text-zinc-500 mb-1">Invoice No</label>
                          <input
                            type="text"
                            placeholder="e.g. DSL/SA/..."
                            required
                            value={card.invoice_number}
                            onChange={(e) => handleReferenceCardChange(card.id, 'invoice_number', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 transition-colors text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-zinc-500 mb-1">Delivery No</label>
                          <input
                            type="text"
                            placeholder="e.g. DSL/DLN/..."
                            required
                            value={card.waybill_number}
                            onChange={(e) => handleReferenceCardChange(card.id, 'waybill_number', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 transition-colors text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-zinc-500 mb-1">Brand Mapping</label>
                          <select
                            value={card.brand}
                            onChange={(e) => handleReferenceCardChange(card.id, 'brand', e.target.value)}
                            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:border-zinc-700 transition-colors text-sm"
                          >
                            <option value="DSL">DSL</option>
                            <option value="DSLP">DSLP</option>
                          </select>
                        </div>
                      </div>

                      {/* Products list for this card */}
                      <div className="space-y-3.5 pt-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-wider">Line Items</span>
                          <button
                            type="button"
                            onClick={() => handleCardAddLineItem(card.id)}
                            className="flex items-center gap-1 px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-[10px] font-bold rounded border border-zinc-800 transition-colors"
                          >
                            <Plus size={10} /> Add Product
                          </button>
                        </div>

                        {card.line_items.map((item, itemIdx) => (
                          <div key={itemIdx} className="flex flex-col md:flex-row gap-3 items-end md:items-center bg-zinc-900/60 p-2.5 rounded-lg border border-zinc-800">
                            <div className="flex-1 w-full relative product-search-container">
                              <input
                                type="text"
                                placeholder="Type product name..."
                                required
                                value={item.searchQuery || ''}
                                onFocus={() => {
                                  setActiveCardProductSearch({ cardId: card.id, itemIdx })
                                }}
                                onChange={(e) => handleCardLineItemChange(card.id, itemIdx, 'searchQuery', e.target.value)}
                                className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 transition-colors text-sm"
                              />

                              {activeCardProductSearch &&
                                activeCardProductSearch.cardId === card.id &&
                                activeCardProductSearch.itemIdx === itemIdx && (
                                  <ProductSearchDropdown
                                    query={item.searchQuery || ''}
                                    products={getFilteredProductsForCard(card.brand)}
                                    onSelect={(product) => {
                                      handleCardLineItemChange(card.id, itemIdx, 'product_id', product.id.toString())
                                      handleCardLineItemChange(card.id, itemIdx, 'searchQuery', product.name)
                                      setActiveCardProductSearch(null)
                                    }}
                                  />
                                )}
                            </div>

                            <div className="w-full md:w-24">
                              <input
                                type="number"
                                required
                                min="1"
                                step="any"
                                placeholder="Qty"
                                value={item.quantity}
                                onChange={(e) => handleCardLineItemChange(card.id, itemIdx, 'quantity', e.target.value)}
                                className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:border-zinc-705 transition-colors text-sm"
                              />
                            </div>

                            <div className="w-full md:w-28">
                              <select
                                value={item.unit}
                                onChange={(e) => handleCardLineItemChange(card.id, itemIdx, 'unit', e.target.value)}
                                className="w-full px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:border-zinc-705 transition-colors text-sm"
                              >
                                <option value="Pieces">Pieces (Pcs)</option>
                                <option value="Carton">Carton</option>
                              </select>
                            </div>

                            <div className="text-right px-2 text-xs text-zinc-500 font-mono hidden md:block">
                              Rate: {formatCurrency(getProductRate(item.product_id))}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleCardRemoveLineItem(card.id, itemIdx)}
                              disabled={card.line_items.length === 1}
                              className="p-1.5 hover:bg-red-500/10 hover:text-red-400 text-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed rounded transition-colors flex-shrink-0"
                              title="Remove Item"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={handleAddReferenceCard}
                    className="w-full py-2 bg-zinc-900 hover:bg-zinc-850 text-zinc-450 hover:text-zinc-200 text-xs font-bold rounded-xl border border-dashed border-zinc-800 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Plus size={14} /> Add Another Reference Card
                  </button>

                  {/* Logistics Cost Edit Section */}
                  <div className="mt-6 pt-6 border-t border-zinc-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                        <span className="text-zinc-550 font-bold">$</span> Logistics Costs Edit
                      </h4>
                      <button
                        type="button"
                        onClick={() => {
                          setEditOtherCosts([
                            ...editOtherCosts,
                            { id: Math.random().toString(36).substr(2, 9), name: '', amount: '0' }
                          ])
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white text-xs font-semibold rounded-lg border border-zinc-700 transition-colors"
                      >
                        <Plus size={12} /> Add Cost
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-semibold text-zinc-500 mb-1">Fuel Cost (₦)</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={editFuelCost}
                          onChange={(e) => setEditFuelCost(e.target.value)}
                          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-zinc-750 transition-colors text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-zinc-500 mb-1">Waybill Cost (₦)</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={editWaybillCost}
                          onChange={(e) => setEditWaybillCost(e.target.value)}
                          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-zinc-750 transition-colors text-sm"
                        />
                      </div>
                    </div>

                    {editOtherCosts.length > 0 && (
                      <div className="space-y-2 pt-2">
                        {editOtherCosts.map((cost, costIdx) => (
                          <div key={cost.id} className="flex gap-2 items-center bg-zinc-950/20 p-2.5 rounded-xl border border-zinc-800">
                            <input
                              type="text"
                              placeholder="Cost Name (e.g. Loading Fee)"
                              required
                              value={cost.name}
                              onChange={(e) => {
                                const updated = [...editOtherCosts]
                                updated[costIdx].name = e.target.value
                                setEditOtherCosts(updated)
                              }}
                              className="flex-1 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-650 focus:outline-none focus:border-zinc-700 transition-colors text-sm"
                            />
                            <input
                              type="number"
                              placeholder="Amount"
                              min="0"
                              step="any"
                              required
                              value={cost.amount}
                              onChange={(e) => {
                                const updated = [...editOtherCosts]
                                updated[costIdx].amount = e.target.value
                                setEditOtherCosts(updated)
                              }}
                              className="w-28 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:border-zinc-700 transition-colors text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => setEditOtherCosts(editOtherCosts.filter(c => c.id !== cost.id))}
                              className="p-1.5 hover:bg-red-500/10 hover:text-red-400 text-zinc-555 rounded transition-colors flex-shrink-0"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {editLineItems.map((item, idx) => (
                    <div key={idx} className="flex flex-col md:flex-row gap-3 items-end md:items-center bg-zinc-950/30 p-3 rounded-xl border border-zinc-800">
                      <div className="flex-1 w-full relative product-search-container">
                        <label className="block text-[10px] font-semibold text-zinc-500 mb-1 md:hidden">Product</label>
                        <input
                          type="text"
                          placeholder="Type product name..."
                          required
                          value={item.searchQuery || ''}
                          onFocus={() => {
                            setActiveProductSearchIndex(idx)
                          }}
                          onChange={(e) => {
                            const val = e.target.value
                            const updated = [...editLineItems]
                            updated[idx].searchQuery = val

                            const exactProd = products.find(p => p.name.toLowerCase() === val.trim().toLowerCase())
                            if (exactProd) {
                              updated[idx].product_id = exactProd.id.toString()
                            } else {
                              updated[idx].product_id = ''
                            }
                            setEditLineItems(updated)
                          }}
                          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 transition-colors text-sm"
                        />
                        
                        {activeProductSearchIndex === idx && (
                          <ProductSearchDropdown
                            query={item.searchQuery || ''}
                            products={products}
                            onSelect={(product) => {
                              const updated = [...editLineItems]
                              updated[idx].product_id = product.id.toString()
                              updated[idx].searchQuery = product.name
                              setEditLineItems(updated)
                              setActiveProductSearchIndex(null)
                            }}
                          />
                        )}
                      </div>

                      <div className="w-full md:w-28">
                        <label className="block text-[10px] font-semibold text-zinc-500 mb-1 md:hidden">Quantity</label>
                        <input
                          type="number"
                          required
                          min="1"
                          step="any"
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={(e) => {
                            const updated = [...editLineItems]
                            updated[idx].quantity = e.target.value
                            setEditLineItems(updated)
                          }}
                          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:border-zinc-700 transition-colors text-sm"
                        />
                      </div>

                      <div className="w-full md:w-32">
                        <label className="block text-[10px] font-semibold text-zinc-500 mb-1 md:hidden">Unit</label>
                        <select
                          value={item.unit}
                          onChange={(e) => {
                            const updated = [...editLineItems]
                            updated[idx].unit = e.target.value
                            setEditLineItems(updated)
                          }}
                          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:border-zinc-700 transition-colors text-sm"
                        >
                          <option value="Pieces">Pieces (Pcs)</option>
                          <option value="Carton">Carton</option>
                        </select>
                      </div>

                      <div className="text-right px-2 py-2 text-xs text-zinc-500 font-mono hidden md:block">
                        Rate: {formatCurrency(getProductRate(item.product_id))}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveLineItem(idx)}
                        disabled={editLineItems.length === 1}
                        className="p-2 hover:bg-red-500/10 hover:text-red-400 text-zinc-555 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors flex-shrink-0"
                        title="Remove Item"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}

                  {/* Logistics Cost Edit Section */}
                  <div className="mt-6 pt-6 border-t border-zinc-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                        <span className="text-zinc-550 font-bold">$</span> Logistics Costs Edit
                      </h4>
                      <button
                        type="button"
                        onClick={() => {
                          setEditOtherCosts([
                            ...editOtherCosts,
                            { id: Math.random().toString(36).substr(2, 9), name: '', amount: '0' }
                          ])
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white text-xs font-semibold rounded-lg border border-zinc-700 transition-colors"
                      >
                        <Plus size={12} /> Add Cost
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-semibold text-zinc-500 mb-1">Fuel Cost (₦)</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={editFuelCost}
                          onChange={(e) => setEditFuelCost(e.target.value)}
                          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-zinc-750 transition-colors text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-zinc-500 mb-1">Waybill Cost (₦)</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={editWaybillCost}
                          onChange={(e) => setEditWaybillCost(e.target.value)}
                          className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-zinc-750 transition-colors text-sm"
                        />
                      </div>
                    </div>

                    {editOtherCosts.length > 0 && (
                      <div className="space-y-2 pt-2">
                        {editOtherCosts.map((cost, costIdx) => (
                          <div key={cost.id} className="flex gap-2 items-center bg-zinc-950/20 p-2.5 rounded-xl border border-zinc-800">
                            <input
                              type="text"
                              placeholder="Cost Name (e.g. Loading Fee)"
                              required
                              value={cost.name}
                              onChange={(e) => {
                                const updated = [...editOtherCosts]
                                updated[costIdx].name = e.target.value
                                setEditOtherCosts(updated)
                              }}
                              className="flex-1 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-650 focus:outline-none focus:border-zinc-700 transition-colors text-sm"
                            />
                            <input
                              type="number"
                              placeholder="Amount"
                              min="0"
                              step="any"
                              required
                              value={cost.amount}
                              onChange={(e) => {
                                const updated = [...editOtherCosts]
                                updated[costIdx].amount = e.target.value
                                setEditOtherCosts(updated)
                              }}
                              className="w-28 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 focus:outline-none focus:border-zinc-700 transition-colors text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => setEditOtherCosts(editOtherCosts.filter(c => c.id !== cost.id))}
                              className="p-1.5 hover:bg-red-500/10 hover:text-red-400 text-zinc-555 rounded transition-colors flex-shrink-0"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            ) : displayOrder.reference_cards && displayOrder.reference_cards.length > 0 ? (
              <div className="space-y-6">
                {displayOrder.reference_cards.map((card, cardIdx) => (
                  <div key={card.id || cardIdx} className="border border-zinc-800/80 rounded-xl overflow-hidden bg-zinc-950/20">
                    <div className="px-4 py-2.5 bg-zinc-900 border-b border-zinc-800/80 flex items-center justify-between">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <span className="font-bold text-zinc-200">Ref Card #{cardIdx + 1}</span>
                        <span className="text-zinc-500">|</span>
                        <span className="text-zinc-400"><span className="text-zinc-500 font-medium">Invoice:</span> <span className="font-mono">{card.invoice_number}</span></span>
                        <span className="text-zinc-500">•</span>
                        <span className="text-zinc-400"><span className="text-zinc-500 font-medium">Delivery:</span> <span className="font-mono">{card.waybill_number}</span></span>
                      </div>
                      <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                        card.brand?.toUpperCase() === 'DSLP'
                          ? 'bg-purple-500/25 text-purple-400 border border-purple-500/35'
                          : 'bg-sky-500/25 text-sky-400 border border-sky-500/35'
                      }`}>
                        {card.brand}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-zinc-800 bg-zinc-950/30">
                            <th className="px-4 py-2 text-left text-xs font-semibold text-zinc-400">Product Specification</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-zinc-400">Unit Type</th>
                            <th className="px-4 py-2 text-center text-xs font-semibold text-zinc-400">Quantity</th>
                            <th className="px-4 py-2 text-center text-xs font-semibold text-zinc-400">Rate</th>
                            <th className="px-4 py-2 text-center text-xs font-semibold text-zinc-400">Line Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60">
                          {card.line_items.map((item, idx) => {
                            const isItemDiff = isLineItemDifferent(item)
                            return (
                              <tr key={idx} className="hover:bg-zinc-800/10 transition-colors">
                                <td className={`px-4 py-3 text-sm font-bold ${isItemDiff ? 'text-yellow-500' : 'text-white'}`}>
                                  <div className="flex items-center gap-2">
                                    <span>{item.product_name}</span>
                                    {item.product_brand && (
                                      <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                        item.product_brand.toUpperCase() === 'DSLP'
                                          ? 'bg-purple-500/25 text-purple-400 border border-purple-500/35'
                                          : 'bg-sky-500/25 text-sky-400 border border-sky-500/35'
                                      }`}>
                                        {item.product_brand}
                                      </span>
                                    )}
                                  </div>
                                  {getLineItemDiffMarker(item)}
                                </td>
                                <td className={`px-4 py-3 text-sm text-right capitalize ${isItemDiff ? 'text-yellow-500/90 font-medium' : 'text-zinc-400'}`}>
                                  {item.unit === 'Pieces' ? 'Pieces (Pcs)' : item.unit}
                                </td>
                                <td className={`px-4 py-3 text-sm text-center font-mono ${isItemDiff ? 'text-yellow-500 font-bold' : 'text-zinc-300'}`}>
                                  {item.quantity} {item.unit === 'Carton' && `(${item.quantity * getConversionFactor(item.product_name)} Pcs)`}
                                </td>
                                <td className="px-4 py-3 text-sm text-center text-zinc-400" style={{ fontFamily: '"Lora", Georgia, serif' }}>
                                  {formatCurrency(item.unit_price)}
                                </td>
                                <td className={`px-4 py-3 text-sm text-center font-semibold ${isItemDiff ? 'text-yellow-500' : 'text-white'}`} style={{ fontFamily: '"Lora", Georgia, serif' }}>
                                  {formatCurrency(item.total_price || (item.unit_price * item.quantity))}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-950/30">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-400">Product Specification</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-400">Unit Type</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-400">Quantity</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-400">Rate</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-400">Line Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {displayOrder.line_items.map((item, idx) => {
                      const isItemDiff = isLineItemDifferent(item)
                      return (
                        <tr key={idx} className="hover:bg-zinc-800/10 transition-colors">
                          <td className={`px-4 py-4 text-sm font-bold ${isItemDiff ? 'text-yellow-500' : 'text-white'}`}>
                            <div className="flex items-center gap-2">
                              <span>{item.product_name}</span>
                              {item.product_brand && (
                                <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                  item.product_brand.toUpperCase() === 'DSLP'
                                    ? 'bg-purple-500/25 text-purple-400 border border-purple-500/35'
                                    : 'bg-sky-500/25 text-sky-400 border border-sky-500/35'
                                }`}>
                                  {item.product_brand}
                                </span>
                              )}
                            </div>
                            {getLineItemDiffMarker(item)}
                          </td>
                          <td className={`px-4 py-4 text-sm text-right capitalize ${isItemDiff ? 'text-yellow-500/90 font-medium' : 'text-zinc-400'}`}>{item.unit === 'Pieces' ? 'Pieces (Pcs)' : item.unit}</td>
                          <td className={`px-4 py-4 text-sm text-center font-mono ${isItemDiff ? 'text-yellow-500 font-bold' : 'text-zinc-300'}`}>
                            {item.quantity} {item.unit === 'Carton' && `(${item.quantity * getConversionFactor(item.product_name)} Pcs)`}
                          </td>
                          <td className="px-4 py-4 text-sm text-center text-zinc-400" style={{ fontFamily: '"Lora", Georgia, serif' }}>{formatCurrency(item.unit_price)}</td>
                          <td className={`px-4 py-4 text-sm text-center font-semibold ${isItemDiff ? 'text-yellow-500' : 'text-white'}`} style={{ fontFamily: '"Lora", Georgia, serif' }}>{formatCurrency(item.total_price || (item.unit_price * item.quantity))}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Logistics Cost Breakdown Panel */}
            {!isEditing && (
              <div className="mt-6 p-4 rounded-xl bg-zinc-950/40 border border-zinc-800 space-y-3">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Logistics Expenses Breakdown</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  <div className="space-y-2">
                    <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                      <span className="text-zinc-400">Fuel Cost:</span>
                      <span className="font-mono text-zinc-200">{formatCurrency(displayOrder.fuel_cost || 0)}</span>
                    </div>
                    <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                      <span className="text-zinc-400">Waybill Cost:</span>
                      <span className="font-mono text-zinc-200">{formatCurrency(displayOrder.waybill_cost || 0)}</span>
                    </div>
                    {displayOrder.other_costs && displayOrder.other_costs.length > 0 && (
                      displayOrder.other_costs.map((c, idx) => (
                        <div key={idx} className="flex justify-between border-b border-zinc-900 pb-1.5">
                          <span className="text-zinc-400">{c.name || 'Custom Cost'}:</span>
                          <span className="font-mono text-zinc-200">{formatCurrency(c.amount || 0)}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                      <span className="text-zinc-400">Total Items Quantity:</span>
                      <span className="font-mono text-zinc-200">
                        {displayOrder.line_items?.reduce((acc, item) => acc + (parseFloat(item.quantity) || 0), 0) || 0} units
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-zinc-900 pb-1.5">
                      <span className="text-zinc-400">Average Expense / Unit:</span>
                      <span className="font-mono text-zinc-200">
                        {(() => {
                          const totalQty = displayOrder.line_items?.reduce((acc, item) => acc + (parseFloat(item.quantity) || 0), 0) || 0;
                          const totalAmt = displayOrder.total_amount || 0;
                          return formatCurrency(totalQty > 0 ? totalAmt / totalQty : 0);
                        })()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Total Section */}
            <div className="mt-6 pt-6 border-t border-zinc-800 flex justify-between items-center bg-zinc-950/40 p-4 rounded-xl border border-zinc-800">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                {isEditing ? 'Estimated Total Logistics Cost' : 'Total Logistics Cost'}
              </span>
              <span className="text-2xl font-extrabold text-green-400" style={{ fontFamily: '"Lora", Georgia, serif' }}>
                {isEditing ? (
                  (() => {
                    const fuel = parseFloat(editFuelCost) || 0;
                    const waybill = parseFloat(editWaybillCost) || 0;
                    const other = editOtherCosts.reduce((acc, c) => acc + (parseFloat(c.amount) || 0), 0);
                    return formatCurrency(fuel + waybill + other);
                  })()
                ) : (
                  formatCurrency(displayOrder.total_amount || 0)
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column (Sidebar Information) */}
        <div className="space-y-8">

          {/* Customer registry details */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-6 flex items-center gap-2">
              <User size={16} className="text-zinc-500" />
              Customer Registry
            </h3>

            <div className="space-y-4">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Company Name</span>
                <span className="text-sm font-bold block mt-0.5 text-white">{displayOrder.customer_name || order.customer_name}</span>
              </div>

              <div>
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Fulfillment State</span>
                <span className="text-sm text-zinc-300 block mt-0.5">{displayOrder.customer_state || order.customer_state || 'N/A'}</span>
              </div>

              <div>
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Contact Email</span>
                <span className="text-sm text-zinc-300 block mt-0.5 font-mono truncate">{order.customer?.email || 'N/A'}</span>
              </div>

              <div>
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider block">Direct Phone Line</span>
                <span className="text-sm text-zinc-300 block mt-0.5 font-mono">{formatPhoneNumber(order.customer?.contact_number)}</span>
              </div>

              <div className="pt-4 border-t border-zinc-800">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Registrar</span>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-cyan-950 flex items-center justify-center text-[10px] font-bold text-cyan-400 uppercase">
                    {order.created_by_name ? order.created_by_name.substring(0, 2) : "OP"}
                  </div>
                  <span className="text-xs text-zinc-400 font-semibold">{order.created_by_name || "System Operator"}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Audit Log Timeline (Git Commits History) */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-6 flex items-center gap-2">
              <Activity size={16} className="text-zinc-500" />
              Manifest Audit Trail
            </h3>
            <div className="custom-audit-scrollbar overflow-y-auto pl-6 pr-2" style={{ maxHeight: '340px' }}>
              <style>{`
                .custom-audit-scrollbar::-webkit-scrollbar {
                  width: 5px;
                }
                .custom-audit-scrollbar::-webkit-scrollbar-track {
                  background: transparent;
                }
                .custom-audit-scrollbar::-webkit-scrollbar-thumb {
                  background-color: rgba(255, 255, 255, 0.25);
                  border-radius: 99px;
                }
                .custom-audit-scrollbar::-webkit-scrollbar-thumb:hover {
                  background-color: rgba(255, 255, 255, 0.6);
                }
              `}</style>
              {auditLogs.length === 0 ? (
                <div className="flex items-center gap-2 text-zinc-500 bg-zinc-950/40 p-4 rounded-xl border border-zinc-800/80 text-xs">
                  <Info size={14} />
                  <span>No audit events registered.</span>
                </div>
              ) : (
                <div className="relative pl-4 border-l-2 border-zinc-800 space-y-6 py-2">
                  {auditLogs.map((log, idx) => {
                    let detailsObj = null
                    try {
                      detailsObj = typeof log.details === 'string' ? JSON.parse(log.details) : log.details
                    } catch (e) {
                      // fallback
                    }

                    const prevSnapshot = detailsObj?.state_snapshot ? getPreviousSnapshot(idx) : null
                    const diffs = detailsObj?.state_snapshot ? getSnapshotDiff(prevSnapshot, detailsObj.state_snapshot) : []

                    return (
                      <div key={idx} className="relative">
                        {/* timeline node dot */}
                        <span className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-cyan-500 ring-4 ring-zinc-900" />

                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-bold text-white capitalize leading-normal">
                              {detailsObj?.action || log.action.replace(/_/g, ' ')}
                            </div>
                            {detailsObj?.commit_hash && (
                              <span className="text-[10px] bg-zinc-800 border border-zinc-700/60 px-1.5 py-0.5 rounded font-mono text-zinc-400 shrink-0">
                                {detailsObj.commit_hash}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-zinc-550 font-mono">
                            {formatDate(log.timestamp)}
                          </div>
                          <div className="text-[11px] text-zinc-400 mt-1 leading-normal">
                            By <span className="text-zinc-300 font-semibold">{log.user_name || "Operator"}</span>
                          </div>

                          {/* Visual Commit Diff Changes */}
                          {diffs.length > 0 && (
                            <div className="mt-2 pl-2 border-l border-zinc-800 space-y-1">
                              {diffs.map((diff, diffIdx) => (
                                <div key={diffIdx} className="text-[10px] flex items-start gap-1.5 text-zinc-400 leading-relaxed">
                                  <span className={`w-1 h-1 rounded-full mt-1.5 shrink-0 ${
                                    diff.type === 'add' ? 'bg-green-500' :
                                    diff.type === 'delete' ? 'bg-red-500' :
                                    diff.type === 'info' ? 'bg-zinc-500' :
                                    'bg-cyan-500'
                                  }`} />
                                  <span>{diff.text}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {detailsObj?.state_snapshot && (
                            <div className="mt-3 flex items-center gap-2.5">
                              <button
                                onClick={() => handlePreviewCommit(log, detailsObj)}
                                className={`text-[10px] font-bold flex items-center gap-1 shrink-0 transition-colors ${
                                  previewCommit?.id === log.id
                                    ? 'text-yellow-400 hover:text-yellow-355 underline'
                                    : 'text-zinc-400 hover:text-zinc-300 hover:underline'
                                }`}
                              >
                                👁 {previewCommit?.id === log.id ? 'Viewing State' : 'Preview State'}
                              </button>
                              <span className="text-[10px] text-zinc-700 font-bold">|</span>
                              <button
                                onClick={() => handleRevert(log, detailsObj)}
                                className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1 shrink-0 transition-colors"
                              >
                                ↺ Revert
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Save Commit Bar */}
      {isEditing && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/90 backdrop-blur-md border-t border-zinc-800 py-4 px-8 flex flex-col md:flex-row items-center justify-between gap-4 shadow-[0_-8px_30px_rgba(0,0,0,0.6)] animate-in slide-in-from-bottom duration-300">
          <div className="flex-1 w-full md:max-w-xl">
            <input
              type="text"
              placeholder="Git commit message (e.g. Adjusted Wyldox quantity to 24)..."
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              className="w-full px-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors text-sm font-semibold"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCancelEdit}
              className="px-4 py-2 border border-zinc-800 hover:border-red-500 hover:bg-red-500 text-zinc-300 hover:text-white font-medium rounded-xl transition-all duration-200 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              className="px-5 py-2 border border-zinc-750 hover:border-white bg-transparent hover:bg-white text-zinc-300 hover:text-zinc-900 font-semibold rounded-xl transition-all duration-200 text-sm"
            >
              Save Commit
            </button>
          </div>
        </div>
      )}
    </div>

      {/* Access Gateway Modal for viewers */}
      <AccessGatewayModal
        isOpen={showAccessGateway}
        onClose={() => setShowAccessGateway(false)}
      />

      {/* Download Acknowledgment Address Selection Modal */}
      <DownloadAcknowledgmentModal
        isOpen={isAcknowledgmentModalOpen}
        onClose={() => setIsAcknowledgmentModalOpen(false)}
        order={displayOrder}
      />
    </>
  )
}

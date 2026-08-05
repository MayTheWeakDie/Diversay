import React, { useState, useEffect, useRef } from 'react'
import { X, Plus, Trash2, Edit2, Calendar, User, UserPlus, Package, FileText, Truck, AlertCircle, RefreshCw, CheckCircle } from 'lucide-react'
import api, { getWithCache, invalidateCache } from '../services/api'
import { useNavigate } from 'react-router-dom'
import AddCustomerModal from './AddCustomerModal'

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

// Dropdown component for fuzzy product search
const ProductSearchDropdown = ({ query, products, onSelect }) => {
  // Filter products matching query case-insensitively
  const filtered = products
    .filter(p => p.name.toLowerCase().includes(query.toLowerCase()))

  if (filtered.length === 0) return null

  return (
    <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-950/90 border border-zinc-800/80 rounded-xl shadow-2xl z-50 max-h-[132px] overflow-y-auto custom-product-dropdown-scroll backdrop-blur-xl">
      <ul className="divide-y divide-zinc-900/50">
        {filtered.map((product) => (
          <li key={product.id}>
            <button
              type="button"
              onClick={() => onSelect(product)}
              className="w-full px-4 py-2.5 text-left text-sm text-zinc-300 hover:text-white hover:bg-zinc-800/60 transition-colors flex justify-between items-center"
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

const searchCustomersLocally = (query, customersList) => {
  if (!query) return []
  const queryLower = query.toLowerCase().trim()
  const queryWords = queryLower.split(/\s+/).filter(Boolean)
  
  return customersList
    .map(c => {
      const nameLower = c.name.toLowerCase()
      let score = 0
      
      // 1. Exact match gets highest score
      if (nameLower === queryLower) {
        score += 10
      }
      
      // 2. Starts with query gets high score
      else if (nameLower.startsWith(queryLower)) {
        score += 5
      }
      
      // 3. Contains full query gets medium score
      else if (nameLower.includes(queryLower)) {
        score += 3
      }
      
      // 4. Any query word matches any customer name word
      if (queryWords.length > 0 && queryWords.every(qw => nameLower.includes(qw))) {
        score += 1.5
      }
      
      return { customer: c, score }
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.customer.name.localeCompare(b.customer.name))
    .map(item => item.customer)
}

export default function CreateOrderModal({ isOpen, onClose }) {
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [customers, setCustomers] = useState([])
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [confirmAdd, setConfirmAdd] = useState(null)
  const [centralStoreId, setCentralStoreId] = useState('')
  const [storeInventories, setStoreInventories] = useState({})
  const [drivers, setDrivers] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [actionItem, setActionItem] = useState(null)
  const [actionInputVal, setActionInputVal] = useState('')
  const [quickCustomerModal, setQuickCustomerModal] = useState({ isOpen: false, orderId: null, initialName: '' })
  const [customerToast, setCustomerToast] = useState('')

  const handleOpenQuickCustomerModal = (orderId, initialName = '') => {
    setQuickCustomerModal({
      isOpen: true,
      orderId,
      initialName
    })
  }

  const handleCustomerCreated = (newCustomer) => {
    setCustomers(prev => {
      const exists = prev.some(c => c.id === newCustomer.id || c.name.toLowerCase() === newCustomer.name.toLowerCase())
      if (exists) return prev
      return [newCustomer, ...prev]
    })

    const targetOrderId = quickCustomerModal.orderId
    if (targetOrderId) {
      setBatchOrders(prev => prev.map(o => {
        if (o.id === targetOrderId) {
          return {
            ...o,
            customerId: newCustomer.id ? newCustomer.id.toString() : '',
            customerSearchQuery: newCustomer.name,
            customerState: newCustomer.state || '',
            customerCity: newCustomer.city || '',
            showCustomerDropdown: false,
            matchingCustomers: []
          }
        }
        return o
      }))
    }

    setCustomerToast(`Customer "${newCustomer.name}" added and selected!`)
    setTimeout(() => {
      setCustomerToast('')
    }, 4000)

    window.dispatchEvent(new Event('customer-created'))
  }

  const getDepartureStoreId = (order) => {
    if (order.pipelineType === '2-node') {
      return order.regionalStoreId
    } else if (order.pipelineType === '3-node') {
      return centralStoreId
    }
    return ''
  }

  const getFilteredProductsForCard = (order, brand) => {
    const departureStoreId = getDepartureStoreId(order)
    let filtered = products
    if (departureStoreId) {
      const inventory = storeInventories[departureStoreId]
      if (inventory) {
        const storeProductIds = new Set(inventory.map(item => item.product_id))
        filtered = products.filter(p => storeProductIds.has(p.id))
      }
    }
    if (brand) {
      filtered = filtered.filter(p => (p.brand || '').toUpperCase() === brand.toUpperCase())
    }
    return filtered
  }

  const getAvailableStock = (order, productId) => {
    const storeId = getDepartureStoreId(order)
    if (!storeId || !productId) return null
    const inventory = storeInventories[storeId]
    if (!inventory) return null
    const invItem = inventory.find(i => i.product_id === parseInt(productId))
    return invItem ? invItem.stock : 0
  }

  const fetchStoreInventory = async (storeId, force = false) => {
    if (!storeId) return
    if (!force && storeInventories[storeId]) return
    try {
      if (force) {
        invalidateCache(`/stores/${storeId}/inventory`)
      }
      const res = await getWithCache(`/stores/${storeId}/inventory`)
      setStoreInventories(prev => ({
        ...prev,
        [storeId]: res.data || []
      }))
    } catch (err) {
      console.error(`Failed to fetch inventory for store ${storeId}:`, err)
    }
  }

  const getLocalDatetimeString = (date = new Date()) => {
    const offset = date.getTimezoneOffset()
    const localDate = new Date(date.getTime() - offset * 60 * 1000)
    return localDate.toISOString().substring(0, 16)
  }

  const createInitialOrderObject = (defaultSourceId = '') => {
    const now = new Date()
    const twoDaysLater = new Date(now.getTime() + 48 * 60 * 60 * 1000)
    return {
      id: Math.random().toString(36).substr(2, 9),
      customerId: '',
      customerSearchQuery: '',
      customerState: '',
      customerCity: '',
      matchingCustomers: [],
      showCustomerDropdown: false,
      showDriverDropdown: false,
      showVehicleDropdown: false,
      pipelineType: '2-node', // '2-node' (direct regional to customer) or '3-node' (central to regional to customer)
      regionalStoreId: '', // selected regional store ID
      sourceStoreId: defaultSourceId,
      destinationStoreId: '',
      dispatchTime: getLocalDatetimeString(now),
      expectedDeliveryTime: getLocalDatetimeString(twoDaysLater),
      deliveryTimeError: '',
      driverName: '',
      vehicleNumber: '',
      fuelCost: '0',
      waybillCost: '0',
      otherCosts: [],
      notes: '',
      waybills: [
        { id: Math.random().toString(36).substr(2, 9), brand: 'DSL', waybillNumber: '', invoiceNumber: '', lineItems: [
          { product_id: '', quantity: 1, unit: 'Pieces', searchQuery: '' }
        ] }
      ]
    }
  }

  const addWaybill = (orderId) => {
    setBatchOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        const defaultBrand = o.waybills.some(w => w.brand === 'DSL') ? 'DSLP' : 'DSL'
        return {
          ...o,
          waybills: [
            ...o.waybills,
            { id: Math.random().toString(36).substr(2, 9), brand: defaultBrand, waybillNumber: '', invoiceNumber: '', lineItems: [
              { product_id: '', quantity: 1, unit: 'Pieces', searchQuery: '' }
            ] }
          ]
        }
      }
      return o
    }))
  }

  const removeWaybill = (orderId, waybillId) => {
    setBatchOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          waybills: o.waybills.filter(w => w.id !== waybillId)
        }
      }
      return o
    }))
  }

  const updateWaybill = (orderId, waybillId, field, value) => {
    setBatchOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          waybills: o.waybills.map(w => w.id === waybillId ? { ...w, [field]: value } : w)
        }
      }
      return o
    }))
  }

  // Batch Form State
  const [batchOrders, setBatchOrders] = useState([createInitialOrderObject()])
  
  // Track active product search: { orderId, itemIdx }
  const [activeProductSearch, setActiveProductSearch] = useState(null)

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.product-search-container')) {
        setActiveProductSearch(null)
      }
      if (!e.target.closest('.customer-search-container')) {
        setBatchOrders(prev => prev.map(o => ({ ...o, showCustomerDropdown: false })))
      }
      if (!e.target.closest('.driver-search-container')) {
        setBatchOrders(prev => prev.map(o => ({ ...o, showDriverDropdown: false })))
      }
      if (!e.target.closest('.vehicle-search-container')) {
        setBatchOrders(prev => prev.map(o => ({ ...o, showVehicleDropdown: false })))
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [])

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      setStoreInventories({})
      fetchFormData()
      setShowSuccess(false)
    }
  }, [isOpen])

  const handleSuccessClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      setShowSuccess(false)
      setIsClosing(false)
      const centralStore = stores.find(s => s.is_central)
      const centralStoreIdStr = centralStore ? centralStore.id.toString() : ''
      setBatchOrders([createInitialOrderObject(centralStoreIdStr)])
      setStoreInventories({})
      onClose()
      window.dispatchEvent(new Event('order-created'))
      navigate('/dashboard')
    }, 500)
  }

  useEffect(() => {
    let timer
    if (showSuccess) {
      timer = setTimeout(() => {
        handleSuccessClose()
      }, 3000)
    }
    return () => clearTimeout(timer)
  }, [showSuccess])

  // Automatically fetch store inventories for active departure stores
  useEffect(() => {
    if (!isOpen) return
    const departureStoreIds = new Set()
    batchOrders.forEach(order => {
      const storeId = getDepartureStoreId(order)
      if (storeId) {
        departureStoreIds.add(storeId.toString())
      }
    })
    
    departureStoreIds.forEach(storeId => {
      fetchStoreInventory(storeId)
    })
  }, [batchOrders, centralStoreId, isOpen])

  const fetchFormData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [productsRes, customersRes, storesRes, driversRes, vehiclesRes] = await Promise.all([
        getWithCache('/products', { params: { limit: 1000 } }),
        getWithCache('/customers', { params: { limit: 1000 } }),
        getWithCache('/stores'),
        getWithCache('/drivers'),
        getWithCache('/vehicles')
      ])
      const fetchedProducts = productsRes.data.items || productsRes.data || []
      const fetchedCustomers = customersRes.data.items || customersRes.data || []
      const fetchedStores = storesRes.data || []
      setProducts(fetchedProducts)
      setCustomers(fetchedCustomers)
      setStores(fetchedStores)
      setDrivers(driversRes.data || [])
      setVehicles(vehiclesRes.data || [])

      const centralStore = fetchedStores.find(s => s.is_central)
      const centralStoreIdStr = centralStore ? centralStore.id.toString() : ''
      setCentralStoreId(centralStoreIdStr)

      // Initialize searchQuery for line items if pre-selected, and also resolve customer search typed during load
      setBatchOrders(prevOrders => prevOrders.map(order => {
        const updatedWaybills = order.waybills ? order.waybills.map(wb => {
          const updatedLineItems = wb.lineItems ? wb.lineItems.map(item => {
            if (item.product_id && !item.searchQuery) {
              const prod = fetchedProducts.find(p => p.id === parseInt(item.product_id))
              return { ...item, searchQuery: prod ? prod.name : '' }
            }
            return item
          }) : []
          return { ...wb, lineItems: updatedLineItems }
        }) : []

        // If they typed something while loading, match it now
        const matched = order.customerSearchQuery
          ? searchCustomersLocally(order.customerSearchQuery, fetchedCustomers)
          : []

        return {
          ...order,
          sourceStoreId: order.sourceStoreId || centralStoreIdStr,
          waybills: updatedWaybills,
          matchingCustomers: matched.slice(0, 4),
          showCustomerDropdown: order.customerSearchQuery ? true : order.showCustomerDropdown
        }
      }))
    } catch (err) {
      console.error('Failed to load form data:', err)
      setError('Failed to load form data. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Add another order card to batch
  const handleAddOrder = () => {
    const centralStore = stores.find(s => s.is_central)
    const centralStoreId = centralStore ? centralStore.id.toString() : ''
    setBatchOrders([...batchOrders, createInitialOrderObject(centralStoreId)])
  }

  // Remove order card from batch
  const handleRemoveOrder = (id) => {
    if (batchOrders.length === 1) return
    setBatchOrders(batchOrders.filter(o => o.id !== id))
  }

  // Copy logistics details from one order to all others in the batch
  const handleCopyLogistics = (sourceOrder) => {
    setBatchOrders(batchOrders.map(o => {
      if (o.id === sourceOrder.id) return o
      return {
        ...o,
        sourceStoreId: sourceOrder.sourceStoreId,
        destinationStoreId: sourceOrder.destinationStoreId,
        dispatchTime: sourceOrder.dispatchTime,
        expectedDeliveryTime: sourceOrder.expectedDeliveryTime,
        driverName: sourceOrder.driverName,
        vehicleNumber: sourceOrder.vehicleNumber,
        fuelCost: sourceOrder.fuelCost,
        waybillCost: sourceOrder.waybillCost,
        otherCosts: sourceOrder.otherCosts.map(c => ({ ...c, id: Math.random().toString(36).substr(2, 9) })),
        waybills: sourceOrder.waybills.map(w => ({ ...w, id: Math.random().toString(36).substr(2, 9) })),
        deliveryTimeError: ''
      }
    }))
  }

  // Fuzzy search customers scoped to specific order index
  const handleCustomerSearch = (orderId, query) => {
    const matched = searchCustomersLocally(query, customers)
    setBatchOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          customerSearchQuery: query,
          customerId: '',
          showCustomerDropdown: true,
          matchingCustomers: matched.slice(0, 4)
        }
      }
      return o
    }))
  }

  // Select customer from dropdown scoped to specific order
  const handleSelectCustomer = (orderId, customer) => {
    setBatchOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          customerId: customer.id.toString(),
          customerSearchQuery: customer.name,
          customerState: customer.state || '',
          customerCity: customer.city || '',
          showCustomerDropdown: false,
          matchingCustomers: []
        }
      }
      return o
    }))
  }

  const handleRoutingChange = (orderId, updates) => {
    setBatchOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        const merged = { ...o, ...updates }
        let sourceId = merged.sourceStoreId
        let destId = merged.destinationStoreId
        
        if (merged.pipelineType === '2-node') {
          sourceId = merged.regionalStoreId
          destId = ''
        } else if (merged.pipelineType === '3-node') {
          sourceId = centralStoreId
          destId = merged.regionalStoreId
        }
        
        return {
          ...merged,
          sourceStoreId: sourceId,
          destinationStoreId: destId
        }
      }
      return o
    }))
  }

  const handleAddLineItem = (orderId, waybillId) => {
    setBatchOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          waybills: o.waybills.map(w => {
            if (w.id === waybillId) {
              return { ...w, lineItems: [...w.lineItems, { product_id: '', quantity: 1, unit: 'Pieces', searchQuery: '' }] }
            }
            return w
          })
        }
      }
      return o
    }))
  }

  const formatLicensePlate = (val) => {
    if (!val) return ''
    const clean = val.replace(/\s+/g, '').toUpperCase()
    const chunks = []
    for (let i = 0; i < clean.length; i += 3) {
      chunks.push(clean.substring(i, i + 3))
    }
    return chunks.join(' ')
  }

  const handleAddNewDriver = (driverName, orderId) => {
    if (!driverName || !driverName.trim()) return
    setConfirmAdd({
      type: 'driver',
      name: driverName.trim(),
      orderId
    })
  }

  const handleAddNewVehicle = (plateNumber, orderId) => {
    if (!plateNumber || !plateNumber.trim()) return
    setConfirmAdd({
      type: 'vehicle',
      plateNumber: formatLicensePlate(plateNumber),
      orderId
    })
  }

  const handleConfirmAdd = async () => {
    if (!confirmAdd) return
    const { type, orderId } = confirmAdd
    
    try {
      setError(null)
      if (type === 'driver') {
        const { name } = confirmAdd
        const res = await api.post('/drivers', { name })
        if (res.data) {
          setDrivers(prev => [...prev, res.data].sort((a, b) => a.name.localeCompare(b.name)))
          setBatchOrders(prev => prev.map(o => o.id === orderId ? { ...o, driverName: res.data.name, showDriverDropdown: false } : o))
          invalidateCache('/drivers')
        }
      } else if (type === 'vehicle') {
        const { plateNumber } = confirmAdd
        const res = await api.post('/vehicles', { plate_number: plateNumber })
        if (res.data) {
          setVehicles(prev => [...prev, res.data].sort((a, b) => a.plate_number.localeCompare(b.plate_number)))
          setBatchOrders(prev => prev.map(o => o.id === orderId ? { ...o, vehicleNumber: res.data.plate_number, showVehicleDropdown: false } : o))
          invalidateCache('/vehicles')
        }
      }
    } catch (err) {
      console.error(`Failed to add new ${type}:`, err)
      const errMsg = err.response?.data?.detail || `Failed to add new ${type} to database.`
      setError(errMsg)
    } finally {
      setConfirmAdd(null)
    }
  }

  const handleActionConfirm = async () => {
    if (!actionItem) return
    const { type } = actionItem

    try {
      setError(null)
      if (type === 'edit_driver') {
        const { driver } = actionItem
        const cleanName = actionInputVal.trim()
        if (!cleanName) {
          setError('Driver name cannot be empty')
          return
        }
        const res = await api.put(`/drivers/${driver.id}`, { name: cleanName })
        if (res.data) {
          setDrivers(prev => prev.map(d => d.id === driver.id ? res.data : d).sort((a, b) => a.name.localeCompare(b.name)))
          // Also dynamically update any open batch orders displaying this driver name!
          setBatchOrders(prev => prev.map(o => o.driverName === driver.name ? { ...o, driverName: res.data.name } : o))
          invalidateCache('/drivers')
        }
      } else if (type === 'delete_driver') {
        const { driver } = actionItem
        await api.delete(`/drivers/${driver.id}`)
        setDrivers(prev => prev.filter(d => d.id !== driver.id))
        // Also dynamically clear/reset any open batch orders that had this driver selected!
        setBatchOrders(prev => prev.map(o => o.driverName === driver.name ? { ...o, driverName: '' } : o))
        invalidateCache('/drivers')
      } else if (type === 'edit_vehicle') {
        const { vehicle } = actionItem
        const formatted = formatLicensePlate(actionInputVal)
        if (!formatted) {
          setError('Vehicle license number cannot be empty')
          return
        }
        const res = await api.put(`/vehicles/${vehicle.id}`, { plate_number: formatted })
        if (res.data) {
          setVehicles(prev => prev.map(v => v.id === vehicle.id ? res.data : v).sort((a, b) => a.plate_number.localeCompare(b.plate_number)))
          // Also dynamically update any open batch orders displaying this vehicle plate!
          setBatchOrders(prev => prev.map(o => o.vehicleNumber === vehicle.plate_number ? { ...o, vehicleNumber: res.data.plate_number } : o))
          invalidateCache('/vehicles')
        }
      } else if (type === 'delete_vehicle') {
        const { vehicle } = actionItem
        await api.delete(`/vehicles/${vehicle.id}`)
        setVehicles(prev => prev.filter(v => v.id !== vehicle.id))
        // Also dynamically clear/reset any open batch orders that had this vehicle selected!
        setBatchOrders(prev => prev.map(o => o.vehicleNumber === vehicle.plate_number ? { ...o, vehicleNumber: '' } : o))
        invalidateCache('/vehicles')
      }
      setActionItem(null)
      setActionInputVal('')
    } catch (err) {
      console.error(`Failed to perform action ${type}:`, err)
      const errMsg = err.response?.data?.detail || `Failed to perform action on database.`
      setError(errMsg)
    }
  }

  // Remove line item inside a specific order
  const handleRemoveLineItem = (orderId, waybillId, itemIndex) => {
    setBatchOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          waybills: o.waybills.map(w => {
            if (w.id === waybillId) {
              if (w.lineItems.length === 1) return w
              return { ...w, lineItems: w.lineItems.filter((_, idx) => idx !== itemIndex) }
            }
            return w
          })
        }
      }
      return o
    }))
  }

  // Update line item details inside a specific order
  const handleLineItemChange = (orderId, waybillId, itemIndex, field, value) => {
    setBatchOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return {
          ...o,
          waybills: o.waybills.map(w => {
            if (w.id === waybillId) {
              const updatedItems = w.lineItems.map((item, idx) => {
                if (idx === itemIndex) {
                  const newItem = { ...item, [field]: value }
                  if (field === 'searchQuery' && !value) {
                    newItem.product_id = ''
                  }
                  return newItem
                }
                return item
              })
              return { ...w, lineItems: updatedItems }
            }
            return w
          })
        }
      }
      return o
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Check for duplicate Delivery No or Invoice No within the batch
    const seenWaybills = new Set()
    const seenInvoices = new Set()
    for (let i = 0; i < batchOrders.length; i++) {
      const order = batchOrders[i]
      if (order.waybills) {
        for (let w = 0; w < order.waybills.length; w++) {
          const wb = order.waybills[w]
          if (wb.waybillNumber.trim()) {
            const fullWb = (wb.brand === 'DSL' ? 'DSL/DLN/' : 'DSLP/DLN/') + wb.waybillNumber.trim()
            if (seenWaybills.has(fullWb)) {
              setError(`Duplicate Delivery No found: "${fullWb}". Two different reference cards cannot have the same Delivery No.`)
              return
            }
            seenWaybills.add(fullWb)
          }
          if (wb.invoiceNumber.trim()) {
            const fullInv = (wb.brand === 'DSL' ? 'DSL/SA/' : 'DSLP/SA/') + wb.invoiceNumber.trim()
            if (seenInvoices.has(fullInv)) {
              setError(`Duplicate Invoice No found: "${fullInv}". Two different reference cards cannot have the same Invoice No.`)
              return
            }
            seenInvoices.add(fullInv)
          }
        }
      }
    }
    
    // Validate each order
    for (let i = 0; i < batchOrders.length; i++) {
      const order = batchOrders[i]
      const orderLabel = batchOrders.length > 1 ? `Order #${i + 1}` : 'The order'
      
      if (!order.customerId) {
        setError(`Please select a customer for ${orderLabel}.`)
        return
      }
      if (!order.regionalStoreId) {
        setError(`Please select a regional store for ${orderLabel} to define the fulfillment route pipeline.`)
        return
      }
      if (!order.dispatchTime || !order.expectedDeliveryTime) {
        setError(`Please specify dispatch and expected delivery times for ${orderLabel}.`)
        return
      }
      if (order.deliveryTimeError) {
        setError(`Please resolve delivery time issue for ${orderLabel}: ${order.deliveryTimeError}`)
        return
      }

      // Validate waybill and invoice fields
      if (!order.waybills || order.waybills.length === 0) {
        setError(`Please add at least one Invoice & Delivery reference for ${orderLabel}.`)
        return
      }
      for (let w = 0; w < order.waybills.length; w++) {
        const wb = order.waybills[w]
        if (!wb.waybillNumber.trim() || !wb.invoiceNumber.trim()) {
          setError(`Please fill in both the Invoice No and Delivery No for card #${w + 1} in ${orderLabel}.`)
          return
        }
        // Validate line items within each reference card
        const invalidItem = wb.lineItems.find(item => !item.product_id || item.quantity <= 0)
        if (invalidItem) {
          setError(`Please select a product and valid quantity for all line items in Reference Card #${w + 1} of ${orderLabel}.`)
          return
        }
      }

      // Validate available stock levels across all reference cards
      for (let w = 0; w < order.waybills.length; w++) {
        const wb = order.waybills[w]
        for (let j = 0; j < wb.lineItems.length; j++) {
          const item = wb.lineItems[j]
          const stock = getAvailableStock(order, item.product_id)
          const prodName = products.find(p => p.id === parseInt(item.product_id))?.name || 'product'
          const factor = (item.unit === 'Cartons' && prodName) ? getConversionFactor(prodName) : 1
          const quantityInPcs = parseFloat(item.quantity || 0) * factor
          
          if (stock !== null && quantityInPcs > stock) {
            const storeName = stores.find(s => s.id.toString() === getDepartureStoreId(order))?.name || 'selected store'
            setError(`Requested quantity for "${prodName}" (${item.quantity} ${item.unit}) exceeds available stock in ${storeName} (${stock} pieces remaining).`)
            return
          }
        }
      }
    }

    try {
      setSubmitting(true)
      setError(null)

      const payloads = []

      for (let i = 0; i < batchOrders.length; i++) {
        const order = batchOrders[i]

        // Build reference_cards array for this order
        const referenceCards = order.waybills.map(wb => {
          const fullWb = (wb.brand === 'DSL' ? 'DSL/DLN/' : 'DSLP/DLN/') + wb.waybillNumber.trim()
          const fullInv = (wb.brand === 'DSL' ? 'DSL/SA/' : 'DSLP/SA/') + wb.invoiceNumber.trim()
          return {
            invoice_number: fullInv,
            waybill_number: fullWb,
            brand: wb.brand,
            line_items: wb.lineItems.map(item => ({
              product_id: parseInt(item.product_id),
              quantity: parseFloat(item.quantity),
              unit: item.unit
            }))
          }
        })

        payloads.push({
          customer_id: parseInt(order.customerId),
          source_store_id: order.sourceStoreId ? parseInt(order.sourceStoreId) : null,
          destination_store_id: order.destinationStoreId ? parseInt(order.destinationStoreId) : null,
          dispatch_time: new Date(order.dispatchTime).toISOString(),
          expected_delivery_time: new Date(order.expectedDeliveryTime).toISOString(),
          driver_name: order.driverName || null,
          vehicle_number: order.vehicleNumber || null,
          fuel_cost: parseFloat(order.fuelCost || 0),
          waybill_cost: parseFloat(order.waybillCost || 0),
          other_costs: order.otherCosts.map(c => ({ name: c.name, amount: parseFloat(c.amount || 0) })),
          notes: order.notes || null,
          reference_cards: referenceCards
        })
      }

      // Send all POST requests concurrently (one per batch order — usually just 1)
      const requests = payloads.map(payload => api.post('/orders/', payload))

      try {
        await Promise.all(requests)
        setShowSuccess(true)
      } catch (err) {
        console.error('Failed to create orders batch:', err)
        const errorDetail = err.response?.data?.detail || err.message || 'Failed to create one or more orders. Please try again.'
        setError(errorDetail)
      } finally {
        setSubmitting(false)
      }
    } catch (err) {
      console.error('Failed to initiate orders batch creation:', err)
      setError(err.response?.data?.detail || 'Failed to initiate order creation. Please check your data and try again.')
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <>
      <style>{`
        @keyframes shrinkToSidebar {
          0% {
            transform: scale(1) translate3d(0, 0, 0);
            opacity: 1;
          }
          100% {
            transform: scale(0.05) translate3d(-45vw, -30vh, 0);
            opacity: 0;
          }
        }
        @keyframes backdropFadeOut {
          0% {
            opacity: 1;
          }
          100% {
            opacity: 0;
          }
        }
        .animate-shrink-to-sidebar {
          animation: shrinkToSidebar 0.5s cubic-bezier(0.25, 1, 0.5, 1) forwards;
          transform-origin: center center;
        }
        .animate-backdrop-fade-out {
          animation: backdropFadeOut 0.5s ease forwards;
        }
      `}</style>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onWheel={(e) => e.stopPropagation()}>
        {/* Backdrop */}
        <div
          className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
            isClosing ? 'animate-backdrop-fade-out' : ''
          }`}
          onClick={submitting || showSuccess ? undefined : onClose}
        />

        {/* Modal Container */}
        <div className={`bg-zinc-950 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col relative z-10 shadow-2xl ${
          isClosing 
            ? 'animate-shrink-to-sidebar' 
            : 'animate-in scale-in duration-200'
        }`}>
        {showSuccess ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-zinc-950 animate-in fade-in duration-300">
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 rounded-full flex items-center justify-center mb-6 animate-bounce">
              <CheckCircle size={36} />
            </div>
            <h3 className="text-2xl font-bold text-zinc-100 mb-2">Order Created Successfully!</h3>
            <p className="text-sm text-zinc-400 max-w-md mb-8">
              The order has been generated and persisted to the database. The stock levels have been updated accordingly.
            </p>
            <button
              type="button"
              onClick={handleSuccessClose}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/20 hover:shadow-emerald-500/35 hover:-translate-y-0.5 transition-all text-sm"
            >
              Back to Dashboard
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center">
                  <Plus size={18} className="text-white" />
                </div>
                <h3 className="text-xl font-bold text-white">
                  {batchOrders.length > 1 ? `Create Batch Orders (${batchOrders.length})` : 'Create New Order'}
                </h3>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors"
                disabled={submitting}
              >
                <X size={20} />
              </button>
            </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 custom-modal-scroll bg-zinc-900/20" style={{ overscrollBehavior: 'contain' }}>
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex gap-3 text-red-400 text-sm">
              <AlertCircle size={20} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-6">
            {batchOrders.map((order, index) => (
              <div 
                key={order.id} 
                className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200"
              >
                {/* Header of each customer order card */}
                <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950/40 px-6 py-3.5">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-zinc-800 text-zinc-300 text-xs font-bold border border-zinc-700">
                      {index + 1}
                    </span>
                    <h5 className="font-bold text-white text-sm">
                      {order.customerSearchQuery ? `Order for: ${order.customerSearchQuery}` : 'New Customer Order'}
                    </h5>
                  </div>
                  {batchOrders.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOrder(order.id)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-zinc-500 hover:text-red-400 px-2 py-1 rounded bg-zinc-800/30 hover:bg-red-500/10 border border-zinc-800 transition-all"
                      title="Remove Order from Batch"
                    >
                      <Trash2 size={13} />
                      Remove
                    </button>
                  )}
                </div>

                {/* Form Fields container */}
                <div className="p-6 space-y-6">
                  {/* Step 1: Customer Details */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                      <User size={14} /> Customer Information
                    </h4>
                    
                    {customerToast && (
                      <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                        <CheckCircle size={15} />
                        <span>{customerToast}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-4">
                      <div className="relative customer-search-container w-full">
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[11px] font-semibold text-zinc-400">
                            Customer <span className="text-red-500">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => handleOpenQuickCustomerModal(order.id, order.customerSearchQuery)}
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-lg border border-emerald-500/25 transition-all shadow-sm group"
                            title="Add New Customer"
                          >
                            <UserPlus size={13} className="transition-transform group-hover:scale-110" />
                            <span>Quick Add</span>
                          </button>
                        </div>
                        <input
                          type="text"
                          placeholder="Type customer name..."
                          required
                          value={order.customerSearchQuery}
                          onFocus={() => {
                            setBatchOrders(prev => prev.map(o => o.id === order.id ? { ...o, showCustomerDropdown: true } : o))
                          }}
                          onChange={(e) => handleCustomerSearch(order.id, e.target.value)}
                          className="w-full px-4 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 transition-colors text-sm"
                        />
                        
                        {order.showCustomerDropdown && (
                          <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-950/90 border border-zinc-800/80 rounded-xl shadow-2xl z-50 overflow-hidden backdrop-blur-md">
                            {order.matchingCustomers.length > 0 && (
                              <ul className="divide-y divide-zinc-900/50 max-h-52 overflow-y-auto custom-product-dropdown-scroll">
                                {order.matchingCustomers.map((c) => (
                                  <li key={c.id}>
                                    <button
                                      type="button"
                                      onClick={() => handleSelectCustomer(order.id, c)}
                                      className="w-full px-4 py-2.5 text-left text-sm text-zinc-300 hover:text-white hover:bg-zinc-800/60 transition-colors flex justify-between items-center"
                                    >
                                      <span className="font-medium text-zinc-100">{c.name}</span>
                                      {c.state && <span className="text-xs text-zinc-400 font-semibold px-2 py-0.5 bg-zinc-800 rounded">{c.state}</span>}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <div className="p-1.5 bg-zinc-950/90 border-t border-zinc-800/80">
                              <button
                                type="button"
                                onClick={() => handleOpenQuickCustomerModal(order.id, order.customerSearchQuery)}
                                className="w-full px-3 py-2 text-left text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg flex items-center gap-2 transition-colors"
                              >
                                <UserPlus size={14} />
                                <span>
                                  {order.customerSearchQuery 
                                    ? `+ Add "${order.customerSearchQuery}" as new customer` 
                                    : '+ Add new customer'}
                                </span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  {/* Step 1.5: Fulfillment Route Pipeline */}
                  <div className="space-y-4 pt-4 border-t border-zinc-800">
                    <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                      <Truck size={14} /> Fulfillment Route Pipeline
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Regional Store Selector */}
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                          Regional Store <span className="text-red-500">*</span>
                        </label>
                        <select
                          required
                          value={order.regionalStoreId || ''}
                          onChange={(e) => {
                            handleRoutingChange(order.id, { regionalStoreId: e.target.value })
                          }}
                          className="w-full px-4 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:border-zinc-650 transition-colors text-sm"
                        >
                          <option value="">-- Select Store --</option>
                          {stores.map(s => (
                            <option key={s.id} value={s.id}>
                              {s.name} {s.is_central ? '(Central HQ)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Pipeline Type selector */}
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                          Routing Model
                        </label>
                        <div className="grid grid-cols-2 gap-2 bg-zinc-950/60 p-1 border border-zinc-800 rounded-xl">
                          <button
                            type="button"
                            onClick={() => handleRoutingChange(order.id, { pipelineType: '2-node' })}
                            className={`py-2 text-[10px] font-bold uppercase rounded-lg transition-all ${
                              order.pipelineType === '2-node'
                                ? 'bg-zinc-800 text-emerald-400 shadow-md border border-zinc-700/50'
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            2-Node Direct
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRoutingChange(order.id, { pipelineType: '3-node' })}
                            className={`py-2 text-[10px] font-bold uppercase rounded-lg transition-all ${
                              order.pipelineType === '3-node'
                                ? 'bg-zinc-800 text-emerald-400 shadow-md border border-zinc-700/50'
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                          >
                            3-Node Supply
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Visual Routing Pipeline diagram */}
                    <div className="bg-zinc-950/40 border border-zinc-800 rounded-xl p-4 mt-3 flex flex-col items-center justify-center space-y-3 min-h-[90px] overflow-hidden">
                      <span className="text-[9px] uppercase tracking-widest text-zinc-550 font-bold">Route Path Preview</span>
                      
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm font-semibold w-full">
                        {order.pipelineType === '3-node' && (
                          <>
                            {/* Node 1: Lagos Central Store */}
                            <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-center shadow-md flex-1 min-w-0 w-full">
                              <span className="text-[8px] uppercase tracking-wider text-zinc-550 font-bold block mb-0.5">Supply Source</span>
                              <span className="text-zinc-200 text-xs truncate block">Lagos Store (HQ)</span>
                            </div>
                            
                            {/* Supply arrow */}
                            <div className="flex flex-col items-center text-[9px] text-zinc-500 shrink-0 sm:rotate-0 rotate-90 my-1 sm:my-0">
                              <span className="font-bold tracking-wider text-amber-500/80 uppercase">Supply</span>
                              <div className="flex items-center text-zinc-600 text-[10px]">
                                <span>──➔</span>
                              </div>
                            </div>
                          </>
                        )}
                        
                        {/* Node 2: Regional Store */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-center shadow-md flex-1 min-w-0 w-full">
                          <span className="text-[8px] uppercase tracking-wider text-zinc-550 font-bold block mb-0.5">
                            {order.pipelineType === '3-node' ? 'Transfer Hub' : 'Departure Store'}
                          </span>
                          <span className="text-zinc-200 text-xs truncate block">
                            {stores.find(s => s.id.toString() === order.regionalStoreId)?.name || 'Select Store'}
                          </span>
                        </div>
 
                        {/* Delivery transit arrow */}
                        <div className="flex flex-col items-center text-[9px] text-zinc-500 shrink-0 sm:rotate-0 rotate-90 my-1 sm:my-0">
                          <span className="font-bold tracking-wider text-emerald-500/80 uppercase">Transit</span>
                          <div className="flex items-center text-zinc-600 text-[10px]">
                            <span>──➔</span>
                          </div>
                        </div>
 
                        {/* Node 3: Customer destination */}
                        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-center shadow-md flex-1 min-w-0 w-full">
                          <span className="text-[8px] uppercase tracking-wider text-zinc-550 font-bold block mb-0.5">Destination</span>
                          <span className="text-zinc-200 text-xs truncate block">
                            {order.customerSearchQuery || 'Customer'}
                          </span>
                          {(order.customerCity || order.customerState) && (
                            <span className="text-[9px] text-zinc-500 block truncate">
                              {order.customerCity ? `${order.customerCity}, ` : ''}{order.customerState}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Invoices & Deliveries List */}
                  <div className="space-y-3 pt-4 border-t border-zinc-800">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                          <FileText size={13} /> Invoice & Delivery Reference(s) <span className="text-red-500">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => addWaybill(order.id)}
                          className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-extrabold bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
                        >
                          <Plus size={11} /> Add Reference
                        </button>
                      </div>
                      <div className="space-y-3">
                        {order.waybills.map((wb, cardIdx) => (
                          <div key={wb.id} className="bg-zinc-950/45 p-4 rounded-2xl border border-zinc-800 space-y-3 relative animate-in fade-in slide-in-from-top-1 duration-150">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] uppercase tracking-wider font-extrabold text-zinc-550">
                                Reference Card #{cardIdx + 1}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-zinc-500 uppercase">Brand:</span>
                                <div className="flex rounded-lg bg-zinc-900 p-0.5 border border-zinc-800">
                                  <button
                                    type="button"
                                    onClick={() => updateWaybill(order.id, wb.id, 'brand', 'DSL')}
                                    className={`px-2 py-0.5 text-[9px] font-extrabold rounded-md uppercase tracking-wider transition-all ${
                                      wb.brand === 'DSL' 
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm' 
                                        : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                                  >
                                    DSL
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => updateWaybill(order.id, wb.id, 'brand', 'DSLP')}
                                    className={`px-2 py-0.5 text-[9px] font-extrabold rounded-md uppercase tracking-wider transition-all ${
                                      wb.brand === 'DSLP' 
                                        ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30 shadow-sm' 
                                        : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                                  >
                                    DSLP
                                  </button>
                                </div>
                                {order.waybills.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeWaybill(order.id, wb.id)}
                                    className="p-1 hover:bg-red-500/10 text-zinc-500 hover:text-red-400 rounded-md transition-colors ml-1"
                                    title="Remove Reference"
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] font-semibold text-zinc-500 mb-1">Invoice No</label>
                                <div className="flex rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950/60 focus-within:border-zinc-600 transition-colors">
                                  <span className="bg-zinc-900/60 px-3 py-2 text-zinc-400 text-xs font-semibold select-none border-r border-zinc-800 flex items-center min-w-[76px] justify-center">
                                    {wb.brand === 'DSL' ? 'DSL/SA/' : 'DSLP/SA/'}
                                  </span>
                                  <input
                                    type="text"
                                    placeholder="e.g. 5003"
                                    required
                                    value={wb.invoiceNumber}
                                    onChange={(e) => updateWaybill(order.id, wb.id, 'invoiceNumber', e.target.value)}
                                    className="w-full px-3 py-2 bg-transparent text-zinc-100 placeholder-zinc-700 focus:outline-none text-xs"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-zinc-500 mb-1">Delivery No</label>
                                <div className="flex rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950/60 focus-within:border-zinc-600 transition-colors">
                                  <span className="bg-zinc-900/60 px-3 py-2 text-zinc-400 text-xs font-semibold select-none border-r border-zinc-800 flex items-center min-w-[76px] justify-center">
                                    {wb.brand === 'DSL' ? 'DSL/DLN/' : 'DSLP/DLN/'}
                                  </span>
                                  <input
                                    type="text"
                                    placeholder="e.g. 1002"
                                    required
                                    value={wb.waybillNumber}
                                    onChange={(e) => updateWaybill(order.id, wb.id, 'waybillNumber', e.target.value)}
                                    className="w-full px-3 py-2 bg-transparent text-zinc-100 placeholder-zinc-700 focus:outline-none text-xs"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Products and Line Items for this Reference Card */}
                            <div className="space-y-3 pt-3 border-t border-zinc-800/40">
                              <div className="flex items-center justify-between">
                                <label className="block text-[10px] font-semibold text-zinc-450 uppercase tracking-wider flex items-center gap-1.5">
                                  <Package size={12} className="text-zinc-500" /> Products for this Card <span className="text-red-500">*</span>
                                </label>
                                <button
                                  type="button"
                                  onClick={() => handleAddLineItem(order.id, wb.id)}
                                  className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-extrabold bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
                                >
                                  <Plus size={10} /> Add Product
                                </button>
                              </div>
                              <div className="space-y-2">
                                {wb.lineItems.map((item, itemIdx) => {
                                  const departureStoreId = getDepartureStoreId(order)
                                  const availableStock = item.product_id ? getAvailableStock(order, item.product_id) : null
                                  const selectedProduct = item.product_id ? products.find(p => p.id === parseInt(item.product_id)) : null
                                  const factor = (item.unit === 'Carton' && selectedProduct) ? getConversionFactor(selectedProduct.name) : 1
                                  const quantityInPcs = parseFloat(item.quantity || 0) * factor
                                  const isExceeded = availableStock !== null && quantityInPcs > availableStock

                                  return (
                                    <div key={itemIdx} className="flex flex-col md:flex-row gap-2.5 items-end md:items-center bg-zinc-900/20 p-2.5 rounded-xl border border-zinc-800/60">
                                      <div className="flex-1 w-full relative product-search-container">
                                        <input
                                          type="text"
                                          placeholder="Type product name..."
                                          required
                                          value={item.searchQuery || ''}
                                          onFocus={() => {
                                            setActiveProductSearch({ orderId: order.id, waybillId: wb.id, itemIdx })
                                            if (!item.searchQuery && item.product_id) {
                                              const prod = products.find(p => p.id === parseInt(item.product_id))
                                              if (prod) {
                                                handleLineItemChange(order.id, wb.id, itemIdx, 'searchQuery', prod.name)
                                              }
                                            }
                                          }}
                                          onChange={(e) => handleLineItemChange(order.id, wb.id, itemIdx, 'searchQuery', e.target.value)}
                                          className={`w-full pl-3 ${item.product_id ? 'pr-24' : 'pr-3'} py-1.5 bg-zinc-800 border border-zinc-700/80 rounded-lg text-zinc-100 placeholder-zinc-550 focus:outline-none focus:border-white transition-colors text-xs`}
                                        />

                                        {item.product_id && (
                                          <div className="absolute right-2 top-[7px] flex items-center gap-1 text-[8px] font-bold text-zinc-450 bg-zinc-950/90 px-1.5 py-0.5 rounded border border-zinc-800/85 z-10 select-none">
                                            <span>Stock:</span>
                                            <span className={!departureStoreId ? "text-zinc-500" : (availableStock > 0 ? "text-emerald-400" : "text-red-400")}>
                                              {!departureStoreId ? "Select Store" : (availableStock !== null ? `${availableStock} Pcs (${parseFloat((availableStock / (selectedProduct ? getConversionFactor(selectedProduct.name) : 96)).toFixed(2))} Ctn)` : '...')}
                                            </span>
                                            {departureStoreId && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  invalidateCache(`/stores/${departureStoreId}/inventory`)
                                                  setStoreInventories(prev => {
                                                    const copy = { ...prev }
                                                    delete copy[departureStoreId]
                                                    return copy
                                                  })
                                                  fetchStoreInventory(departureStoreId, true)
                                                }}
                                                className="ml-1 text-zinc-550 hover:text-white transition-colors flex items-center"
                                                title="Refresh Stock"
                                              >
                                                <RefreshCw size={8} />
                                              </button>
                                            )}
                                          </div>
                                        )}
                                        
                                        {activeProductSearch?.orderId === order.id && activeProductSearch?.waybillId === wb.id && activeProductSearch?.itemIdx === itemIdx && (
                                          <ProductSearchDropdown
                                            query={item.searchQuery || ''}
                                            products={getFilteredProductsForCard(order, wb.brand)}
                                            onSelect={(product) => {
                                              handleLineItemChange(order.id, wb.id, itemIdx, 'product_id', product.id.toString())
                                              handleLineItemChange(order.id, wb.id, itemIdx, 'searchQuery', product.name)
                                              setActiveProductSearch(null)
                                            }}
                                          />
                                        )}
                                      </div>

                                      <div className="w-full md:w-24 relative">
                                        <input
                                          type="number"
                                          required
                                          min="1"
                                          step="any"
                                          placeholder="Qty"
                                          value={item.quantity}
                                          onChange={(e) => handleLineItemChange(order.id, wb.id, itemIdx, 'quantity', e.target.value)}
                                          className={`w-full px-2.5 py-1.5 bg-zinc-800 border rounded-lg text-zinc-100 focus:outline-none focus:border-white transition-colors text-xs ${
                                            isExceeded ? 'border-red-500 focus:border-red-500 text-red-400' : 'border-zinc-700/80'
                                          }`}
                                        />
                                        {isExceeded && (
                                          <span className="absolute left-0 top-full text-[8px] text-red-400 font-bold block mt-0.5 whitespace-nowrap bg-zinc-950/90 px-1 py-0.5 rounded border border-red-500/20 z-10">
                                            Max {availableStock} available
                                          </span>
                                        )}
                                      </div>

                                      <div className="w-full md:w-28">
                                        <select
                                          value={item.unit}
                                          onChange={(e) => handleLineItemChange(order.id, wb.id, itemIdx, 'unit', e.target.value)}
                                          className="w-full px-2.5 py-1.5 bg-zinc-800 border border-zinc-700/80 rounded-lg text-zinc-100 focus:outline-none focus:border-white transition-colors text-xs"
                                        >
                                          <option value="Pieces">Pieces (Pcs)</option>
                                          <option value="Carton">Carton</option>
                                        </select>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => handleRemoveLineItem(order.id, wb.id, itemIdx)}
                                        disabled={wb.lineItems.length === 1}
                                        className="p-1.5 hover:bg-red-500/10 hover:text-red-400 text-zinc-550 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg transition-colors flex-shrink-0"
                                        title="Remove Item"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Schedule & Delivery */}
                  <div className="space-y-4 pt-4 border-t border-zinc-800">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                        <Calendar size={14} /> Schedule & Logistics
                      </h4>
                      {batchOrders.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleCopyLogistics(order)}
                          className="text-[10px] font-bold text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 rounded-lg border border-zinc-800 transition-colors"
                          title="Copy this card's dispatch/driver info to all other cards"
                        >
                          Copy Logistics to All
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                          Dispatch Time <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="datetime-local"
                          required
                          value={order.dispatchTime}
                          onChange={(e) => {
                            const val = e.target.value
                            let nextExpected = ''
                            if (val) {
                              const d = new Date(val)
                              if (!isNaN(d.getTime())) {
                                const twoDaysLater = new Date(d.getTime() + 48 * 60 * 60 * 1000)
                                const offset = twoDaysLater.getTimezoneOffset()
                                const localDate = new Date(twoDaysLater.getTime() - offset * 60 * 1000)
                                nextExpected = localDate.toISOString().substring(0, 16)
                              }
                            }
                            setBatchOrders(prev => prev.map(o => {
                              if (o.id !== order.id) return o
                              return { 
                                ...o, 
                                dispatchTime: val, 
                                expectedDeliveryTime: nextExpected || o.expectedDeliveryTime,
                                deliveryTimeError: ''
                              }
                            }))
                          }}
                          className="w-full px-4 py-2 bg-zinc-950/60 border border-zinc-800 rounded-xl text-zinc-100 focus:outline-none focus:border-zinc-650 transition-colors text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                          Expected Delivery <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="datetime-local"
                          required
                          value={order.expectedDeliveryTime}
                          onChange={(e) => {
                            const val = e.target.value
                            setBatchOrders(prev => prev.map(o => {
                              if (o.id !== order.id) return o
                              const newTimeError = o.dispatchTime && new Date(val) <= new Date(o.dispatchTime)
                                ? 'Expected Delivery must be after Dispatch Time.'
                                : ''
                              return { ...o, expectedDeliveryTime: val, deliveryTimeError: newTimeError }
                            }))
                          }}
                          className={`w-full px-4 py-2 bg-zinc-950/60 border rounded-xl text-zinc-100 focus:outline-none transition-colors text-sm ${
                            order.deliveryTimeError ? 'border-red-500 focus:border-red-500' : 'border-zinc-800 focus:border-zinc-650'
                          }`}
                        />
                        {order.deliveryTimeError && (
                          <p className="text-red-400 text-xs mt-1.5 flex items-center gap-1">
                            <AlertCircle size={12} />
                            {order.deliveryTimeError}
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Driver Name</label>
                        <div className="relative driver-search-container">
                          <div className="flex gap-2 items-center">
                            <div className="relative flex-1">
                              <Truck size={14} className="absolute left-3.5 top-3 text-zinc-550" />
                              <input
                                type="text"
                                placeholder="e.g. John Doe"
                                value={order.driverName}
                                onFocus={() => {
                                  setBatchOrders(prev => prev.map(o => o.id === order.id ? { ...o, showDriverDropdown: true } : o))
                                }}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setBatchOrders(prev => prev.map(o => o.id === order.id ? { ...o, driverName: val, showDriverDropdown: true } : o))
                                }}
                                className="w-full pl-10 pr-4 py-2 bg-zinc-950/60 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-650 transition-colors text-sm"
                              />
                            </div>
                            {order.driverName && order.driverName.trim() && !drivers.some(d => d.name.toLowerCase() === order.driverName.trim().toLowerCase()) && (
                              <button
                                type="button"
                                onClick={() => handleAddNewDriver(order.driverName.trim(), order.id)}
                                className="flex items-center justify-center p-2 bg-purple-500/10 hover:bg-purple-500/25 border border-purple-500/30 text-purple-400 rounded-xl transition-all cursor-pointer h-[38px] w-[38px] shrink-0"
                                title={`Add "${order.driverName.trim()}" as a new driver`}
                              >
                                <Plus size={16} />
                              </button>
                            )}
                          </div>
                          
                          {/* Driver Dropdown */}
                          {order.showDriverDropdown && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-950/75 border border-zinc-800/80 rounded-xl shadow-xl z-50 max-h-[160px] overflow-y-auto custom-product-dropdown-scroll backdrop-blur-md">
                              <ul className="divide-y divide-zinc-900/50">
                                {drivers
                                  .filter(d => d.name.toLowerCase().includes(order.driverName.toLowerCase()))
                                  .map(d => (
                                    <li key={d.id} className="group/item flex items-center justify-between hover:bg-zinc-800/60 transition-colors px-4 py-2.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setBatchOrders(prev => prev.map(o => o.id === order.id ? { ...o, driverName: d.name, showDriverDropdown: false } : o))
                                        }}
                                        className="flex-1 text-left text-sm text-zinc-300 hover:text-white transition-colors"
                                      >
                                        {d.name}
                                      </button>
                                      <div className="flex items-center gap-1.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setActionItem({ type: 'edit_driver', driver: d })
                                            setActionInputVal(d.name)
                                          }}
                                          className="p-1 hover:bg-zinc-700/50 hover:text-amber-400 text-zinc-550 rounded-md transition-colors cursor-pointer"
                                          title="Rename Driver"
                                        >
                                          <Edit2 size={13} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setActionItem({ type: 'delete_driver', driver: d })
                                          }}
                                          className="p-1 hover:bg-zinc-700/50 hover:text-red-400 text-zinc-550 rounded-md transition-colors cursor-pointer"
                                          title="Delete Driver"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </div>
                                    </li>
                                  ))}
                                {drivers.filter(d => d.name.toLowerCase().includes(order.driverName.toLowerCase())).length === 0 && (
                                  <li className="px-4 py-3 text-xs text-zinc-550 text-center">
                                    No matching driver. Click the <span className="text-purple-400 font-semibold">+</span> button to add.
                                  </li>
                                )}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-400 mb-1">Vehicle License Number</label>
                        <div className="relative vehicle-search-container">
                          <div className="flex gap-2 items-center">
                            <div className="relative flex-1">
                              <input
                                type="text"
                                placeholder="e.g. APP 483 EQ"
                                value={order.vehicleNumber}
                                onFocus={() => {
                                  setBatchOrders(prev => prev.map(o => o.id === order.id ? { ...o, showVehicleDropdown: true } : o))
                                }}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setBatchOrders(prev => prev.map(o => o.id === order.id ? { ...o, vehicleNumber: val, showVehicleDropdown: true } : o))
                                }}
                                onBlur={(e) => {
                                  const val = e.target.value
                                  if (val) {
                                    setBatchOrders(prev => prev.map(o => o.id === order.id ? { ...o, vehicleNumber: formatLicensePlate(val) } : o))
                                  }
                                }}
                                className="w-full px-4 py-2 bg-zinc-950/60 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-650 transition-colors text-sm"
                              />
                            </div>
                            {order.vehicleNumber && order.vehicleNumber.trim() && !vehicles.some(v => v.plate_number.toLowerCase() === formatLicensePlate(order.vehicleNumber).toLowerCase()) && (
                              <button
                                type="button"
                                onClick={() => handleAddNewVehicle(order.vehicleNumber.trim(), order.id)}
                                className="flex items-center justify-center p-2 bg-purple-500/10 hover:bg-purple-500/25 border border-purple-500/30 text-purple-400 rounded-xl transition-all cursor-pointer h-[38px] w-[38px] shrink-0"
                                title={`Add "${formatLicensePlate(order.vehicleNumber)}" as a new vehicle`}
                              >
                                <Plus size={16} />
                              </button>
                            )}
                          </div>
                          
                          {/* Vehicle Dropdown */}
                          {order.showVehicleDropdown && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-950/75 border border-zinc-800/80 rounded-xl shadow-xl z-50 max-h-[160px] overflow-y-auto custom-product-dropdown-scroll backdrop-blur-md">
                              <ul className="divide-y divide-zinc-900/50">
                                {vehicles
                                  .filter(v => v.plate_number.toLowerCase().replace(/\s+/g, '').includes(order.vehicleNumber.toLowerCase().replace(/\s+/g, '')))
                                  .map(v => (
                                    <li key={v.id} className="group/item flex items-center justify-between hover:bg-zinc-800/60 transition-colors px-4 py-2.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setBatchOrders(prev => prev.map(o => o.id === order.id ? { ...o, vehicleNumber: v.plate_number, showVehicleDropdown: false } : o))
                                        }}
                                        className="flex-1 text-left text-sm text-zinc-300 hover:text-white transition-colors"
                                      >
                                        {v.plate_number}
                                      </button>
                                      <div className="flex items-center gap-1.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setActionItem({ type: 'edit_vehicle', vehicle: v })
                                            setActionInputVal(v.plate_number)
                                          }}
                                          className="p-1 hover:bg-zinc-700/50 hover:text-amber-400 text-zinc-550 rounded-md transition-colors cursor-pointer"
                                          title="Rename Vehicle"
                                        >
                                          <Edit2 size={13} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            setActionItem({ type: 'delete_vehicle', vehicle: v })
                                          }}
                                          className="p-1 hover:bg-zinc-700/50 hover:text-red-400 text-zinc-550 rounded-md transition-colors cursor-pointer"
                                          title="Delete Vehicle"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </div>
                                    </li>
                                  ))}
                                {vehicles.filter(v => v.plate_number.toLowerCase().replace(/\s+/g, '').includes(order.vehicleNumber.toLowerCase().replace(/\s+/g, ''))).length === 0 && (
                                  <li className="px-4 py-3 text-xs text-zinc-550 text-center">
                                    No matching vehicle. Click the <span className="text-purple-400 font-semibold">+</span> button to add.
                                  </li>
                                )}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                              {/* Step 3: Line Items are now rendered inside each reference card above */}        </div>

                  {/* Step 3.5: Logistics Costs */}
                  <div className="space-y-4 pt-4 border-t border-zinc-800">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                        <span className="text-zinc-550 font-bold">$</span> Logistics Costs
                      </h4>
                      <button
                        type="button"
                        onClick={() => {
                          setBatchOrders(prev => prev.map(o => {
                            if (o.id !== order.id) return o
                            return {
                              ...o,
                              otherCosts: [
                                ...o.otherCosts,
                                { id: Math.random().toString(36).substr(2, 9), name: '', amount: '0' }
                              ]
                            }
                          }))
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 hover:text-white text-xs font-semibold rounded-lg border border-zinc-700 transition-colors"
                        title="Add Custom Cost Item"
                      >
                        <Plus size={13} />
                        Add Cost
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                          Fuel Cost (₦)
                        </label>
                        <input
                          type="number"
                          placeholder="0"
                          min="0"
                          step="any"
                          value={order.fuelCost}
                          onChange={(e) => {
                            setBatchOrders(prev => prev.map(o => o.id === order.id ? { ...o, fuelCost: e.target.value } : o))
                          }}
                          className="w-full px-4 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-zinc-650 transition-colors text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                          Waybill Cost (₦)
                        </label>
                        <input
                          type="number"
                          placeholder="0"
                          min="0"
                          step="any"
                          value={order.waybillCost}
                          onChange={(e) => {
                            setBatchOrders(prev => prev.map(o => o.id === order.id ? { ...o, waybillCost: e.target.value } : o))
                          }}
                          className="w-full px-4 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-700 focus:outline-none focus:border-zinc-650 transition-colors text-sm"
                        />
                      </div>
                    </div>

                    {/* Custom Costs list */}
                    {order.otherCosts && order.otherCosts.length > 0 && (
                      <div className="space-y-3 pt-2">
                        {order.otherCosts.map((cost, costIdx) => (
                          <div key={cost.id} className="flex gap-3 items-center bg-zinc-950/30 p-3 rounded-xl border border-zinc-800 animate-in fade-in duration-200">
                            <div className="flex-1">
                              <input
                                type="text"
                                placeholder="Cost Name (e.g. Loading Fee)"
                                required
                                value={cost.name}
                                onChange={(e) => {
                                  setBatchOrders(prev => prev.map(o => {
                                    if (o.id !== order.id) return o
                                    const updatedCosts = [...o.otherCosts]
                                    updatedCosts[costIdx] = { ...updatedCosts[costIdx], name: e.target.value }
                                    return { ...o, otherCosts: updatedCosts }
                                  }))
                                }}
                                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-550 focus:outline-none focus:border-white transition-colors text-sm"
                              />
                            </div>
                            <div className="w-32">
                              <input
                                type="number"
                                placeholder="Amount"
                                min="0"
                                step="any"
                                required
                                value={cost.amount}
                                onChange={(e) => {
                                  setBatchOrders(prev => prev.map(o => {
                                    if (o.id !== order.id) return o
                                    const updatedCosts = [...o.otherCosts]
                                    updatedCosts[costIdx] = { ...updatedCosts[costIdx], amount: e.target.value }
                                    return { ...o, otherCosts: updatedCosts }
                                  }))
                                }}
                                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:border-white transition-colors text-sm"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setBatchOrders(prev => prev.map(o => {
                                  if (o.id !== order.id) return o
                                  return { ...o, otherCosts: o.otherCosts.filter(c => c.id !== cost.id) }
                                }))
                              }}
                              className="p-2 hover:bg-red-500/10 hover:text-red-400 text-zinc-500 rounded-lg transition-colors flex-shrink-0"
                              title="Remove Cost Item"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Step 4: Notes */}
                  <div className="space-y-4 pt-4 border-t border-zinc-800">
                    <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                      <FileText size={14} /> Additional Notes
                    </h4>
                    <textarea
                      rows="2"
                      placeholder="Enter dispatch notes, specific customer requirements, etc."
                      value={order.notes}
                      onChange={(e) => {
                        setBatchOrders(prev => prev.map(o => o.id === order.id ? { ...o, notes: e.target.value } : o))
                      }}
                      className="w-full px-4 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-650 transition-colors text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add Another Customer Button */}
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={handleAddOrder}
              className="flex items-center gap-2 px-6 py-3 bg-zinc-900 hover:bg-white border border-zinc-800 hover:border-white text-white hover:text-zinc-900 font-semibold rounded-2xl shadow-lg transition-all duration-200"
            >
              <Plus size={18} />
              Add Another Customer Order
            </button>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-500 font-semibold">
            {batchOrders.length} customer order{batchOrders.length > 1 ? 's' : ''} in batch
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-zinc-750 hover:border-red-500 hover:bg-red-500 text-zinc-300 hover:text-white font-medium rounded-xl transition-all duration-200 text-sm"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-5 py-2 border border-zinc-750 hover:border-white bg-transparent hover:bg-white text-zinc-300 hover:text-zinc-900 font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 text-sm"
              disabled={submitting}
            >
              {submitting ? 'Creating Batch...' : batchOrders.length > 1 ? `Create Batch Orders (${batchOrders.length})` : 'Create Order'}
            </button>
          </div>
        </div>
        </>
        )}
      </div>

      {/* Confirmation Modal Overlay */}
      {confirmAdd && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-2xl w-full max-w-sm shadow-2xl space-y-4 animate-in scale-in duration-200">
            <h4 className="text-lg font-bold text-zinc-100">Confirm Add</h4>
            <p className="text-sm text-zinc-400">
              Are you sure you want to add{' '}
              <span className="font-semibold text-white">
                {confirmAdd.type === 'driver' ? confirmAdd.name : confirmAdd.plateNumber}
              </span>{' '}
              to your list of {confirmAdd.type}s?
            </p>
            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setConfirmAdd(null)}
                className="px-4 py-2 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 text-zinc-400 hover:text-white text-xs font-semibold rounded-xl transition-all"
              >
                No, Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAdd}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-600/10 hover:shadow-emerald-500/25 hover:-translate-y-0.5 transition-all"
              >
                Yes, Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Item (Edit/Delete Driver/Vehicle) Modal Overlay */}
      {actionItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-2xl w-full max-w-sm shadow-2xl space-y-4 animate-in scale-in duration-200">
            <h4 className="text-lg font-bold text-zinc-100">
              {actionItem.type === 'edit_driver' && 'Rename Driver'}
              {actionItem.type === 'delete_driver' && 'Delete Driver'}
              {actionItem.type === 'edit_vehicle' && 'Edit Vehicle License'}
              {actionItem.type === 'delete_vehicle' && 'Delete Vehicle'}
            </h4>
            
            {/* Input field for edit actions */}
            {(actionItem.type === 'edit_driver' || actionItem.type === 'edit_vehicle') ? (
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">
                  {actionItem.type === 'edit_driver' ? 'Driver Name' : 'License Plate Number'}
                </label>
                <input
                  type="text"
                  value={actionInputVal}
                  onChange={(e) => setActionInputVal(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-900 border border-zinc-800 focus:border-zinc-700 rounded-xl text-zinc-150 text-sm focus:outline-none transition-colors"
                  placeholder={actionItem.type === 'edit_driver' ? 'e.g. John Doe' : 'e.g. APP 483 EQ'}
                  autoFocus
                />
              </div>
            ) : (
              <p className="text-sm text-zinc-400">
                Are you sure you want to delete{' '}
                <span className="font-semibold text-white">
                  {actionItem.type === 'delete_driver' ? actionItem.driver.name : actionItem.vehicle.plate_number}
                </span>
                ? This action cannot be undone.
              </p>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setActionItem(null)
                  setActionInputVal('')
                }}
                className="px-4 py-2 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 text-zinc-400 hover:text-white text-xs font-semibold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleActionConfirm}
                className={`px-4 py-2 text-xs font-semibold rounded-xl shadow-lg transition-all hover:-translate-y-0.5 ${
                  actionItem.type.startsWith('delete')
                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/10 hover:shadow-red-500/25'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/10 hover:shadow-emerald-500/25'
                }`}
              >
                {actionItem.type.startsWith('delete') ? 'Delete' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Customer Modal */}
      <AddCustomerModal
        isOpen={quickCustomerModal.isOpen}
        onClose={() => setQuickCustomerModal({ isOpen: false, orderId: null, initialName: '' })}
        initialName={quickCustomerModal.initialName}
        onCustomerCreated={handleCustomerCreated}
      />
    </div>
    </>
  )
}

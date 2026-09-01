import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle responses
api.interceptors.response.use(
  (response) => {
    const method = response.config?.method?.toUpperCase()
    // POST /ai/ask is a read-only question — it must NOT wipe the SWR cache.
    const isReadOnlyPost = response.config?.url?.includes('/ai/ask')
    if (method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !isReadOnlyPost) {
      clearCache()
    }
    return response
  },
  (error) => {
    if (error.response?.status === 401) {
      const isLoginRequest = error.config?.url?.includes('/auth/login')
      const isLoginPage = window.location.pathname === '/login'
      if (!isLoginRequest && !isLoginPage) {
        // Unauthorized - clear token and redirect to login
        localStorage.removeItem('token')
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// Simple, high-performance in-memory SWR cache with request deduplication
const memoryCache = new Map()
const pendingPromises = new Map()

export const getWithCache = async (url, config = {}) => {
  // Generate a unique cache key that includes query parameters
  const cacheKey = config.params 
    ? `${url}?${new URLSearchParams(config.params).toString()}` 
    : url

  // If data is in cache, return immediately and trigger background refresh
  if (memoryCache.has(cacheKey)) {
    const cachedData = memoryCache.get(cacheKey)
    
    // Background fetch (silent revalidation)
    api.get(url, config).then((response) => {
      memoryCache.set(cacheKey, response.data)
      if (config.onCacheUpdate) {
        config.onCacheUpdate(response.data)
      }
    }).catch((err) => {
      console.error('Silent background refresh failed:', err)
    })
    
    return { data: cachedData, fromCache: true }
  }

  // If there's already an active request for this URL, await it to prevent duplicate requests
  if (pendingPromises.has(cacheKey)) {
    try {
      const data = await pendingPromises.get(cacheKey)
      return { data, fromCache: true }
    } catch (err) {
      // If the pending promise failed, re-throw
      throw err
    }
  }

  // Create new request promise
  const promise = api.get(url, config)
    .then((res) => {
      memoryCache.set(cacheKey, res.data)
      pendingPromises.delete(cacheKey)
      return res.data
    })
    .catch((err) => {
      pendingPromises.delete(cacheKey)
      throw err
    })

  pendingPromises.set(cacheKey, promise)
  
  try {
    const data = await promise
    return { data, fromCache: false }
  } catch (err) {
    throw err
  }
}

export const isCached = (url, config = {}) => {
  const cacheKey = config.params 
    ? `${url}?${new URLSearchParams(config.params).toString()}` 
    : url
  return memoryCache.has(cacheKey)
}

export const invalidateCache = (url, config = {}) => {
  const cacheKey = config.params 
    ? `${url}?${new URLSearchParams(config.params).toString()}` 
    : url
  memoryCache.delete(cacheKey)

  // Also clear any cache keys that start with the target URL or URL with query params
  // to avoid stale query pagination caches (e.g., /customers?limit=1000)
  for (const key of memoryCache.keys()) {
    if (key === url || key.startsWith(`${url}?`) || key.startsWith(`${url}/`)) {
      memoryCache.delete(key)
    }
  }
}

export const updateCache = (url, data, config = {}) => {
  const cacheKey = config.params 
    ? `${url}?${new URLSearchParams(config.params).toString()}` 
    : url
  memoryCache.set(cacheKey, data)
}

export const clearCache = () => {
  memoryCache.clear()
  pendingPromises.clear()
}

export default api

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import api from '../services/api'

export const AuthContext = createContext()

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}

const POLL_INTERVAL_MS = 30000 // 30 seconds

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem('token'))
  const [loading, setLoading] = useState(true)
  const [accessGrantedPopup, setAccessGrantedPopup] = useState(false)
  const [accessRevokedPopup, setAccessRevokedPopup] = useState(false)
  const pollRef = useRef(null)
  const prevRoleRef = useRef(null)
  const prevHasWriteAccessRef = useRef(null)

  useEffect(() => {
    // Load user on mount if token exists
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      fetchCurrentUser(true)
    } else {
      setLoading(false)
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  // Start background polling when user is logged in
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)

    if (user && token) {
      pollRef.current = setInterval(() => {
        pollUserRole()
      }, POLL_INTERVAL_MS)
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [user?.id, token])

  const pollUserRole = async () => {
    try {
      const response = await api.get('/auth/me')
      const freshUser = response.data

      const oldHasWriteAccess = prevHasWriteAccessRef.current
      const newHasWriteAccess = freshUser.role === 'admin' || freshUser.has_write_access === true

      // Detect write access grant
      if (oldHasWriteAccess === false && newHasWriteAccess === true) {
        setUser(freshUser)
        setAccessGrantedPopup(true)
      } 
      // Detect write access revocation
      else if (oldHasWriteAccess === true && newHasWriteAccess === false) {
        setUser(freshUser)
        setAccessRevokedPopup(true)
      }
      else {
        setUser(freshUser)
      }
      prevRoleRef.current = freshUser.role
      prevHasWriteAccessRef.current = newHasWriteAccess
    } catch (error) {
      // Silent fail on poll — don't disrupt user experience
      console.warn('Background role poll failed:', error)
    }
  }

  const fetchCurrentUser = async (isInitialLoad = false) => {
    try {
      const response = await api.get('/auth/me')
      const userData = response.data
      setUser(userData)
      prevRoleRef.current = userData.role
      const hasWrite = userData.role === 'admin' || userData.has_write_access === true
      prevHasWriteAccessRef.current = hasWrite

      // On initial load (login/page refresh), check if user was recently granted access
      // "Recently" = role_changed_at exists and is within the last 5 minutes
      if (isInitialLoad && hasWrite && userData.role_changed_at) {
        const changedAt = new Date(userData.role_changed_at)
        const now = new Date()
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)
        const acknowledgedAt = localStorage.getItem(`access_granted_ack_${userData.id}`)

        if (changedAt > fiveMinutesAgo && (!acknowledgedAt || new Date(acknowledgedAt) < changedAt)) {
          setAccessGrantedPopup(true)
        }
      }
    } catch (error) {
      console.error('Failed to fetch user:', error)
      logout()
    } finally {
      setLoading(false)
    }
  }

  const acknowledgeAccessGranted = useCallback(() => {
    setAccessGrantedPopup(false)
    if (user) {
      localStorage.setItem(`access_granted_ack_${user.id}`, new Date().toISOString())
    }
  }, [user])

  const acknowledgeAccessRevoked = useCallback(() => {
    setAccessRevokedPopup(false)
  }, [])

  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password })
      const { access_token, user: userData } = response.data
      localStorage.setItem('token', access_token)
      setToken(access_token)
      setUser(userData)
      prevRoleRef.current = userData.role
      const hasWrite = userData.role === 'admin' || userData.has_write_access === true
      prevHasWriteAccessRef.current = hasWrite
      api.defaults.headers.common['Authorization'] = `Bearer ${access_token}`

      // Check for fresh promotion on login
      if (hasWrite && userData.role_changed_at) {
        const changedAt = new Date(userData.role_changed_at)
        const now = new Date()
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)
        const acknowledgedAt = localStorage.getItem(`access_granted_ack_${userData.id}`)

        if (changedAt > fiveMinutesAgo && (!acknowledgedAt || new Date(acknowledgedAt) < changedAt)) {
          setAccessGrantedPopup(true)
        }
      }

      return { success: true, user: userData }
    } catch (error) {
      const detail = error.response?.data?.detail
      let errMsg = 'Invalid email or password'
      if (typeof detail === 'string') {
        errMsg = detail
      } else if (Array.isArray(detail)) {
        errMsg = detail.map(e => e.msg || e).join(', ')
      } else if (error.message) {
        errMsg = error.message
      }
      return { success: false, error: errMsg }
    }
  }

  const signup = async (email, password, full_name) => {
    try {
      const response = await api.post('/auth/signup', { email, password, full_name })
      return { success: true, user: response.data.user }
    } catch (error) {
      const detail = error.response?.data?.detail
      let errMsg = 'Signup failed'
      if (typeof detail === 'string') {
        errMsg = detail
      } else if (Array.isArray(detail)) {
        errMsg = detail.map(e => e.msg || e).join(', ')
      } else if (error.message) {
        errMsg = error.message
      }
      return { success: false, error: errMsg }
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
    prevRoleRef.current = null
    prevHasWriteAccessRef.current = null
    delete api.defaults.headers.common['Authorization']
    if (pollRef.current) clearInterval(pollRef.current)
  }

  const requestAdmin = async () => {
    try {
      await api.post('/auth/request-admin')
      await fetchCurrentUser()
      return { success: true }
    } catch (error) {
      return { success: false, error: error.response?.data?.detail || 'Request failed' }
    }
  }

  const isAdmin = user?.role === 'admin'
  const hasWriteAccess = user?.role === 'admin' || user?.has_write_access === true
  const isAuthenticated = !!token && !!user

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated,
        isAdmin,
        hasWriteAccess,
        login,
        signup,
        logout,
        requestAdmin,
        accessGrantedPopup,
        acknowledgeAccessGranted,
        accessRevokedPopup,
        acknowledgeAccessRevoked,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

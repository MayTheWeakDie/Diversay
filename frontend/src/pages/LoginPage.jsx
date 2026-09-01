import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Shield, User, Eye, EyeOff, UserPlus, ArrowRight } from 'lucide-react'
import SplashPage from './SplashPage'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [isReady, setIsReady] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedRole = searchParams.get('role')

  const skipSplash = location.state?.skipSplash || false
  const [email, setEmail] = useState(location.state?.autofillEmail || '')
  const [password, setPassword] = useState(location.state?.autofillPassword || '')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { login } = useAuth()

  // Splash-screen state
  const [showSplash, setShowSplash] = useState(!skipSplash)
  const [slideLoginUp, setSlideLoginUp] = useState(skipSplash)

  useEffect(() => {
    if (showSplash) {
      setSearchParams({})
    }
    setIsReady(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const renderHeading = () => {
    if (!isReady) return null

    return (
      <span className="text-white" style={{ fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 700, fontStyle: 'normal' }}>
        <span className="inline-block">
          Ready to start
        </span>
        <br />
        <span className="inline-block whitespace-nowrap">
          working? sign in here
        </span>
      </span>
    )
  }

  const handleRoleSelect = (role) => {
    setSearchParams({ role })
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const result = await login(email, password)
      if (result.success) {
        const userRole = result.user?.role?.toLowerCase()

        // Check if role matches selected role
        if (selectedRole === 'admin' && userRole !== 'admin') {
          setError('This account is not an admin account')
          setIsLoading(false)
          return
        }

        // Navigate to dashboard for admin login path, orders for user login path
        const destination = selectedRole === 'admin' ? '/dashboard' : '/orders'
        navigate(destination, { state: { fromLogin: true } })
      } else {
        // Check for pending approval error
        if (result.error?.includes('pending admin approval')) {
          navigate('/pending-approval', { state: { email } })
        } else {
          setError(result.error || 'Invalid email or password')
        }
      }
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-900 p-4">
      {/* Splash screen – renders via portal at document.body, slides up when done */}
      {showSplash && (
        <SplashPage
          onStartLeaving={() => setSlideLoginUp(true)}
          onComplete={() => setShowSplash(false)}
        />
      )}

      {/* Main content – starts invisible below, slides up in sync with splash */}
      <div
        className="w-full max-w-xl text-center"
        style={{
          transform: (slideLoginUp || !showSplash) ? 'translateY(0)' : 'translateY(60px)',
          opacity: (slideLoginUp || !showSplash) ? 1 : 0,
          transition: 'transform 0.8s cubic-bezier(0.77,0,0.175,1), opacity 0.8s cubic-bezier(0.77,0,0.175,1)',
        }}
      >
        {/* Font-cycling heading — fixed height prevents layout shift */}
        <h1
          className="text-4xl md:text-5xl leading-[1.25] mb-8 text-white"
          style={{ letterSpacing: '-0.01em', minHeight: '7.5rem' }}
        >
          {renderHeading()}
        </h1>

        {/* Content area */}
        {isReady && (
          <div className="space-y-6 animate-fadeIn">
            {/* Privacy policy text */}
            <p className="text-xs text-gray-400">
              By continuing, you agree to our <a href="#" className="underline hover:text-gray-300">privacy policy</a>.
            </p>

            {/* Role selection buttons */}
            {!selectedRole && (
              <div className="space-y-3">
                {/* Sign in as Admin button */}
                <button
                  onClick={() => handleRoleSelect('admin')}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gray-200 text-gray-900 rounded-lg font-medium hover:bg-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-white/5 active:translate-y-0 transition-all duration-200"
                >
                  <Shield size={20} />
                  <span>Sign in as admin</span>
                </button>

                {/* Sign in as User button */}
                <button
                  onClick={() => handleRoleSelect('viewer')}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gray-800 text-gray-300 rounded-lg font-medium hover:bg-white hover:text-gray-900 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-white/5 active:translate-y-0 transition-all duration-200"
                >
                  <User size={20} />
                  <span>Sign in as user</span>
                </button>

                {/* OR Divider */}
                <div className="relative py-4 my-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-zinc-800"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-zinc-900 px-3 text-zinc-500 font-medium tracking-widest">OR</span>
                  </div>
                </div>

                {/* New User / Sign Up Button */}
                <button
                  onClick={() => navigate('/signup')}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gray-200 text-gray-900 rounded-lg font-medium hover:bg-white hover:-translate-y-0.5 hover:shadow-lg hover:shadow-white/5 active:translate-y-0 transition-all duration-200"
                >
                  <UserPlus size={20} />
                  <span>New user? <span className="underline">Sign up</span></span>
                </button>
              </div>
            )}

            {/* Email section - appears after role selection */}
            {selectedRole && (
              <div className="space-y-4 animate-fadeIn">
                {/* Divider */}
                <div className="relative py-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-600"></div>
                  </div>
                </div>

                {/* Email input */}
                <form onSubmit={handleLogin} className="space-y-4">
                  <input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-800 text-white placeholder-gray-500 border border-gray-700 rounded-lg focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-600 transition-all"
                    required
                  />

                  {/* Password input */}
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-gray-800 text-white placeholder-gray-500 border border-gray-700 rounded-lg focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-600 transition-all pr-12"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>

                  {/* Error message */}
                  {error && (
                    <div className="bg-red-500/10 border border-red-500/30 text-red-200 px-4 py-3 rounded-lg text-sm flex items-start gap-2.5">
                      <span className="text-red-400 font-bold shrink-0 mt-0.5">⚠️</span>
                      <p className="font-medium leading-relaxed text-left">{error}</p>
                    </div>
                  )}

                  {/* Continue with email button */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full px-4 py-3 bg-gray-200 text-gray-900 rounded-lg font-medium hover:bg-white transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isLoading ? 'Signing in...' : 'Continue with email'}
                  </button>
                </form>

                {/* Single sign-on text */}
                <p className="text-xs text-gray-500">Single sign-on (SSO)</p>

                {/* Back button */}
                <button
                  onClick={() => setSearchParams({})}
                  className="text-xs text-gray-400 hover:text-gray-300 underline"
                >
                  Back to role selection
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-xs text-gray-600">Powered by Diversay Solutions @2025</p>
        </div>
      </div>
    </div>
  )
}

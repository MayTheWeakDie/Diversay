import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { CheckCircle2, Eye, EyeOff } from 'lucide-react'

const HEADING_TEXT = "New user? Sign up here"
const SUCCESS_TEXT = "Successfully signed up"
const PENDING_TEXT = "Ready to access your dashboard"

const COLORS = [
  { textClass: 'text-teal-400', hex: '#2dd4bf' }, // Teal
  { textClass: 'text-purple-400', hex: '#c084fc' }, // Purple
  { textClass: 'text-green-400', hex: '#4ade80' }, // Green
  { textClass: 'text-rose-400', hex: '#f0435dff' }, // Coral
  { textClass: 'text-amber-400', hex: '#facc15' }, // Gold
  { textClass: 'text-blue-400', hex: '#68a9d7ff' }, // Blue
]

const FONTS = [
  { family: '"Playfair Display", Georgia, serif', style: 'italic', weight: 700 },
  { family: '"Merriweather", Georgia, serif', style: 'normal', weight: 700 },
  { family: '"Lora", Georgia, serif', style: 'italic', weight: 700 },
  { family: '"Libre Baskerville", Georgia, serif', style: 'normal', weight: 700 },
  { family: '"PT Serif", Georgia, serif', style: 'italic', weight: 700 },
]

export default function SignupPage() {
  const navigate = useNavigate()
  const { signup } = useAuth()

  const [isReady, setIsReady] = useState(false)

  // Success screen animations
  const [successText, setSuccessText] = useState('')
  const [isSuccessTextComplete, setIsSuccessTextComplete] = useState(false)
  const [showCheckAnimation, setShowCheckAnimation] = useState(false)
  const [pendingText, setPendingText] = useState('')
  const [isPendingComplete, setIsPendingComplete] = useState(false)

  // Form data
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [signupSuccess, setSignupSuccess] = useState(false)
  const [successEmail, setSuccessEmail] = useState('')

  const [passwordStrength, setPasswordStrength] = useState({
    lengthOk: false,
    varietyOk: false,
    notCompromised: false,
    noPatterns: false,
    noPersonalInfo: false,
  })

  // Password visibility toggles
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const passwordRequirements = [
    { label: 'Length (8-64 characters)', met: passwordStrength.lengthOk },
    { label: 'Character variety (3+ classes or 15+ chars)', met: passwordStrength.varietyOk },
    { label: 'Not compromised or common', met: passwordStrength.notCompromised },
    { label: 'No common patterns or repetitions', met: passwordStrength.noPatterns },
    { label: 'No personal info (name/email/diversay)', met: passwordStrength.noPersonalInfo },
  ]

  // 3 groups for font cycling:
  // Group 0: "New" (word index 0)
  // Group 1: "user?" (word index 1)
  // Group 2: "Sign up here" (word indexes 2, 3, 4)
  const GROUPS = [
    [0],             // "New"
    [1],             // "user?"
    [2, 3, 4],       // "Sign up here"
  ]

  const [groupFonts, setGroupFonts] = useState(() => [
    Math.floor(Math.random() * FONTS.length),
    Math.floor(Math.random() * FONTS.length),
    Math.floor(Math.random() * FONTS.length),
  ])
  const [activeColorIdx, setActiveColorIdx] = useState(0)

  useEffect(() => {
    setIsReady(true)
  }, [])

  const renderHeading = () => {
    if (!isReady) return null

    return (
      <span className="text-white" style={{ fontFamily: '"Playfair Display", Georgia, serif', fontWeight: 700, fontStyle: 'normal' }}>
        New user? Sign up here
      </span>
    )
  }

  // Success message typing animation with realistic timing variance
  useEffect(() => {
    if (!signupSuccess) return

    // Vary typing speed per letter (simulating human layout lag/typing speed)
    const delay = Math.max(30, Math.random() * 110)
    const timer = setTimeout(() => {
      if (successText.length < SUCCESS_TEXT.length) {
        setSuccessText(SUCCESS_TEXT.slice(0, successText.length + 1))
      } else if (!isSuccessTextComplete) {
        setIsSuccessTextComplete(true)
      }
    }, delay)
    return () => clearTimeout(timer)
  }, [successText, signupSuccess, isSuccessTextComplete])

  // Show check animation after success text completes
  useEffect(() => {
    if (isSuccessTextComplete && !showCheckAnimation) {
      const timer = setTimeout(() => {
        setShowCheckAnimation(true)
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [isSuccessTextComplete, showCheckAnimation])

  // Pending text typing animation with realistic speed variance
  useEffect(() => {
    if (!showCheckAnimation) return

    const delay = Math.max(30, Math.random() * 90)
    const timer = setTimeout(() => {
      if (pendingText.length < PENDING_TEXT.length) {
        setPendingText(PENDING_TEXT.slice(0, pendingText.length + 1))
      } else {
        setIsPendingComplete(true)
      }
    }, delay)
    return () => clearTimeout(timer)
  }, [pendingText, showCheckAnimation])

  // Validate password strength in real-time against standard criteria
  useEffect(() => {
    if (!password) {
      setPasswordStrength({
        lengthOk: false,
        varietyOk: false,
        notCompromised: false,
        noPatterns: false,
        noPersonalInfo: false,
      })
      return
    }

    const lowercasePassword = password.toLowerCase()

    // 1. Length Check (8 to 64 characters)
    const lengthOk = password.length >= 8 && password.length <= 64

    // 2. Character Variety (at least 3 of: lowercase, uppercase, number, symbol OR length >= 15)
    const hasLowercase = /[a-z]/.test(password)
    const hasUppercase = /[A-Z]/.test(password)
    const hasDigit = /[0-9]/.test(password)
    const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)

    const varietyCount = [hasLowercase, hasUppercase, hasDigit, hasSymbol].filter(Boolean).length
    const varietyOk = varietyCount >= 3 || password.length >= 15

    // 3. Compromised / Common Dictionary check
    const compromisedList = [
      'password', 'password123', '123456', '12345678', '123456789', 'qwerty',
      'admin', 'admin123', 'welcome', 'letmein', 'secret', 'security',
      'diversay', 'account', 'login', 'signup', 'database', 'guest',
      'master', 'access', 'change', 'default', 'iloveyou'
    ]
    const notCompromised = !compromisedList.includes(lowercasePassword)

    // 4. Common patterns (repeated characters or keyboard/alphabetical sequences)
    // Repeated characters: e.g. "aaaa" (4 or more repeated characters)
    const hasRepeated = /(.)\1{3,}/.test(password)

    // Keyboard sequences or common alphabetical sequences (length 5 or more)
    const commonSequences = ['qwerty', 'asdfgh', 'zxcvbn', '12345', 'abcde']
    let hasSequence = false
    for (const seq of commonSequences) {
      if (lowercasePassword.includes(seq)) {
        hasSequence = true
        break
      }
    }

    // Check general alphabetical sequence (e.g. abcd) or numerical sequence (e.g. 1234) of length 4
    if (!hasSequence) {
      for (let i = 0; i < password.length - 3; i++) {
        const char1 = password.charCodeAt(i)
        const char2 = password.charCodeAt(i + 1)
        const char3 = password.charCodeAt(i + 2)
        const char4 = password.charCodeAt(i + 3)

        // Ascending sequence (e.g. a-b-c-d or 1-2-3-4)
        if (char2 === char1 + 1 && char3 === char2 + 1 && char4 === char3 + 1) {
          hasSequence = true
          break
        }
        // Descending sequence (e.g. d-c-b-a or 4-3-2-1)
        if (char2 === char1 - 1 && char3 === char2 - 1 && char4 === char3 - 1) {
          hasSequence = true
          break
        }
      }
    }
    const noPatterns = !hasRepeated && !hasSequence

    // 5. Personal / Contextual Info Check
    let hasPersonalInfo = false

    // Check website name "diversay"
    if (lowercasePassword.includes('diversay')) {
      hasPersonalInfo = true
    }

    // Check username (longer than 2 characters)
    if (username) {
      const nameParts = username.toLowerCase().split(/\s+/).filter(part => part.length >= 3)
      for (const part of nameParts) {
        if (lowercasePassword.includes(part)) {
          hasPersonalInfo = true
          break
        }
      }
    }

    // Check username from email
    if (email) {
      const emailParts = email.toLowerCase().split('@')
      if (emailParts[0] && emailParts[0].length >= 3) {
        if (lowercasePassword.includes(emailParts[0])) {
          hasPersonalInfo = true
        }
      }
    }
    const noPersonalInfo = !hasPersonalInfo

    setPasswordStrength({
      lengthOk,
      varietyOk,
      notCompromised,
      noPatterns,
      noPersonalInfo,
    })
  }, [password, username, email])

  const isPasswordStrong =
    passwordStrength.lengthOk &&
    passwordStrength.varietyOk &&
    passwordStrength.notCompromised &&
    passwordStrength.noPatterns &&
    passwordStrength.noPersonalInfo

  const passwordsMatch = password && confirmPassword && password === confirmPassword
  const passwordsMismatch = password && confirmPassword && password !== confirmPassword

  const isFormValid =
    username.trim() !== '' &&
    email.trim() !== '' &&
    isPasswordStrong &&
    passwordsMatch

  const handleSignup = async (e) => {
    e.preventDefault()

    if (!isFormValid) {
      setError('Please fill in all fields correctly')
      return
    }

    try {
      setError('')
      setIsLoading(true)
      const result = await signup(email, password, username)

      if (result.success) {
        setSignupSuccess(true)
        setSuccessEmail(email)
      } else {
        setError(result.error || 'Signup failed. Please try again.')
      }
    } catch (err) {
      setError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Success screen
  if (signupSuccess) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-900 p-4">
        {/* Success Container */}
        <div className="w-full max-w-md text-center">
          {/* Success message with typing animation */}
          <h1 className="text-3xl md:text-4xl font-light text-white leading-tight mb-2" style={{ fontFamily: '"Merriweather", serif', fontWeight: 300, letterSpacing: '-0.02em' }}>
            {successText}
            {!isSuccessTextComplete && (
              <span className="inline-block ml-0.5 w-[2px] h-[1.15em] bg-green-400 animate-pulse align-middle" />
            )}
          </h1>

          {/* Animated Check Circle */}
          {showCheckAnimation && (
            <div className="flex justify-center my-6">
              <div className="relative w-16 h-16">
                <style>{`
                  @keyframes checkCircleGrow {
                    0% {
                      stroke-dasharray: 189;
                      stroke-dashoffset: 189;
                    }
                    100% {
                      stroke-dasharray: 189;
                      stroke-dashoffset: 0;
                    }
                  }
                  @keyframes checkMark {
                    0% {
                      stroke-dasharray: 35;
                      stroke-dashoffset: 35;
                    }
                    100% {
                      stroke-dasharray: 35;
                      stroke-dashoffset: 0;
                    }
                  }
                  .check-circle {
                    animation: checkCircleGrow 0.8s cubic-bezier(0.65, 0, 0.45, 1) forwards;
                    stroke-dasharray: 189;
                    stroke-dashoffset: 189;
                  }
                  .check-mark {
                    animation: checkMark 0.5s cubic-bezier(0.65, 0, 0.45, 1) 0.7s forwards;
                    stroke-dasharray: 35;
                    stroke-dashoffset: 35;
                  }
                `}</style>
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="32" cy="32" r="30" stroke="#10b981" strokeWidth="3" className="check-circle" strokeLinecap="round" />
                  <path d="M20 32L28 40L44 24" stroke="#10b981" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" className="check-mark" />
                </svg>
              </div>
            </div>
          )}

          {/* Pending text */}
          {showCheckAnimation && (
            <p className="text-lg text-gray-300 mt-8" style={{ fontFamily: '"Merriweather", serif', fontWeight: 300 }}>
              {pendingText}
              {!isPendingComplete && (
                <span className="inline-block ml-0.5 w-[2px] h-[1.15em] bg-green-400 animate-pulse align-middle" />
              )}
            </p>
          )}

          {/* Redirect to login after animations complete */}
          {isPendingComplete && (
            <div className="mt-8 space-y-4 animate-fadeIn">
              <button
                onClick={() => navigate('/login?role=viewer', {
                  state: {
                    skipSplash: true,
                    autofillEmail: email,
                    autofillPassword: password
                  }
                })}
                className="w-full px-6 py-3 bg-gray-200 text-gray-900 rounded-lg font-medium hover:bg-white transition-all"
              >
                Go to Login
              </button>
              <p className="text-xs text-gray-500">Powered by Diversay Solutions @2025</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-zinc-900 p-4">
      {/* Main content container */}
      <div className="flex-1 flex items-center justify-center py-12 pt-20">
        <div className="w-full max-w-xl text-center">
          {/* Font-cycling heading */}
          <h1
            className="text-4xl md:text-5xl leading-[1.25] mb-4 text-white animate-fadeIn"
            style={{ letterSpacing: '-0.01em', minHeight: '3.75rem' }}
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

              {/* Divider */}
              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-600"></div>
                </div>
              </div>

              {/* Already have account link - positioned on divider */}
              <p className="text-sm text-gray-300 -mt-4">
                Already have an account?{' '}
                <button
                  onClick={() => navigate('/login', { state: { skipSplash: true } })}
                  className="underline hover:text-white transition-colors cursor-pointer bg-transparent border-none p-0 font-normal outline-none"
                >
                  Sign in here
                </button>
              </p>

              {/* Signup form */}
              <form onSubmit={handleSignup} className="space-y-4">
                {/* Username input */}
                <input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-gray-800 text-white placeholder-gray-500 border border-gray-700 rounded-lg focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-600 transition-all"
                />

                {/* Email input */}
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-gray-800 text-white placeholder-gray-500 border border-gray-700 rounded-lg focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-600 transition-all"
                />

                {/* Password input */}
                <div>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full px-4 py-3 bg-gray-800 text-white placeholder-gray-500 border border-gray-700 rounded-lg focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-600 transition-all pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>

                  {/* Password Strength Indicators */}
                  {password && !isPasswordStrong && (
                    <div className="mt-3 text-left bg-zinc-950/30 p-3 rounded-lg border border-zinc-800 space-y-1.5 animate-fadeIn">
                      {passwordRequirements.map((req, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className={`text-sm ${req.met ? 'text-green-500 font-bold' : 'text-gray-500'}`}>
                            {req.met ? '✓' : '○'}
                          </span>
                          <span className={`text-sm transition-all duration-300 ${req.met ? 'text-gray-300' : 'text-gray-500'}`}>
                            {req.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Confirm Password input */}
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className={`w-full px-4 py-3 bg-gray-800 text-white placeholder-gray-500 border rounded-lg focus:outline-none focus:ring-1 transition-all pr-12 ${passwordsMismatch
                        ? 'border-red-600 focus:border-red-500 focus:ring-red-600'
                        : 'border-gray-700 focus:border-gray-500 focus:ring-gray-600'
                      }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>

                {/* Password match feedback */}
                {confirmPassword && (
                  <p className={`text-xs ${passwordsMismatch ? 'text-red-500' : passwordsMatch ? 'text-green-500' : 'text-gray-500'}`}>
                    {passwordsMismatch ? '✗ Passwords do not match' : passwordsMatch ? '✓ Passwords match' : ''}
                  </p>
                )}

                {/* Error message */}
                {error && (
                  <p className="text-red-400 text-xs">{error}</p>
                )}

                {/* Sign Up button */}
                <button
                  type="submit"
                  disabled={!isFormValid || isLoading}
                  className="w-full px-4 py-3 bg-gray-200 text-gray-900 rounded-lg font-medium hover:bg-white transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Signing up...' : 'Sign Up'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Footer - sits below everything */}
      <div className="text-center py-4">
        <p className="text-xs text-gray-700 opacity-70">Powered by Diversay Solutions @2025</p>
      </div>
    </div>
  )
}


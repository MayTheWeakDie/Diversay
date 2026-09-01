import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

// ── Funny quips based on time of day ──────────────────────────────────────
const MORNING_QUIPS = [
  "rise and grind! ☕",
  "early bird catches the orders! 🐦",
  "the logistics never sleep, huh? 😄",
  "coffee first, dashboard later? ☕",
  "time to move some goods! 📦",
]

const AFTERNOON_QUIPS = [
  "not yet tired, are you? 💪",
  "still keeping the wheels turning! 🚛",
  "halfway through, you've got this! 🔥",
  "lunch break's over, let's go! 🍔",
  "the afternoon hustle is real! ⚡",
]

const EVENING_QUIPS = [
  "burning the midnight oil? 🌙",
  "dedication at its finest! ✨",
  "the night shift hero! 🦸",
  "still here? That's commitment! 🫡",
  "wrapping up the day strong! 💫",
]

const NIGHT_QUIPS = [
  "the real ones work at night! 🌟",
  "can't stop, won't stop! 🚀",
  "you deserve a raise for this! 😅",
  "even the orders are sleeping! 😴",
  "dedication level: legendary! 🏆",
]

function getGreetingData() {
  const hour = new Date().getHours()

  if (hour >= 5 && hour < 12) {
    return {
      greeting: 'Good morning',
      quip: MORNING_QUIPS[Math.floor(Math.random() * MORNING_QUIPS.length)],
    }
  } else if (hour >= 12 && hour < 17) {
    return {
      greeting: 'Good afternoon',
      quip: AFTERNOON_QUIPS[Math.floor(Math.random() * AFTERNOON_QUIPS.length)],
    }
  } else if (hour >= 17 && hour < 21) {
    return {
      greeting: 'Good evening',
      quip: EVENING_QUIPS[Math.floor(Math.random() * EVENING_QUIPS.length)],
    }
  } else {
    return {
      greeting: 'Hello',
      quip: NIGHT_QUIPS[Math.floor(Math.random() * NIGHT_QUIPS.length)],
    }
  }
}

// ── Timing constants (ms) ─────────────────────────────────────────────────
const GLOW_WARMUP = 600     // glow edges warm up
const TYPE_DELAY = GLOW_WARMUP + 200
const TYPE_SPEED = 48      // ms per character
const PAUSE_AFTER_TYPE = 5000    // hold the full text
const LETTER_FLY_STAGGER = 30   // ms between each letter starting to fly
const LETTER_FLY_DURATION = 700  // ms for each letter's flight
const FADE_OUT_DELAY = 600     // after letters land, fade overlay out

// ── Component ──────────────────────────────────────────────────────────────
export default function DashboardWelcome({ userName, onComplete, onLeave }) {
  // glow → typing → hold → leaving
  const [phase, setPhase] = useState('glow')
  const [displayedText, setDisplayedText] = useState('')
  const [cursorVisible, setCursorVisible] = useState(true)
  const [overlayFading, setOverlayFading] = useState(false)
  const [showBlueGlow, setShowBlueGlow] = useState(false)

  const greetingRef = useRef(getGreetingData())
  const completeRef = useRef(onComplete)
  const leaveRef = useRef(onLeave)
  const sourceRef = useRef(null)

  useEffect(() => { completeRef.current = onComplete }, [onComplete])
  useEffect(() => { leaveRef.current = onLeave }, [onLeave])

  const displayName = userName || 'Admin'
  const { greeting, quip } = greetingRef.current
  const greetingPart = `${greeting}, ${displayName}`
  const quipPart = `, ${quip}`
  const fullText = `${greetingPart}${quipPart}`

  // ── Cursor blink ────────────────────────────────────────────────────────
  useEffect(() => {
    const blink = setInterval(() => setCursorVisible(v => !v), 530)
    return () => clearInterval(blink)
  }, [])

  // ── Main animation sequencer ────────────────────────────────────────────
  useEffect(() => {
    const timers = []
    // 0. Transition from multi-color electron glow to blue glow after 5 seconds
    timers.push(setTimeout(() => setShowBlueGlow(true), 5000))

    // 1. After glow warmup → start typing
    timers.push(setTimeout(() => setPhase('typing'), TYPE_DELAY))

    // 2. Type characters one by one
    for (let i = 0; i <= fullText.length; i++) {
      timers.push(setTimeout(() => {
        setDisplayedText(fullText.slice(0, i))
      }, TYPE_DELAY + i * TYPE_SPEED))
    }

    const typingDone = TYPE_DELAY + fullText.length * TYPE_SPEED

    // 3. Hold the text for a moment
    timers.push(setTimeout(() => setPhase('hold'), typingDone))

    // 4. Trigger leave transition
    timers.push(setTimeout(() => {
      setPhase('leaving')
      if (leaveRef.current) leaveRef.current()
      setOverlayFading(true)

      // 5. Complete and unmount after fade-out transition
      setTimeout(() => {
        if (completeRef.current) completeRef.current()
      }, FADE_OUT_DELAY)

    }, typingDone + PAUSE_AFTER_TYPE))

    return () => timers.forEach(clearTimeout)
  }, [fullText])

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        backgroundColor: '#18181b',
        opacity: overlayFading ? 0 : 1,
        transition: `opacity ${FADE_OUT_DELAY}ms ease-out`,
        pointerEvents: overlayFading ? 'none' : 'auto',
      }}
    >
      {/* ── Inline styles ── */}
      <style>{`
        /* ── Fast Electron Multi-color Border ── */
        .electron-border-container {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 3;
          opacity: 1;
          transition: opacity 0.8s ease-in-out;
        }
        .electron-border-container.inactive {
          opacity: 0;
        }
        .electron-glow-border {
          position: absolute;
          inset: 0;
          padding: 3.5px;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          overflow: hidden;
        }
        .electron-rotator {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 220vmax;
          height: 220vmax;
          transform: translate(-50%, -50%);
          background: conic-gradient(
            from 0deg,
            #ef4444 0%,
            #fbbf24 8%,
            #10b981 16%,
            #3b82f6 24%,
            transparent 30%,
            transparent 100%
          );
          animation: fastRotate 2.0s linear infinite;
        }
        @keyframes fastRotate {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to { transform: translate(-50%, -50%) rotate(360deg); }
        }

        /* ── Blue Neon Glow Thin Line Border ── */
        .blue-border-container {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 2;
          opacity: 0;
          transition: opacity 1.0s ease-in-out;
          border: 3.5px solid rgba(59, 130, 246, 0.65);
          box-shadow: inset 0 0 32px rgba(59, 130, 246, 0.5), 0 0 32px rgba(59, 130, 246, 0.5);
          animation: neonPulse 4s ease-in-out infinite;
        }
        .blue-border-container.active {
          opacity: 1;
        }
        @keyframes neonPulse {
          0%, 100% {
            border-color: rgba(59, 130, 246, 0.55);
            box-shadow: inset 0 0 24px rgba(59, 130, 246, 0.4), 0 0 24px rgba(59, 130, 246, 0.4);
          }
          50% {
            border-color: rgba(59, 130, 246, 0.75);
            box-shadow: inset 0 0 45px rgba(59, 130, 246, 0.65), 0 0 45px rgba(59, 130, 246, 0.65);
          }
        }
      `}</style>

      {/* ── Multi-color Fast Electron Border ── */}
      <div className={`electron-border-container ${showBlueGlow ? 'inactive' : ''}`}>
        <div className="electron-glow-border">
          <div className="electron-rotator" />
        </div>
      </div>

      {/* ── Soft Blue Neon Line Border ── */}
      <div className={`blue-border-container ${showBlueGlow ? 'active' : ''}`} />

      {/* ── Source greeting text ── */}
      <div
        style={{
          position: 'absolute',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 10,
          whiteSpace: 'normal',
          maxWidth: '90vw',
        }}
      >
        <h1
          ref={sourceRef}
          style={{
            fontFamily: '"Lora", Georgia, serif',
            fontStyle: 'normal',
            fontSize: 'clamp(1.8rem, 4vw, 3.2rem)',
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: '-0.01em',
            lineHeight: 1.35,
            textAlign: 'center',
            textShadow: 'none',
          }}
        >
          {displayedText}
          {/* Blinking cursor */}
          {(phase === 'typing' || phase === 'hold') && (
            <span
              style={{
                display: 'inline-block',
                width: '3px',
                height: '1em',
                backgroundColor: '#ffffff',
                marginLeft: '6px',
                verticalAlign: 'text-bottom',
                opacity: cursorVisible ? 1 : 0,
                transition: 'opacity 0.1s',
              }}
            />
          )}
        </h1>
      </div>
    </div>,
    document.body
  )
}

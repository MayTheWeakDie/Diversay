import React, { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { User, Menu } from 'lucide-react'
import FlipClock from './FlipClock'

export default function TopBar({ hideGreeting = false, onMenuToggle }) {
  const { user } = useAuth()
  const [greeting, setGreeting] = useState('')
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const updateGreeting = () => {
      const hour = new Date().getHours()
      let greetingText = 'Hello'

      if (hour >= 5 && hour < 12) {
        greetingText = 'Good morning'
      } else if (hour >= 12 && hour < 17) {
        greetingText = 'Good afternoon'
      } else if (hour >= 17 && hour < 21) {
        greetingText = 'Good evening'
      } else {
        greetingText = 'Hello'
      }

      setGreeting(greetingText)
    }

    updateGreeting()
    const interval = setInterval(updateGreeting, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000)
    return () => clearInterval(timer)
  }, [])

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const rawName = user?.full_name && user.full_name !== 'LogX Engine' && user.full_name !== 'LogX' ? user.full_name : 'Grace'
  const userName = rawName.split(' ')[0]
  const fullGreeting = `${greeting}, ${userName}`

  return (
    <div className="bg-zinc-900 border-b border-zinc-800/70 sticky top-0 z-20">
      <div className="flex items-center justify-between pl-2 pr-6 py-4">

        {/* Left side - Human User Greeting and Date */}
        <div className="flex items-center gap-4">
          {/* Mobile Menu Toggle */}
          <button
            onClick={onMenuToggle}
            className="md:hidden p-2.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-zinc-600 text-zinc-300 flex-shrink-0 active:scale-95 transition-all"
            aria-label="Open Sidebar"
          >
            <Menu size={20} />
          </button>

          {/* User Avatar */}
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0 shadow-md shadow-cyan-500/10">
            <User size={28} className="text-white" />
          </div>

          {/* Greeting and Date */}
          <div>
            <h2
              id="topbar-greeting"
              className="text-2xl font-bold text-white flex items-center gap-2"
              style={{
                visibility: hideGreeting ? 'hidden' : 'visible',
                fontFamily: '"Lora", Georgia, serif',
                fontStyle: 'normal'
              }}
            >
              <span>
                {fullGreeting.split('').map((char, i) => (
                  <span key={i} data-topbar-char={i}>
                    {char}
                  </span>
                ))}
              </span>
            </h2>
            <p className="text-zinc-400 text-sm mt-0.5">
              {formatDate(currentTime)}
            </p>
          </div>
        </div>

        {/* Middle - Workday Countdown Flip Clock */}
        <FlipClock />

        {/* Right side spacer to keep FlipClock centered */}
        <div className="hidden sm:block w-[180px]" />

      </div>
    </div>
  )
}

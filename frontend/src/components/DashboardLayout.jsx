import React, { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import AccessGrantedPopup from './AccessGrantedPopup'
import AccessRevokedPopup from './AccessRevokedPopup'
import AIChatWidget from './AIChatWidget'

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 flex flex-col" style={{ fontFamily: '"Lora", Georgia, serif' }}>
      {/* TopBar with mobile menu toggle */}
      <TopBar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />

      {/* Container below TopBar */}
      <div className="flex flex-1 relative">
        {/* Sidebar component */}
        <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

        {/* Spacer to push content since sidebar is fixed on desktop */}
        <div className={`hidden md:block transition-all duration-300 flex-shrink-0 ${sidebarOpen ? 'w-48' : 'w-16'}`} />

        {/* Main Content Area */}
        <main className="flex-1 p-8 max-w-7xl mx-auto w-full">
          <Outlet />
        </main>
      </div>

      {/* Global popup for access notifications */}
      <AccessGrantedPopup />
      <AccessRevokedPopup />

      {/* Floating AI Chat Widget */}
      <AIChatWidget />
    </div>
  )
}

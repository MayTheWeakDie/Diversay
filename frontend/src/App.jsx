import React, { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardLayout from './components/DashboardLayout'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import PendingApprovalPage from './pages/PendingApprovalPage'
import AdminApprovalsPage from './pages/AdminApprovalsPage'
import DashboardPage from './pages/DashboardPage'
import OrdersPage from './pages/OrdersPage'
import OrderDetailPage from './pages/OrderDetailPage'
import CustomersPage from './pages/CustomersPage'
import ManageCustomersPage from './pages/ManageCustomersPage'
import CustomerDetailPage from './pages/CustomerDetailPage'
import StorePage from './pages/StorePage'
import StoreDetailPage from './pages/StoreDetailPage'
import StoreTrendingPage from './pages/StoreTrendingPage'
import SplashPage from './pages/SplashPage'
import RequestAccessPage from './pages/RequestAccessPage'
import WeeklyCustomersPage from './pages/WeeklyCustomersPage'
import GlobalAnalyticsPage from './pages/GlobalAnalyticsPage'

const ScanUploadPage = lazy(() => import('./pages/ScanUploadPage'))

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/pending-approval" element={<PendingApprovalPage />} />
          <Route 
            path="/scan/:sessionId" 
            element={
              <Suspense fallback={<div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">Loading scanner...</div>}>
                <ScanUploadPage />
              </Suspense>
            } 
          />
          
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/admin/approvals" element={<AdminApprovalsPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/orders/:id" element={<OrderDetailPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/customers/view" element={<ManageCustomersPage />} />
              <Route path="/customers/:id" element={<CustomerDetailPage />} />
              <Route path="/weekly-customers" element={<WeeklyCustomersPage />} />
              <Route path="/store" element={<StorePage />} />
              <Route path="/store/:id" element={<StoreDetailPage />} />
              <Route path="/store/:id/trending" element={<StoreTrendingPage />} />
              <Route path="/analytics/global" element={<GlobalAnalyticsPage />} />
              <Route path="/request-access" element={<RequestAccessPage />} />
            </Route>
          </Route>
          
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App

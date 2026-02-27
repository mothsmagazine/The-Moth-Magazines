import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import FooterNavbarLayout from './layouts/FooterNavbarLayout'
import Read from './pages/Read'
import Admin from './pages/Admin'
import AdminEditor from './pages/AdminEditor'
import FlashRead from './pages/FlashRead'
import AdminFlashEditor from './pages/AdminFlashEditor'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router>
      <Routes>
        {/* Public: blog reader */}
        <Route path="/" element={<FooterNavbarLayout />}>
          <Route index element={<Read />} />
        </Route>

        <Route path="/flash-read/:id" element={<FlashRead />} />

        {/* Admin: manage posts (no navbar links point here) */}
        <Route path="/admin" element={<FooterNavbarLayout />}>
          <Route index element={<Admin />} />
          <Route path="new" element={<AdminEditor />} />
          <Route path="edit/:id" element={<AdminEditor />} />
          <Route path="flash/:id" element={<AdminFlashEditor />} />
        </Route>

        {/* Catch-all 404 */}
        <Route
          path="*"
          element={
            <div style={{ padding: '2rem', textAlign: 'center' }}>
              <h1>404</h1>
              <p>Page not found</p>
            </div>
          }
        />
      </Routes>
    </Router>
  </StrictMode>,
)

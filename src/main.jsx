import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import FooterNavbarLayout from './layouts/FooterNavbarLayout'
import Home from './pages/Home'
import Contact from './pages/Contact'
import Write from './pages/Write'
import Read from './pages/Read'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router>
      <Routes>
        {/* Pages that get both navbar + footer */}
        <Route path="/" element={<FooterNavbarLayout />}>
          <Route index element={<Home />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/write" element={<Write />} />
          <Route path="/read" element={<Read />} />
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

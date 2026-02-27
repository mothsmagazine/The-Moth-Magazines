import { NavLink, Outlet } from 'react-router-dom'
import './FooterNavbarLayout.css'

export default function FooterNavbarLayout() {
  return (
    <div className="layout">
      <nav className="navbar">
        <div className="navbar-brand">The Moths Magazine</div>
        <div className="navbar-links">
          {/* <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Home</NavLink>
          <NavLink to="/contact" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Contact</NavLink> */}
        </div>
      </nav>

      <main className="page-content">
        <Outlet />
      </main>

      <footer className="footer">
        <p>&copy; {new Date().getFullYear()} The Moths Magazine. All rights reserved.</p>
      </footer>
    </div>
  )
}

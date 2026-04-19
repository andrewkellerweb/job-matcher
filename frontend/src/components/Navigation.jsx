import { NavLink } from 'react-router-dom';

const links = [
  { to: '/jobs',   label: 'Job Search', icon: '⌕' },
  { to: '/resume', label: 'Resume',     icon: '📄' },
  { to: '/setup',  label: 'Setup',      icon: '⚙' },
];

export default function Navigation() {
  return (
    <nav className="nav">
      <div className="nav-logo">Job<span> Matcher</span></div>
      {links.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
        >
          <span>{icon}</span>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

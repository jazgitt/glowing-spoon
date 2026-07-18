import { Routes, Route, Navigate, NavLink, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import { ToastProvider } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import NewProject from './pages/NewProject.jsx';
import MissionControl from './pages/MissionControl.jsx';
import OutputBrowser from './pages/OutputBrowser.jsx';
import SessionHistory from './pages/SessionHistory.jsx';
import AdminUsers from './pages/AdminUsers.jsx';

function TopBar() {
  const { user, logout } = useAuth();
  return (
    <header className="topbar">
      <Link to="/" className="brand">
        <span className="spoon">🥄</span> Glowing Spoon
      </Link>
      <nav>
        <NavLink to="/" end>Projects</NavLink>
        {user?.role === 'admin' && <NavLink to="/admin/users">Team</NavLink>}
      </nav>
      <span className="spacer" />
      <span className="who">{user?.email}</span>
      <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
    </header>
  );
}

function Protected({ children }) {
  const { loading, user, needsFirstUser } = useAuth();
  const location = useLocation();
  if (loading) return <div className="auth-wrap"><span style={{ fontSize: 40 }}>🥄</span></div>;
  if (!user) {
    return <Navigate to={needsFirstUser ? '/register' : '/login'} state={{ from: location }} replace />;
  }
  return (
    <>
      <TopBar />
      {children}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<Protected><Dashboard /></Protected>} />
          <Route path="/projects/new" element={<Protected><NewProject /></Protected>} />
          <Route path="/projects/:id" element={<Protected><MissionControl /></Protected>} />
          {/* /files was folded into Mission Control's inline Prep Station — old links land on the project. */}
          <Route path="/projects/:id/files" element={<Navigate to=".." relative="path" replace />} />
          <Route path="/projects/:id/output" element={<Protected><OutputBrowser /></Protected>} />
          <Route path="/projects/:id/history" element={<Protected><SessionHistory /></Protected>} />
          <Route path="/admin/users" element={<Protected><AdminUsers /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}

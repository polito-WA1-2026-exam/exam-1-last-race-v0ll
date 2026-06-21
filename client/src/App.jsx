/*
 * App.jsx — Root component with SPA routing
 * Sets up react-router-dom with a BrowserRouter (the standard for
 * web SPAs).  All navigation between routes happens client-side —
 * the browser never performs a full page reload
 * Route structure:
 *   /         — Home / Instructions (public, but content varies by auth)
 *   /login    — Login form (redirects to /play if already logged in)
 *   /play     — Protected: game arena (placeholder for now)
 *   /ranking  — Protected: leaderboard (placeholder for now)
 * ProtectedRoute is a wrapper component that checks authentication
 * If the user is not logged in, it redirects to /login instead of
 * rendering the protected page
 */
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext.jsx";
import Navbar from "./components/Navbar.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Play from "./pages/Play.jsx";
import Ranking from "./pages/Ranking.jsx";
import "./App.css";
// ProtectedRoute — renders children only if the user is logged in.
// While the initial session check is in progress (loading === true),
// we show a simple loading indicator to avoid an annoying flash of
// the login page before the session cookie is validated
// If loading is done and user is null → redirect to /login
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    // Session check not yet complete — show a minimal loading state
    return (
      <div className="placeholder-page">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  if (!user) {
    // Not authenticated — redirect to login
    // 'replace' prevents the user from going "back" to the protected page
    return <Navigate to="/login" replace />;
  }

  return children;
}

// App component
// Layout:
//   <BrowserRouter>   — enables client-side routing (no page reloads)
//     <Navbar />       — always visible at the top
//     <main>           — where the current route's component renders
//       <Routes>
//         <Route ... />
//       </Routes>
//     </main>
//   </BrowserRouter>
export default function App() {
  return (
    <BrowserRouter>
      {/* Navbar is rendered OUTSIDE <Routes> so it appears on every page without re-mounting. This is a standard SPA pattern. */}
      <Navbar />

      <main className="main-content">

        <Routes>
          <Route path="/" element={<Home />} />

          <Route path="/login" element={<Login />} />

          <Route
            path="/play"
            element={
              <ProtectedRoute>
                <Play />
              </ProtectedRoute>
            }
          />

          <Route
            path="/ranking"
            element={
              <ProtectedRoute>
                <Ranking />
              </ProtectedRoute>
            }
          />

          {/* else, redirect home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

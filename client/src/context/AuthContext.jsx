import { createContext, useContext, useState, useEffect, useCallback } from "react";
const API_BASE = "http://localhost:3000";
const AuthContext = createContext(null);

// Custom hook: useAuth()
// Convenience wrapper so components don't need to import both useContext and AuthContext
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth() must be used inside <AuthProvider>");
  }
  return ctx;
}

// AuthProvider, wraps the entire app and manages auth state
export function AuthProvider({ children }) {
  // user = null means "not logged in yet" (or logged out)
  const [user, setUser] = useState(null);
  // loading = true while we wait for the initial session check
  const [loading, setLoading] = useState(true);

  // Initial session check
  // When the app first loads, we call GET /api/sessions/current
  // to see if a session cookie exists from a previous login
  // credentials: "include" is REQUIRED so the browser sends the
  // session cookie with the cross-origin request (port 5173 → 3000)
  useEffect(() => {
    async function checkSession() {
      try {
        const res = await fetch(`${API_BASE}/api/sessions/current`, {
          credentials: "include",
        });

        if (res.ok) {
          const data = await res.json();
          setUser(data);               // user is logged in
        } else {
          setUser(null);               // no valid session
        }
      } catch (err) {
        // If the server is unreachable, not logged in
        console.error("Session check failed:", err);
        setUser(null);
      } finally {
        setLoading(false);             // initial check complete
      }
    }

    checkSession();
  }, []); // empty deps runs once on mount

  // Sends credentials to POST /api/sessions
  // Passport authenticates, creates a session, and returns the user
  const login = useCallback(async (username, password) => {
    try {
      const res = await fetch(`${API_BASE}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",        // receive the session cookie
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        return { success: false, error: data.error || "Login failed" };
      }

      const data = await res.json();
      setUser(data);                   // update global state
      return { success: true };
    } catch (err) {
      return { success: false, error: "Network error — is the server running?" };
    }
  }, []);

  // Destroys the server session and clears the client state
  // After this, useAuth().user will be null and protected routes will redirect to /login
  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/sessions/current`, {
        method: "DELETE",
        credentials: "include",
      });
    } catch (err) {
      console.error("Logout request failed:", err);
    }
    // Clear user state regardless of server response — the client should not show stale auth info
    setUser(null);
  }, []);

  // Context value: everything components need to know about auth
  const value = { user, loading, login, logout };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;

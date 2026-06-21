import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  
  if (user) { // If already logged in, redirect to /play immediately.
    return <Navigate to="/play" replace />;
  }

  // Handle form submission
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Please enter both username and password.");
      return;
    }

    setSubmitting(true);

    const result = await login(username.trim(), password);

    if (result.success) {
      navigate("/play", { replace: true });
    } else {
      setError(result.error || "Login failed. Try again.");
    }

    setSubmitting(false);
  }

  return (
    <div className="login-page">
      <div className="retro-panel">
        <h1 className="mb-3 text-center">Login</h1>

        <p className="text-muted mb-3 text-center">
          Enter your credentials to play and compete on the leaderboard.
        </p>

        {error && (
          <div className="error-msg mb-2" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>

          <div>
            <label htmlFor="login-username">Username</label>
            <input
              id="login-username"
              className="retro-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              className="retro-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={submitting}
            />
          </div>

          <button
            type="submit"
            className="retro-btn mt-2"
            disabled={submitting}
          >
            {submitting ? "Logging in..." : "▸ Login"}
          </button>
        </form>
      </div>

      <div className="text-center mt-3">
        <p className="text-muted" style={{ fontSize: "16px" }}>
          Demo accounts: <strong>mario</strong>, <strong>luigi</strong>,{" "}
          <strong>toad</strong> &mdash; password: <strong>password123</strong>
        </p>
      </div>
    </div>
  );
}

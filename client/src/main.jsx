/*
 * Mounts the React app into the DOM.  Wraps the entire component tree in:
 *   1. <StrictMode> — React 19 dev-mode checks
 *   2. <AuthProvider> — makes auth state (user, login, logout) available
 *      to every component via the useAuth() hook
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "./context/AuthContext.jsx";
import App from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);

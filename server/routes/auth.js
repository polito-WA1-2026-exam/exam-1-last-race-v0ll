/*
 * Provides three endpoints for session management:
 *   POST   /api/sessions         — login
 *   DELETE /api/sessions/current — logout
 *   GET    /api/sessions/current — check current session
 */
import { Router } from "express";
import passport from "../auth.js";
const router = Router();

// POST /api/sessions — Login
// Accepts { username, password } in the request body.
// Uses Passport's local strategy to verify credentials.
// On success: creates a session cookie and returns the user object.
// On failure: returns 401 with an error message.
router.post("/", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) {
      return res.status(500).json({ error: "Internal server error" });
    }

    if (!user) {
      return res.status(401).json({
        error: info?.message || "Invalid credentials",
      });
    }

    req.login(user, (loginErr) => {
      if (loginErr) {
        return res.status(500).json({ error: "Login failed" });
      }

      // Return the authenticated user's data without the password
      return res.json({
        id: user.id,
        username: user.username,
        best_score: user.best_score,
        games_played: user.games_played,
      });
    });
  })(req, res, next);
});

// DELETE /api/sessions/current — Logout
// Destroys the current session on the server and clears the session cookie on the client.
router.delete("/current", (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }

    // Destroy the session data on the server
    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        return res.status(500).json({ error: "Session destruction failed" });
      }

      
      res.clearCookie("connect.sid"); // Clear the session cookie from the browser
      return res.json({ message: "Logged out successfully." });
    });
  });
});

// GET /api/sessions/current — Check session
// Returns the currently authenticated user, or 401 if not logged in
router.get("/current", (req, res) => {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  return res.json({
    id: req.user.id,
    username: req.user.username,
    best_score: req.user.best_score,
    games_played: req.user.games_played,
  });
});

export default router;

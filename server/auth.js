/*
 * Configures with the "passport-local" strategy so users can
 * log in with a username and password
 *  Uses bcrypt to compare the submitted password against the salted hash stored in the database
 * This file is imported by index.js after session middleware is set up
 */
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import bcrypt from "bcrypt";
import { get } from "./db.js";

passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      // Step 1: find the user in the database
      const user = await get(
        "SELECT id, username, password FROM users WHERE username = ?",
        [username]
      );

      // Step 2: user not found → authentication failed
      if (!user) {
        return done(null, false, { message: "Invalid username or password." });
      }

      // Step 3: compare the provided password with the stored bcrypt hash
      // bcrypt.compare() handles extracting the salt from the hash automatically
      const passwordMatches = await bcrypt.compare(password, user.password);

      if (!passwordMatches) {
        // Step 4: wrong password → authentication failed
        return done(null, false, { message: "Invalid username or password." });
      }

      // Step 5: success! Strip the password hash before storing in session
      // !!we never want the hash to travel in the session cookie
      const safeUser = { id: user.id, username: user.username };
      return done(null, safeUser);
    } catch (err) {
      return done(err);
    }
  })
);

/*
 * Serialization: what data to store in the session cookie
 * After a successful login, Passport calls serializeUser to decide
 * what identifying information should be saved in the session
 * We store just the user ID — the smallest possible fingerprint
 */
passport.serializeUser((user, done) => {
  // user here is the safeUser object we passed to done() above
  done(null, user.id);
});

/*
 * Deserialization: how to reconstruct the user from the session.
 * On every subsequent request, Passport calls deserializeUser with
 * the ID we serialized above. We fetch the current user data from the
 * database so req.user is always fresh
 */
passport.deserializeUser(async (id, done) => {
  try {
    const user = await get(
      "SELECT id, username, best_score, games_played FROM users WHERE id = ?",
      [id]
    );
    // if the user was deleted after login, the session is stale!!
    if (!user) {
      return done(null, false);
    }
    done(null, user);
  } catch (err) {
    done(err);
  }
});

export default passport;

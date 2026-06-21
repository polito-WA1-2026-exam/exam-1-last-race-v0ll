import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// Top navigation bar with conditional links

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="navbar">
      <NavLink to="/" className="navbar__brand">
        <span className="navbar__brand-icon" aria-hidden="true">
          █▓▒░
        </span>
        Last Race
        <span className="navbar__brand-icon" aria-hidden="true">
          ░▒▓█
        </span>
      </NavLink>

      <div className="navbar__links">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `navbar__link${isActive ? " navbar__link--active" : ""}`
          }
        >
          Home
        </NavLink>

        {/*
          ---- ANONYMOUS USER LINKS ----
        */}
        {!user && (
          <NavLink
            to="/login"
            className={({ isActive }) =>
              `navbar__link${isActive ? " navbar__link--active" : ""}`
            }
          >
            Login
          </NavLink>
        )}

        {/*
          ---- LOGGED-IN USER LINKS ----
        */}
        {user && (
          <>
            <NavLink
              to="/play"
              className={({ isActive }) =>
                `navbar__link${isActive ? " navbar__link--active" : ""}`
              }
            >
              Play
            </NavLink>

            <NavLink
              to="/ranking"
              className={({ isActive }) =>
                `navbar__link${isActive ? " navbar__link--active" : ""}`
              }
            >
              Ranking
            </NavLink>

            {/*
              Display the username as a non-clickable indicator
              so the player knows who they're logged in as.
            */}
            <span className="navbar__link" style={{ cursor: "default", opacity: 0.7 }}>
              [{user.username}]
            </span>

            {/*
              Logout button.  Calls the logout() function from AuthContext
              which destroys the session and resets the user state.
              Uses a regular <button> (not NavLink) because it's an action,
              not a route change.
            */}
            <button
              onClick={logout}
              className="retro-btn retro-btn--small retro-btn--danger"
              type="button"
            >
              Logout
            </button>
          </>
        )}
      </div>
    </nav>
  );
}

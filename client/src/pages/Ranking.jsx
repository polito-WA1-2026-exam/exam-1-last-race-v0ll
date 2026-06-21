/*
 *   loading — shows a spinner/loading message while fetching
 *   error   — shows an error message with retry option
 *   empty   — shows a message when no games have been played yet
 *   data    — renders the leaderboard table
 */
import { useState, useEffect } from "react";
const API_BASE = "http://localhost:3000";

export default function Ranking() {
  const [rankingData, setRankingData] = useState([]); // rankingData: array of {username, best_score, games_played}
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false; // prevent state update after unmount

    async function fetchRanking() {
      setLoading(true);
      setError("");

      try {
        const res = await fetch(`${API_BASE}/api/ranking`, {
          credentials: "include",
        });

        if (!res.ok) {
          throw new Error("Failed to load ranking.");
        }

        const data = await res.json();

        if (!cancelled) {
          setRankingData(data.ranking || []);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Ranking fetch error:", err);
          setError("Could not load the leaderboard. Is the server running?");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchRanking();

    // Cleanup: if the component unmounts before the fetch completes
    // the cancelled flag prevents a "setState on unmounted component" warning
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="placeholder-page">
        <div className="retro-panel">
          <h2 className="mb-2">Loading Leaderboard...</h2>
          <p className="text-muted">Fetching the best racers.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="placeholder-page">
        <div className="retro-panel">
          <h2 className="text-danger mb-2">Error</h2>
          <p className="text-muted mb-2">{error}</p>
          <button
            className="retro-btn retro-btn--small"
            type="button"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (rankingData.length === 0) {
    return (
      <div className="placeholder-page">
        <div className="retro-panel">
          <h1 className="mb-2" style={{ fontSize: "20px" }}>
            Leaderboard
          </h1>
          <p className="text-muted mb-2">
            No races have been completed yet!
          </p>
          <p className="text-muted">
            Play a game to be the first on the leaderboard.
          </p>
        </div>
      </div>
    );
  }

  // Displays a retro-styled ranking table with position, username, best score, and games played
  return (
    <div>
      <div className="text-center mb-3">
        <h1 className="mb-2">Leaderboard</h1>
        <p className="text-muted">Top racers in the underground</p>
      </div>

      <div className="retro-panel">
        <div className="ranking-table-wrap">
          <table className="ranking-table">
            <thead>
              <tr>
                <th className="ranking-table__rank">#</th>
                <th className="ranking-table__name">Racer</th>
                <th className="ranking-table__score">Best Score</th>
                <th className="ranking-table__games">Games</th>
              </tr>
            </thead>
            <tbody>
              {rankingData.map((entry, index) => {
                let rankClass = "";
                let rankIcon = index + 1;
                if (index === 0) {
                  rankClass = "ranking-table__rank--gold";
                  rankIcon = "🥇";
                } else if (index === 1) {
                  rankClass = "ranking-table__rank--silver";
                  rankIcon = "🥈";
                } else if (index === 2) {
                  rankClass = "ranking-table__rank--bronze";
                  rankIcon = "🥉";
                }

                return (
                  <tr
                    key={entry.username}
                    className={
                      index < 3 ? "ranking-table__row--top" : ""
                    }
                  >
                    <td className={`ranking-table__rank ${rankClass}`}>
                      {rankIcon}
                    </td>
                    <td className="ranking-table__name">
                      {entry.username}
                    </td>
                    <td className="ranking-table__score">
                      {entry.best_score}
                    </td>
                    <td className="ranking-table__games">
                      {entry.games_played}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

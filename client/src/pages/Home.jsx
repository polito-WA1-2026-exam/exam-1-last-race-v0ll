import {Link} from "react-router-dom";
import {useAuth} from "../context/AuthContext.jsx";

export default function Home() {
  const {user} = useAuth();

  return (
    <div className="instructions">
      {user ? (
        <h1 className="mb-3">Welcome back, {user.username}!</h1>
      ) : (
        <h1 className="mb-3">Last Race</h1>
      )}

      <p className="text-muted mb-3">
        An 8-bit underground racing game — navigate the metro, dodge pixel
        bosses, and reach your destination with the most coins!
      </p>

      <div className="retro-panel mb-3">
        <h2 className="mb-2">How to Play</h2>

        <h3>1. Setup</h3>
        <p>
          View the full underground network map.  Study the lines, stations,
          and interchanges.  When you're ready, start the game.
        </p>

        <h3>2. Planning (90 seconds)</h3>
        <p>
          The server assigns you a random starting station and destination
          (at least 3 segments apart).  You see a scrambled list of all
          connected station pairs — but without the line colors!  Your job
          is to mentally reconstruct the network and build a valid route
          by selecting segments in sequence.
        </p>

        <h3>3. Execution</h3>
        <p>
          Each segment triggers a random 8-bit event (positive or negative
          coins).  Watch your coin total change step by step!  If your
          route is invalid, you lose all 20 starting coins.
        </p>

        <h3>4. Result</h3>
        <p>
          See your final score.  Can you beat the leaderboard?
        </p>
      </div>

      <div className="retro-panel mb-3">
        <h2 className="mb-2">Rules</h2>
        <ul>
          <li>You start with <span className="text-accent">20 coins</span>.</li>
          <li>Each segment triggers a random event (-4 to +4 coins).</li>
          <li>You <strong>cannot</strong> travel the same segment twice.</li>
          <li>You <strong>can</strong> visit the same station multiple times.</li>
          <li>Line changes are only allowed at <em>interchange stations</em>.</li>
          <li>If your route is invalid, your score is 0.</li>
          <li>Negative final scores are stored as 0.</li>
        </ul>
      </div>

      {user ? (
        <div className="text-center mt-3">
          <Link to="/play" className="retro-btn">
            ▸ Play Now!
          </Link>
        </div>
      ) : (
        <div className="text-center mt-3">
          <p className="text-muted mb-2">
            Log in to start playing and compete on the leaderboard.
          </p>
          <Link to="/login" className="retro-btn">
            Login to Play
          </Link>
        </div>
      )}
    </div>
  );
}

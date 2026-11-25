import { useMotherDuck } from '../hooks/useMotherDuck';
import { useState, useEffect } from 'react';

interface MotherDuckConnectProps {
  onConnect?: () => void;
  compact?: boolean;
}

export function MotherDuckConnect({ onConnect, compact = false }: MotherDuckConnectProps) {
  const { connect, isConnected, error, isInitialized } = useMotherDuck();
  const [token, setToken] = useState('');

  if (isConnected) return null;

  const handleConnect = () => {
    connect(token).then(() => {
      onConnect?.();
    });
  };

  // Clear error when user starts typing
  useEffect(() => {
    if (token && error) {
      // Error will be cleared by connect() call
    }
  }, [token, error]);

  if (compact) {
    return (
      <div className="motherduck-connect motherduck-connect--compact">
        <input
          type="password"
          placeholder="MotherDuck token"
          value={token}
          onChange={e => setToken(e.target.value)}
          disabled={isInitialized}
          aria-label="MotherDuck service token"
        />
        <button
          onClick={handleConnect}
          disabled={!token || isInitialized}
          className="motherduck-connect__btn"
        >
          {isInitialized ? 'Connecting…' : 'Connect'}
        </button>
        {error && <span className="motherduck-connect__error" role="alert">{error}</span>}
      </div>
    );
  }

  return (
    <div className="motherduck-connect">
      <h3>Connect to MotherDuck Analytics</h3>
      <p>
        Enter a scoped MotherDuck token to enable centralized analytics.
        Your survey responses will be synced to the cloud automatically.
      </p>

      <div className="motherduck-connect__form">
        <label htmlFor="md-token" className="motherduck-connect__label">
          MotherDuck Service Token
        </label>
        <input
          id="md-token"
          type="password"
          placeholder="Paste MotherDuck service token here"
          value={token}
          onChange={e => setToken(e.target.value)}
          disabled={isInitialized}
          autoComplete="off"
        />
        <button
          onClick={handleConnect}
          disabled={!token || isInitialized}
          className="motherduck-connect__btn motherduck-connect__btn--primary"
        >
          {isInitialized ? 'Connecting…' : 'Connect'}
        </button>
      </div>

      {error && (
        <div className="motherduck-connect__error" role="alert">
          ❌ {error}
        </div>
      )}

      <details className="motherduck-connect__help">
        <summary>How to get a token</summary>
        <ol>
          <li>Log into <a href="https://app.motherduck.com" target="_blank" rel="noopener">MotherDuck UI</a></li>
          <li>Go to Settings → Tokens → Create Scoped Token</li>
          <li>Select role: <code>survey_writer</code></li>
          <li>Copy token and paste above</li>
        </ol>
      </details>

      <div className="motherduck-connect__note">
        <strong>Security:</strong> This token has INSERT-only permissions on survey tables.
        It cannot read, modify, or delete existing data. Token expires 2027-12-31.
      </div>
    </div>
  );
}
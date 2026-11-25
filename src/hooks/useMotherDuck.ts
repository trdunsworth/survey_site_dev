import { MDConnection } from '@motherduck/wasm-client';
import { useCallback, useEffect, useState } from 'react';

interface MotherDuckState {
  connection: MDConnection | null;
  isInitialized: boolean;
  isConnected: boolean;
  error: string | null;
}

export function useMotherDuck() {
  const [state, setState] = useState<MotherDuckState>({
    connection: null,
    isInitialized: false,
    isConnected: false,
    error: null,
  });

  const connect = useCallback(async (token: string) => {
    try {
      setState(prev => ({ ...prev, error: null, isInitialized: false }));

      const connection = MDConnection.create({ mdToken: token });
      await connection.isInitialized();

      // Test connection with a simple query
      await connection.evaluateQuery('SELECT 1 as test');

      setState({
        connection,
        isInitialized: true,
        isConnected: true,
        error: null,
      });

      // Store connection success in sessionStorage for quick reconnect
      sessionStorage.setItem('md_connected', 'true');
    } catch (err) {
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Connection failed',
        isConnected: false,
      }));
      sessionStorage.removeItem('md_connected');
    }
  }, []);

  // Auto-connect from env on mount
  useEffect(() => {
    const token = import.meta.env.VITE_MOTHERDUCK_TOKEN;
    const wasConnected = sessionStorage.getItem('md_connected');

    if (token && (wasConnected || !state.isConnected)) {
      connect(token);
    }
  }, [connect, state.isConnected]);

  const executeQuery = useCallback(async (sql: string, params?: unknown[]) => {
    if (!state.connection) throw new Error('Not connected to MotherDuck');
    if (params && params.length > 0) {
      return state.connection.evaluatePreparedStatement(sql, params);
    }
    return state.connection.evaluateQuery(sql);
  }, [state.connection]);

  const executeInsert = useCallback(async (table: string, data: Record<string, unknown>) => {
    if (!state.connection) throw new Error('Not connected to MotherDuck');

    const columns = Object.keys(data).join(', ');
    const placeholders = Object.keys(data).map(() => '?').join(', ');
    const values = Object.values(data);

    const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
    return state.connection.evaluatePreparedStatement(sql, values);
  }, [state.connection]);

  const disconnect = useCallback(() => {
    setState({
      connection: null,
      isInitialized: false,
      isConnected: false,
      error: null,
    });
    sessionStorage.removeItem('md_connected');
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    executeQuery,
    executeInsert,
  };
}
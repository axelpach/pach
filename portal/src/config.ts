export const config = {
  zeroServerUrl: import.meta.env.VITE_ZERO_SERVER_URL || 'http://localhost:4848',
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3002',
} as const

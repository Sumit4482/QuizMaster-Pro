import { GatewayConfig } from './apiGateway';

export const gatewayConfig: GatewayConfig = {
  port: parseInt(process.env.GATEWAY_PORT || '8080', 10),
  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:3001').split(',').map(origin => origin.trim()),
    credentials: true
  },
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX || '1000', 10) // requests per windowMs
  },
  circuitBreaker: {
    timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '5000', 10),
    errorThreshold: parseInt(process.env.CIRCUIT_BREAKER_ERROR_THRESHOLD || '50', 10),
    resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || '60000', 10)
  }
};

export default gatewayConfig;


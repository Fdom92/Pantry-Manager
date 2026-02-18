export interface EnvConfig {
  openaiApiKey: string;
  openaiModel: string;
  nodeEnv: string;
  port: number;
  host: string;
  allowedOrigins: string[];
  frontendUrl?: string;
}

export function loadEnvConfig(): EnvConfig {
  const required = ['OPENAI_API_KEY'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const allowedOrigins = [
    'capacitor://localhost', // iOS
    'http://localhost', // Android
    'ionic://localhost', // Android alternative
    'http://localhost:8100', // Development in browser
  ];

  if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
  }

  return {
    openaiApiKey: process.env.OPENAI_API_KEY!,
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    nodeEnv: process.env.NODE_ENV || 'development',
    port: Number(process.env.PORT) || 4000,
    host: process.env.HOST || '0.0.0.0',
    allowedOrigins,
    frontendUrl: process.env.FRONTEND_URL,
  };
}

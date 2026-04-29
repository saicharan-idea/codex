import dotenv from 'dotenv'; dotenv.config();
export const config={port:Number(process.env.PORT||3000),devToken:process.env.DEV_AUTH_TOKEN||'dev-token-123',rateWindowMs:Number(process.env.RATE_LIMIT_WINDOW_MS||60000),rateLimitMax:Number(process.env.RATE_LIMIT_MAX||120),publicBaseUrl:process.env.PUBLIC_BASE_URL||'http://localhost:3000'};

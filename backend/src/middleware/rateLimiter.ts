import rateLimit from 'express-rate-limit';

// Rate limiter for agent endpoints
// Limits are per userId (not IP) since mobile IPs change frequently
export const agentRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute per user (conservative for mobile)
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use userId from verifyPro middleware
    return (req as any).userId || req.ip || 'unknown';
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please wait a moment',
    });
  },
  skip: (req) => {
    // Skip rate limiting in development
    return process.env.NODE_ENV !== 'production';
  },
});

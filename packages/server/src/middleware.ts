import { Request, Response, NextFunction } from "express";

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function rateLimiter(limit: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown_ip";
    const now = Date.now();
    const record = rateLimitMap.get(ip) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 0;
      record.resetTime = now + windowMs;
    }

    record.count++;
    rateLimitMap.set(ip, record);

    if (record.count > limit) {
      return res.status(429).json({ error: "Too many requests. Please slow down." });
    }
    next();
  };
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const adminSecret = process.env.ADMIN_SECRET;
  
  if (!adminSecret) {
    console.error("[AUTH CRITICAL] ADMIN_SECRET is missing! Blocking sensitive request to ensure safety.");
    return res.status(500).json({ error: "Server configuration error. ADMIN_SECRET must be set in Environment." });
  }

  const providedToken = req.headers["x-admin-token"] || req.query.admin_token;
  if (!providedToken || providedToken !== adminSecret) {
    return res.status(401).json({ error: "Unauthorized. Valid ADMIN_SECRET required." });
  }

  next();
}

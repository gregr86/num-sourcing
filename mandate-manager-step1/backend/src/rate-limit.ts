// backend/src/rate-limit.ts
// Middleware de rate limiting simple en mémoire

interface RateLimitEntry {
  count: number
  resetAt: number
}

export class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map()
  private readonly maxRequests: number
  private readonly windowMs: number

  constructor(maxRequests = 100, windowMs = 60000) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
    
    // Nettoyage périodique
    setInterval(() => this.cleanup(), windowMs)
  }

  private cleanup() {
    const now = Date.now()
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetAt < now) {
        this.store.delete(key)
      }
    }
  }

  check(identifier: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now()
    const entry = this.store.get(identifier)

    // Pas d'entrée ou fenêtre expirée
    if (!entry || entry.resetAt < now) {
      const resetAt = now + this.windowMs
      this.store.set(identifier, { count: 1, resetAt })
      return {
        allowed: true,
        remaining: this.maxRequests - 1,
        resetAt
      }
    }

    // Limite dépassée
    if (entry.count >= this.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt
      }
    }

    // Incrémenter et autoriser
    entry.count++
    return {
      allowed: true,
      remaining: this.maxRequests - entry.count,
      resetAt: entry.resetAt
    }
  }
}

// Instances pour différents endpoints
export const authLimiter = new RateLimiter(5, 15 * 60 * 1000) // 5 tentatives / 15min
export const apiLimiter = new RateLimiter(100, 60 * 1000)     // 100 req / min
export const uploadLimiter = new RateLimiter(10, 60 * 1000)   // 10 uploads / min

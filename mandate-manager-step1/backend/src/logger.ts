// backend/src/logger.ts
// Système de logging structuré avec niveaux et contexte

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: Record<string, any>
  error?: Error
}

class Logger {
  private minLevel: LogLevel
  
  constructor() {
    const level = process.env.LOG_LEVEL?.toLowerCase() || 'info'
    this.minLevel = level as LogLevel
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
    const currentIndex = levels.indexOf(this.minLevel)
    const targetIndex = levels.indexOf(level)
    return targetIndex >= currentIndex
  }

  private format(entry: LogEntry): string {
    const { timestamp, level, message, context, error } = entry
    const parts = [
      `[${timestamp}]`,
      `[${level.toUpperCase()}]`,
      message
    ]

    if (context && Object.keys(context).length > 0) {
      parts.push(JSON.stringify(context))
    }

    if (error) {
      parts.push(`\n${error.stack || error.message}`)
    }

    return parts.join(' ')
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error) {
    if (!this.shouldLog(level)) return

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      error
    }

    const formatted = this.format(entry)
    
    switch (level) {
      case 'error':
        console.error(formatted)
        break
      case 'warn':
        console.warn(formatted)
        break
      default:
        console.log(formatted)
    }
  }

  debug(message: string, context?: Record<string, any>) {
    this.log('debug', message, context)
  }

  info(message: string, context?: Record<string, any>) {
    this.log('info', message, context)
  }

  warn(message: string, context?: Record<string, any>) {
    this.log('warn', message, context)
  }

  error(message: string, error?: Error, context?: Record<string, any>) {
    this.log('error', message, context, error)
  }
}

export const logger = new Logger()

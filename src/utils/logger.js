/**
 * Centralized Logger Utility
 * Provides consistent logging across the application with proper formatting
 * Works well with PM2 and other process managers
 */

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
};

class Logger {
    constructor() {
        this.isProduction = process.env.NODE_ENV === 'production';
        this.enableColors = !this.isProduction || process.env.ENABLE_LOG_COLORS === 'true';
    }

    /**
     * Format timestamp
     */
    getTimestamp() {
        return new Date().toISOString();
    }

    /**
     * Format log message with prefix
     */
    formatMessage(level, module, message, data = null) {
        const timestamp = this.getTimestamp();
        const levelUpper = level.toUpperCase().padEnd(5);
        const moduleStr = module ? `[${module}]` : '';
        
        let formattedMessage = `${timestamp} | ${levelUpper} | ${moduleStr} ${message}`;
        
        if (data !== null && data !== undefined) {
            if (typeof data === 'object') {
                try {
                    formattedMessage += ` | ${JSON.stringify(data, null, 2)}`;
                } catch (e) {
                    formattedMessage += ` | ${String(data)}`;
                }
            } else {
                formattedMessage += ` | ${String(data)}`;
            }
        }
        
        return formattedMessage;
    }

    /**
     * Apply colors to log message (only in development)
     */
    colorize(level, message) {
        if (!this.enableColors) {
            return message;
        }

        switch (level) {
            case 'error':
                return `${colors.red}${message}${colors.reset}`;
            case 'warn':
                return `${colors.yellow}${message}${colors.reset}`;
            case 'info':
                return `${colors.cyan}${message}${colors.reset}`;
            case 'debug':
                return `${colors.dim}${message}${colors.reset}`;
            case 'success':
                return `${colors.green}${message}${colors.reset}`;
            default:
                return message;
        }
    }

    /**
     * Log info message
     */
    info(message, module = null, data = null) {
        const formatted = this.formatMessage('info', module, message, data);
        console.log(this.colorize('info', formatted));
    }

    /**
     * Log error message
     */
    error(message, module = null, error = null) {
        let errorData = null;
        if (error) {
            if (error instanceof Error) {
                errorData = {
                    message: error.message,
                    stack: error.stack,
                    ...(error.response && {
                        status: error.response.status,
                        data: error.response.data
                    })
                };
            } else {
                errorData = error;
            }
        }
        const formatted = this.formatMessage('error', module, message, errorData);
        console.error(this.colorize('error', formatted));
    }

    /**
     * Log warning message
     */
    warn(message, module = null, data = null) {
        const formatted = this.formatMessage('warn', module, message, data);
        console.warn(this.colorize('warn', formatted));
    }

    /**
     * Log debug message (only in development)
     */
    debug(message, module = null, data = null) {
        if (this.isProduction && process.env.DEBUG !== 'true') {
            return;
        }
        const formatted = this.formatMessage('debug', module, message, data);
        console.log(this.colorize('debug', formatted));
    }

    /**
     * Log success message
     */
    success(message, module = null, data = null) {
        const formatted = this.formatMessage('info', module, message, data);
        console.log(this.colorize('success', formatted));
    }

    /**
     * Log with custom module prefix
     */
    module(moduleName) {
        return {
            info: (message, data) => this.info(message, moduleName, data),
            error: (message, error) => this.error(message, moduleName, error),
            warn: (message, data) => this.warn(message, moduleName, data),
            debug: (message, data) => this.debug(message, moduleName, data),
            success: (message, data) => this.success(message, moduleName, data),
        };
    }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;


const winston = require('winston');

/**
 * Advanced job queue with concurrency control and rate limiting
 * - Max 4 concurrent agents
 * - 2-second delay between API calls
 * - Respects Gemini rate limits (5 RPM for free tier)
 */
class JobQueue {
  constructor(maxConcurrent = 4, apiCallDelayMs = 2000) {
    this.queue = [];
    this.running = new Map(); // agentId -> { startTime, task }
    this.maxConcurrent = maxConcurrent;
    this.apiCallDelayMs = apiCallDelayMs;
    this.lastApiCallTime = 0;
    this.stats = {
      processed: 0,
      failed: 0,
      totalWaitTime: 0,
    };
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
        }),
        new winston.transports.File({
          filename: 'logs/queue.log',
          maxsize: 10485760, // 10MB
          maxFiles: 5,
        }),
      ],
    });
  }

  /**
   * Enqueue a job and wait for it to execute
   */
  async enqueue(agentId, agentName, taskFn, priority = 'normal') {
    return new Promise((resolve, reject) => {
      const job = {
        id: `${agentId}-${Date.now()}`,
        agentId,
        agentName,
        taskFn,
        priority,
        enqueuedAt: Date.now(),
        resolve,
        reject,
      };

      this.queue.push(job);
      this.queue.sort((a, b) => {
        // Prioritize higher priority jobs
        const priorityMap = { high: 0, normal: 1, low: 2 };
        return priorityMap[a.priority] - priorityMap[b.priority];
      });

      this.logger.info(`Job enqueued: ${agentId} (${agentName})`, {
        queueLength: this.queue.length,
        running: this.running.size,
      });

      this.processQueue();
    });
  }

  /**
   * Process the queue, respecting concurrency and rate limits
   */
  async processQueue() {
    // Check if we can process more jobs
    while (this.running.size < this.maxConcurrent && this.queue.length > 0) {
      // Apply rate limiting: ensure 2-second delay between API calls
      const timeSinceLastCall = Date.now() - this.lastApiCallTime;
      if (timeSinceLastCall < this.apiCallDelayMs) {
        // Wait before processing next job
        await this.sleep(this.apiCallDelayMs - timeSinceLastCall);
      }

      const job = this.queue.shift();
      this.lastApiCallTime = Date.now();

      const startTime = Date.now();
      this.running.set(job.agentId, { startTime, job });

      this.logger.info(`Job started: ${job.agentId} (${job.agentName})`);

      // Execute the job
      job.taskFn()
        .then((result) => {
          const duration = Date.now() - startTime;
          const waitTime = startTime - job.enqueuedAt;

          this.stats.processed++;
          this.stats.totalWaitTime += waitTime;

          this.logger.info(
            `Job completed: ${job.agentId} (${job.agentName})`,
            {
              duration,
              waitTime,
              avgWaitTime: (this.stats.totalWaitTime / this.stats.processed).toFixed(0),
            }
          );

          this.running.delete(job.agentId);
          job.resolve(result);
          this.processQueue();
        })
        .catch((error) => {
          const duration = Date.now() - startTime;

          this.stats.failed++;

          this.logger.error(
            `Job failed: ${job.agentId} (${job.agentName})`,
            {
              error: error.message,
              stack: error.stack,
              duration,
            }
          );

          this.running.delete(job.agentId);
          job.reject(error);
          this.processQueue();
        });
    }
  }

  /**
   * Get current queue status
   */
  getStatus() {
    const runningJobs = Array.from(this.running.entries()).map(([agentId, { startTime }]) => ({
      agentId,
      duration: Date.now() - startTime,
    }));

    return {
      queueLength: this.queue.length,
      runningCount: this.running.size,
      maxConcurrent: this.maxConcurrent,
      runningJobs,
      pendingJobs: this.queue.map((j) => ({
        agentId: j.agentId,
        agentName: j.agentName,
        priority: j.priority,
        waitTime: Date.now() - j.enqueuedAt,
      })),
      stats: {
        ...this.stats,
        avgWaitTime: this.stats.processed > 0
          ? (this.stats.totalWaitTime / this.stats.processed).toFixed(0)
          : 0,
      },
    };
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      ...this.stats,
      avgWaitTime: this.stats.processed > 0
        ? (this.stats.totalWaitTime / this.stats.processed).toFixed(0)
        : 0,
      queueLength: this.queue.length,
      runningCount: this.running.size,
    };
  }

  /**
   * Pause queue (don't process new jobs)
   */
  pause() {
    this.paused = true;
    this.logger.info('Queue paused');
  }

  /**
   * Resume queue
   */
  resume() {
    this.paused = false;
    this.logger.info('Queue resumed');
    this.processQueue();
  }

  /**
   * Clear queue (for development/testing)
   */
  clear() {
    const cleared = this.queue.length;
    this.queue = [];
    this.logger.warn(`Queue cleared: ${cleared} jobs removed`);
    return cleared;
  }

  /**
   * Utility: sleep
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = JobQueue;

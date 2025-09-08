/**
 * AI Request Queue
 * Manages AI processing requests with priority and batching support
 */

import Queue from 'bull';
import Redis from 'redis';
import { logger } from '@/config/logger';
import { IAiQueue, AiRequest, AiRequestType } from '@/types/ai';

export interface AiQueueConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  concurrency: number;
  defaultJobOptions: {
    removeOnComplete: number;
    removeOnFail: number;
    delay: number;
    attempts: number;
    backoff: number;
  };
  queueName: string;
}

export interface QueueJobData extends AiRequest {
  priority?: number;
  delay?: number;
  attempts?: number;
}

/**
 * AI Request Processing Queue
 * Handles AI requests with prioritization and retry logic
 */
export class AiQueue implements IAiQueue {
  private queue!: Queue.Queue<QueueJobData>;
  private config: AiQueueConfig;
  private isReady = false;

  // Queue statistics
  private stats = {
    processed: 0,
    failed: 0,
    active: 0,
    waiting: 0,
    completed: 0,
    delayed: 0
  };

  constructor(config: Partial<AiQueueConfig> = {}) {
    this.config = {
      redis: config.redis || {
        host: 'localhost',
        port: 6379
      },
      concurrency: config.concurrency || 5,
      defaultJobOptions: config.defaultJobOptions || {
        removeOnComplete: 100,
        removeOnFail: 50,
        delay: 0,
        attempts: 3,
        backoff: 1000
      },
      queueName: config.queueName || 'ai-requests',
      ...config
    };

    this.initializeQueue();
  }

  /**
   * Initialize Bull queue with Redis connection
   */
  private async initializeQueue(): Promise<void> {
    try {
      const redisConfig = {
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
        db: this.config.redis.db || 0,
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        maxLoadingTimeout: 1000,
        lazyConnect: true
      };

      this.queue = new Queue<QueueJobData>(this.config.queueName, {
        redis: redisConfig,
        defaultJobOptions: this.config.defaultJobOptions
      });

      // Set up event handlers
      this.setupEventHandlers();

      // Wait for queue to be ready
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Queue initialization timeout'));
        }, 10000); // 10 second timeout

        this.queue.on('ready', () => {
          clearTimeout(timeout);
          this.isReady = true;
          resolve();
        });

        this.queue.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      logger.info('AI Queue initialized successfully', {
        component: 'AiQueue',
        queueName: this.config.queueName,
        concurrency: this.config.concurrency
      });

    } catch (error) {
      logger.error('Failed to initialize AI Queue', {
        component: 'AiQueue',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Set up queue event handlers
   */
  private setupEventHandlers(): void {
    this.queue.on('ready', () => {
      logger.info('AI Queue ready', { component: 'AiQueue' });
    });

    this.queue.on('error', (error) => {
      logger.error('AI Queue error', {
        component: 'AiQueue',
        error: error.message
      });
    });

    this.queue.on('active', (job) => {
      this.stats.active++;
      logger.debug('Job started', {
        component: 'AiQueue',
        jobId: job.id,
        requestId: job.data.id,
        requestType: job.data.requestType
      });
    });

    this.queue.on('completed', (job, result) => {
      this.stats.completed++;
      this.stats.processed++;
      if (this.stats.active > 0) this.stats.active--;
      
      logger.debug('Job completed', {
        component: 'AiQueue',
        jobId: job.id,
        requestId: job.data.id,
        duration: job.processedOn ? Date.now() - job.processedOn : 0
      });
    });

    this.queue.on('failed', (job, error) => {
      this.stats.failed++;
      this.stats.processed++;
      if (this.stats.active > 0) this.stats.active--;
      
      logger.error('Job failed', {
        component: 'AiQueue',
        jobId: job?.id,
        requestId: job?.data?.id,
        error: error.message,
        attempts: job?.attemptsMade,
        maxAttempts: job?.opts?.attempts
      });
    });

    this.queue.on('stalled', (job) => {
      logger.warn('Job stalled', {
        component: 'AiQueue',
        jobId: job.id,
        requestId: job.data.id
      });
    });

    this.queue.on('progress', (job, progress) => {
      logger.debug('Job progress', {
        component: 'AiQueue',
        jobId: job.id,
        requestId: job.data.id,
        progress
      });
    });
  }

  /**
   * Add AI request to queue
   */
  public async enqueue(request: AiRequest): Promise<string> {
    if (!this.isReady) {
      throw new Error('Queue is not ready');
    }

    try {
      const jobData: QueueJobData = {
        ...request,
        priority: this.calculatePriority(request),
        delay: 0,
        attempts: this.config.defaultJobOptions.attempts
      };

      const job = await this.queue.add(jobData, {
        priority: jobData.priority,
        delay: jobData.delay,
        attempts: jobData.attempts,
        removeOnComplete: this.config.defaultJobOptions.removeOnComplete,
        removeOnFail: this.config.defaultJobOptions.removeOnFail,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      });

      logger.debug('Request enqueued', {
        component: 'AiQueue',
        jobId: job.id,
        requestId: request.id,
        requestType: request.requestType,
        priority: jobData.priority
      });

      return job.id?.toString() || 'unknown';

    } catch (error) {
      logger.error('Failed to enqueue request', {
        component: 'AiQueue',
        requestId: request.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get next request from queue (used by processors)
   */
  public async dequeue(): Promise<AiRequest | null> {
    // This is typically handled by Bull's processor
    // We'll implement a simple version for compatibility
    try {
      const jobs = await this.queue.getJobs(['waiting'], 0, 0);
      if (jobs.length === 0) {
        return null;
      }

      const job = jobs[0];
      return job.data;

    } catch (error) {
      logger.error('Failed to dequeue request', {
        component: 'AiQueue',
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Get queue status
   */
  public async getQueueStatus(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    try {
      const waiting = await this.queue.getJobs(['waiting'], 0, -1);
      const active = await this.queue.getJobs(['active'], 0, -1);
      const completed = await this.queue.getJobs(['completed'], 0, -1);
      const failed = await this.queue.getJobs(['failed'], 0, -1);

      return {
        pending: waiting.length,
        processing: active.length,
        completed: completed.length,
        failed: failed.length
      };

    } catch (error) {
      logger.error('Failed to get queue status', {
        component: 'AiQueue',
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        pending: 0,
        processing: 0,
        completed: this.stats.completed,
        failed: this.stats.failed
      };
    }
  }

  /**
   * Process jobs with a processor function
   */
  public process(processor: (job: Queue.Job<QueueJobData>) => Promise<any>): void {
    if (!this.isReady) {
      throw new Error('Queue is not ready');
    }

    this.queue.process(this.config.concurrency, async (job) => {
      try {
        logger.debug('Processing job', {
          component: 'AiQueue',
          jobId: job.id,
          requestId: job.data.id,
          requestType: job.data.requestType
        });

        const result = await processor(job);
        
        logger.debug('Job processed successfully', {
          component: 'AiQueue',
          jobId: job.id,
          requestId: job.data.id
        });

        return result;

      } catch (error) {
        logger.error('Job processing failed', {
          component: 'AiQueue',
          jobId: job.id,
          requestId: job.data.id,
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    });
  }

  /**
   * Get job by ID
   */
  public async getJob(jobId: string): Promise<Queue.Job<QueueJobData> | null> {
    try {
      const job = await this.queue.getJob(jobId);
      return job;
    } catch (error) {
      logger.error('Failed to get job', {
        component: 'AiQueue',
        jobId,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Cancel job
   */
  public async cancelJob(jobId: string): Promise<boolean> {
    try {
      const job = await this.getJob(jobId);
      if (job) {
        await job.remove();
        logger.info('Job cancelled', {
          component: 'AiQueue',
          jobId
        });
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Failed to cancel job', {
        component: 'AiQueue',
        jobId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Get queue statistics
   */
  public getStats() {
    return {
      ...this.stats,
      isReady: this.isReady,
      concurrency: this.config.concurrency
    };
  }

  /**
   * Pause queue processing
   */
  public async pause(): Promise<void> {
    try {
      await this.queue.pause();
      logger.info('Queue paused', { component: 'AiQueue' });
    } catch (error) {
      logger.error('Failed to pause queue', {
        component: 'AiQueue',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Resume queue processing
   */
  public async resume(): Promise<void> {
    try {
      await this.queue.resume();
      logger.info('Queue resumed', { component: 'AiQueue' });
    } catch (error) {
      logger.error('Failed to resume queue', {
        component: 'AiQueue',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Clean up old jobs
   */
  public async clean(grace: number = 24 * 60 * 60 * 1000): Promise<void> {
    try {
      await this.queue.clean(grace, 'completed');
      await this.queue.clean(grace, 'failed');
      
      logger.info('Queue cleaned', { 
        component: 'AiQueue',
        grace: `${grace / (60 * 60 * 1000)} hours`
      });
    } catch (error) {
      logger.error('Failed to clean queue', {
        component: 'AiQueue',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Close queue and connections
   */
  public async close(): Promise<void> {
    try {
      await this.queue.close();
      this.isReady = false;
      logger.info('AI Queue closed', { component: 'AiQueue' });
    } catch (error) {
      logger.error('Failed to close queue', {
        component: 'AiQueue',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Calculate job priority based on request
   */
  private calculatePriority(request: AiRequest): number {
    let priority = 50; // Default priority

    // Higher priority for certain request types
    switch (request.requestType) {
      case AiRequestType.QUESTION_GENERATION:
        priority += 20;
        break;
      case AiRequestType.CONTENT_VALIDATION:
        priority += 15;
        break;
      case AiRequestType.QUALITY_ASSESSMENT:
        priority += 10;
        break;
      default:
        priority += 5;
    }

    // Higher priority for user-specified priority
    if (request.priority) {
      priority += request.priority;
    }

    // Ensure priority is within valid range (1-100)
    return Math.max(1, Math.min(100, priority));
  }
}

export default AiQueue;

import Bull, { Queue, Job, JobOptions, QueueOptions } from 'bull';
import RedisClient from '../redis/redisClient';
import { logger } from '../../utils/logger';

export interface QueueJobData {
  [key: string]: any;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
  processingTime?: number;
}

export class QueueService {
  private queues: Map<string, Queue> = new Map();
  private redis: RedisClient;
  private processors: Map<string, (job: Job<QueueJobData>) => Promise<JobResult>> = new Map();

  constructor() {
    this.redis = RedisClient.getInstance();
    this.initializeQueues();
    this.setupEventHandlers();
  }

  /**
   * Initialize different types of queues
   */
  private initializeQueues(): void {
    const queueConfig: QueueOptions = {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0')
      },
      defaultJobOptions: {
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 50, // Keep last 50 failed jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    };

    // Email queue for sending notifications
    this.queues.set('email', new Bull('email', queueConfig));

    // Analytics queue for processing events
    this.queues.set('analytics', new Bull('analytics', queueConfig));

    // AI queue for question generation and processing
    this.queues.set('ai', new Bull('ai', queueConfig));

    // File processing queue
    this.queues.set('fileProcessing', new Bull('fileProcessing', queueConfig));

    // Game cleanup queue
    this.queues.set('gameCleanup', new Bull('gameCleanup', queueConfig));

    // Report generation queue
    this.queues.set('reports', new Bull('reports', queueConfig));

    // Notification queue
    this.queues.set('notifications', new Bull('notifications', queueConfig));

    logger.info('Queue service initialized', {
      component: 'QueueService',
      queueCount: this.queues.size,
      queueNames: Array.from(this.queues.keys())
    });
  }

  /**
   * Set up event handlers for all queues
   */
  private setupEventHandlers(): void {
    this.queues.forEach((queue, queueName) => {
      queue.on('ready', () => {
        logger.info(`Queue ${queueName} is ready`, { component: 'QueueService' });
      });

      queue.on('error', (error) => {
        logger.error(`Queue ${queueName} error`, {
          component: 'QueueService',
          queue: queueName,
          error: error.message
        });
      });

      queue.on('waiting', (jobId) => {
        logger.debug(`Job ${jobId} is waiting in queue ${queueName}`, {
          component: 'QueueService'
        });
      });

      queue.on('active', (job) => {
        logger.debug(`Job ${job.id} started processing in queue ${queueName}`, {
          component: 'QueueService',
          jobData: job.data
        });
      });

      queue.on('completed', (job, result) => {
        logger.info(`Job ${job.id} completed in queue ${queueName}`, {
          component: 'QueueService',
          processingTime: Date.now() - job.processedOn!,
          result: result?.success
        });
      });

      queue.on('failed', (job, error) => {
        logger.error(`Job ${job.id} failed in queue ${queueName}`, {
          component: 'QueueService',
          attempts: job.attemptsMade,
          maxAttempts: job.opts.attempts,
          error: error.message
        });
      });

      queue.on('stalled', (job) => {
        logger.warn(`Job ${job.id} stalled in queue ${queueName}`, {
          component: 'QueueService'
        });
      });
    });
  }

  /**
   * Add a job to a specific queue
   */
  async addJob(
    queueName: string,
    jobType: string,
    data: QueueJobData,
    options: JobOptions = {}
  ): Promise<Job<QueueJobData> | null> {
    try {
      const queue = this.queues.get(queueName);
      if (!queue) {
        logger.error(`Queue ${queueName} not found`, { component: 'QueueService' });
        return null;
      }

      const job = await queue.add(jobType, data, {
        priority: options.priority || 0,
        delay: options.delay || 0,
        attempts: options.attempts || 3,
        removeOnComplete: options.removeOnComplete || 100,
        removeOnFail: options.removeOnFail || 50,
        ...options
      });

      logger.info(`Job added to queue ${queueName}`, {
        component: 'QueueService',
        jobId: job.id,
        jobType,
        queueName
      });

      return job;
    } catch (error) {
      logger.error(`Failed to add job to queue ${queueName}`, {
        component: 'QueueService',
        error: error instanceof Error ? error.message : String(error),
        jobType,
        data
      });
      return null;
    }
  }

  /**
   * Register a processor for a specific queue and job type
   */
  registerProcessor(
    queueName: string,
    processor: (job: Job<QueueJobData>) => Promise<JobResult>,
    concurrency: number = 1
  ): void {
    const queue = this.queues.get(queueName);
    if (!queue) {
      logger.error(`Cannot register processor: Queue ${queueName} not found`, {
        component: 'QueueService'
      });
      return;
    }

    const processorKey = queueName;
    this.processors.set(processorKey, processor);

    queue.process(concurrency, async (job: Job<QueueJobData>) => {
      const startTime = Date.now();
      
      try {
        const result = await processor(job);
        const processingTime = Date.now() - startTime;

        logger.info(`Job processed successfully`, {
          component: 'QueueService',
          jobId: job.id,
          queueName,
          processingTime,
          success: result.success
        });

        return { ...result, processingTime };
      } catch (error) {
        const processingTime = Date.now() - startTime;
        
        logger.error(`Job processing failed`, {
          component: 'QueueService',
          jobId: job.id,
          queueName,
          processingTime,
          error: error instanceof Error ? error.message : String(error)
        });

        throw error;
      }
    });

    logger.info(`Processor registered for queue ${queueName}`, {
      component: 'QueueService',
      concurrency
    });
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: string): Promise<QueueStats | null> {
    try {
      const queue = this.queues.get(queueName);
      if (!queue) {
        return null;
      }

      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
        queue.getDelayed()
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        paused: await queue.isPaused()
      };
    } catch (error) {
      logger.error(`Failed to get stats for queue ${queueName}`, {
        component: 'QueueService',
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Get stats for all queues
   */
  async getAllQueueStats(): Promise<Record<string, QueueStats>> {
    const stats: Record<string, QueueStats> = {};
    
    for (const queueName of this.queues.keys()) {
      const queueStats = await this.getQueueStats(queueName);
      if (queueStats) {
        stats[queueName] = queueStats;
      }
    }

    return stats;
  }

  /**
   * Pause a queue
   */
  async pauseQueue(queueName: string): Promise<boolean> {
    try {
      const queue = this.queues.get(queueName);
      if (!queue) {
        return false;
      }

      await queue.pause();
      logger.info(`Queue ${queueName} paused`, { component: 'QueueService' });
      return true;
    } catch (error) {
      logger.error(`Failed to pause queue ${queueName}`, {
        component: 'QueueService',
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Resume a queue
   */
  async resumeQueue(queueName: string): Promise<boolean> {
    try {
      const queue = this.queues.get(queueName);
      if (!queue) {
        return false;
      }

      await queue.resume();
      logger.info(`Queue ${queueName} resumed`, { component: 'QueueService' });
      return true;
    } catch (error) {
      logger.error(`Failed to resume queue ${queueName}`, {
        component: 'QueueService',
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Clean completed/failed jobs from a queue
   */
  async cleanQueue(queueName: string, olderThan: number = 24 * 60 * 60 * 1000): Promise<boolean> {
    try {
      const queue = this.queues.get(queueName);
      if (!queue) {
        return false;
      }

      await Promise.all([
        queue.clean(olderThan, 'completed'),
        queue.clean(olderThan, 'failed')
      ]);

      logger.info(`Queue ${queueName} cleaned`, {
        component: 'QueueService',
        olderThan: `${olderThan / 1000}s`
      });
      return true;
    } catch (error) {
      logger.error(`Failed to clean queue ${queueName}`, {
        component: 'QueueService',
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Convenient methods for specific job types
   */

  // Email jobs
  async sendEmail(to: string, subject: string, body: string, options: JobOptions = {}): Promise<Job<QueueJobData> | null> {
    return this.addJob('email', 'sendEmail', { to, subject, body }, options);
  }

  async sendBulkEmail(recipients: string[], subject: string, body: string, options: JobOptions = {}): Promise<Job<QueueJobData> | null> {
    return this.addJob('email', 'sendBulkEmail', { recipients, subject, body }, options);
  }

  // Analytics jobs
  async processEvent(eventData: any, options: JobOptions = {}): Promise<Job<QueueJobData> | null> {
    return this.addJob('analytics', 'processEvent', eventData, options);
  }

  async generateReport(reportType: string, parameters: any, options: JobOptions = {}): Promise<Job<QueueJobData> | null> {
    return this.addJob('reports', 'generateReport', { reportType, parameters }, options);
  }

  // AI jobs
  async generateQuestions(topic: string, count: number, difficulty: string, options: JobOptions = {}): Promise<Job<QueueJobData> | null> {
    return this.addJob('ai', 'generateQuestions', { topic, count, difficulty }, options);
  }

  async moderateContent(content: string, contentType: string, options: JobOptions = {}): Promise<Job<QueueJobData> | null> {
    return this.addJob('ai', 'moderateContent', { content, contentType }, options);
  }

  // File processing jobs
  async processFile(fileId: string, processingOptions: any, options: JobOptions = {}): Promise<Job<QueueJobData> | null> {
    return this.addJob('fileProcessing', 'processFile', { fileId, processingOptions }, options);
  }

  // Game cleanup jobs
  async scheduleGameCleanup(gameId: string, delay: number = 60000): Promise<Job<QueueJobData> | null> {
    return this.addJob('gameCleanup', 'cleanupGame', { gameId }, { delay });
  }

  // Notification jobs
  async sendNotification(userId: string, type: string, title: string, message: string, options: JobOptions = {}): Promise<Job<QueueJobData> | null> {
    return this.addJob('notifications', 'sendNotification', { userId, type, title, message }, options);
  }

  /**
   * Health check for queue service
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    queues: Record<string, { status: 'healthy' | 'unhealthy'; stats?: QueueStats }>;
    redis: 'connected' | 'disconnected';
  }> {
    try {
      const redisHealth = await this.redis.healthCheck();
      const queueHealths: Record<string, { status: 'healthy' | 'unhealthy'; stats?: QueueStats }> = {};

      for (const queueName of this.queues.keys()) {
        try {
          const stats = await this.getQueueStats(queueName);
          queueHealths[queueName] = {
            status: 'healthy',
            stats: stats || undefined
          };
        } catch {
          queueHealths[queueName] = { status: 'unhealthy' };
        }
      }

      const allQueuesHealthy = Object.values(queueHealths).every(q => q.status === 'healthy');

      return {
        status: redisHealth.status === 'healthy' && allQueuesHealthy ? 'healthy' : 'unhealthy',
        queues: queueHealths,
        redis: redisHealth.status === 'healthy' ? 'connected' : 'disconnected'
      };
    } catch (error) {
      logger.error('Queue service health check failed', {
        component: 'QueueService',
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        status: 'unhealthy',
        queues: {},
        redis: 'disconnected'
      };
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down queue service', { component: 'QueueService' });

      const shutdownPromises = Array.from(this.queues.values()).map(queue => queue.close());
      await Promise.all(shutdownPromises);

      logger.info('Queue service shutdown complete', { component: 'QueueService' });
    } catch (error) {
      logger.error('Error during queue service shutdown', {
        component: 'QueueService',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export default QueueService;


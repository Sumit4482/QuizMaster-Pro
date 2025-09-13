import { logger } from '@/config/logger';
import { MultiProviderAiService } from './multiProviderAiService';
import { ObservabilityService } from './observabilityService';

/**
 * Phase 3.3: Service Initialization
 * 
 * Initializes all advanced AI services during application startup
 */
export class InitializationService {
  private static instance: InitializationService | null = null;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): InitializationService {
    if (!InitializationService.instance) {
      InitializationService.instance = new InitializationService();
    }
    return InitializationService.instance;
  }

  /**
   * Initialize all advanced AI services
   */
  public async initializeAdvancedAiServices(): Promise<void> {
    if (this.isInitialized) {
      logger.info('Advanced AI services already initialized');
      return;
    }

    try {
      logger.info('🚀 Starting advanced AI services initialization');

      // Initialize Multi-Provider AI Service
      await this.initializeMultiProviderAi();

      // Initialize Observability Service (includes monitoring and analytics)
      await this.initializeObservabilityService();

      // Other services (ContentModerationService and FactVerificationService) 
      // are initialized on first use via getInstance()

      this.isInitialized = true;
      logger.info('✅ Advanced AI services initialization completed successfully');

    } catch (error) {
      logger.error('❌ Failed to initialize advanced AI services', {
        component: 'InitializationService',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Initialize Multi-Provider AI Service
   */
  private async initializeMultiProviderAi(): Promise<void> {
    try {
      logger.info('🤖 Initializing Multi-Provider AI Service');
      
      const multiProviderService = MultiProviderAiService.getInstance();
      await multiProviderService.initialize();
      
      logger.info('✅ Multi-Provider AI Service initialized successfully');
    } catch (error) {
      logger.error('❌ Multi-Provider AI Service initialization failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't throw - allow app to continue without advanced AI features
      logger.warn('⚠️ Application will continue without multi-provider AI features');
    }
  }

  /**
   * Initialize Observability Service
   */
  private async initializeObservabilityService(): Promise<void> {
    try {
      logger.info('📊 Initializing Observability Service (Monitoring + Analytics)');
      
      const observabilityService = ObservabilityService.getInstance();
      await observabilityService.initialize();
      
      logger.info('✅ Observability Service initialized successfully');
    } catch (error) {
      logger.error('❌ Observability Service initialization failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't throw - allow app to continue without observability features
      logger.warn('⚠️ Application will continue without observability features');
    }
  }

  /**
   * Get initialization status
   */
  public getInitializationStatus(): {
    isInitialized: boolean;
    services: {
      multiProviderAi: boolean;
      contentModeration: boolean;
      factVerification: boolean;
      observability: boolean;
    };
  } {
    return {
      isInitialized: this.isInitialized,
      services: {
        multiProviderAi: this.isInitialized,
        contentModeration: true, // Always available (lazy initialization)
        factVerification: true,  // Always available (lazy initialization)
        observability: this.isInitialized
      }
    };
  }

  /**
   * Health check for all services
   */
  public async performHealthCheck(): Promise<{
    healthy: boolean;
    services: { [serviceName: string]: boolean };
  }> {
    const services: { [serviceName: string]: boolean } = {};
    
    try {
      // Check Multi-Provider AI Service
      if (this.isInitialized) {
        const multiProviderService = MultiProviderAiService.getInstance();
        const healthStatuses = multiProviderService.getProviderHealthStatuses();
        services.multiProviderAi = healthStatuses.some(status => status.isHealthy);
      } else {
        services.multiProviderAi = false;
      }

      // Check Observability Service
      if (this.isInitialized) {
        const observabilityService = ObservabilityService.getInstance();
        const observabilityMetrics = await observabilityService.getObservabilityMetrics();
        services.observability = observabilityMetrics.system.health > 50;
      } else {
        services.observability = false;
      }

      // Content Moderation and Fact Verification are always healthy 
      // (they don't depend on external services)
      services.contentModeration = true;
      services.factVerification = true;

      const healthy = Object.values(services).some(status => status);

      return { healthy, services };

    } catch (error) {
      logger.error('Health check failed', { error });
      return {
        healthy: false,
        services: {
          multiProviderAi: false,
          contentModeration: false,
          factVerification: false,
          observability: false
        }
      };
    }
  }
}

export default InitializationService;

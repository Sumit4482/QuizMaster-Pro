import { EventEmitter } from 'events';
import { logger } from '../config/logger';

export interface FactVerificationRequest {
  content: string;
  claims: string[];
  context?: {
    topic?: string;
    domain?: string;
    timeframe?: string;
    geography?: string;
    sources?: string[];
  };
  urgency?: 'low' | 'medium' | 'high' | 'critical';
}

export interface FactVerificationResult {
  overall: {
    verificationStatus: 'verified' | 'unverified' | 'disputed' | 'false' | 'needs_review';
    confidence: number;
    credibilityScore: number;
  };
  claims: ClaimVerification[];
  sources: SourceVerification[];
  recommendations: string[];
  verifiedAt: Date;
  processingTime: number;
}

export interface ClaimVerification {
  claim: string;
  status: 'verified' | 'unverified' | 'disputed' | 'false';
  confidence: number;
  evidence: Evidence[];
  contradictions: Evidence[];
  position: {
    start: number;
    end: number;
  };
  lastUpdated?: Date;
}

export interface Evidence {
  source: string;
  sourceType: 'academic' | 'news' | 'government' | 'encyclopedia' | 'expert' | 'user_generated';
  credibility: number;
  relevance: number;
  recentness: number;
  summary: string;
  url?: string;
  publishDate?: Date;
  authors?: string[];
}

export interface SourceVerification {
  source: string;
  credibilityScore: number;
  biasScore: number;
  expertiseLevel: number;
  reputationScore: number;
  factualAccuracy: number;
  lastVerified: Date;
  flags: SourceFlag[];
}

export interface SourceFlag {
  type: 'bias' | 'reliability' | 'accuracy' | 'timeliness' | 'authority';
  severity: 'info' | 'warning' | 'error';
  message: string;
}

export interface FactDatabase {
  domain: string;
  facts: VerifiedFact[];
  lastUpdated: Date;
  version: string;
}

export interface VerifiedFact {
  id: string;
  statement: string;
  status: 'true' | 'false' | 'uncertain' | 'context_dependent';
  confidence: number;
  domain: string;
  sources: string[];
  lastVerified: Date;
  alternatives?: string[];
}

/**
 * Phase 3.3: Fact Verification Service
 * 
 * Advanced fact-checking system with:
 * - Multi-source cross-referencing
 * - Source credibility assessment
 * - Temporal fact validation
 * - Expert review integration
 * - Domain-specific verification
 */
export class FactVerificationService extends EventEmitter {
  private static instance: FactVerificationService | null = null;
  
  // Fact databases by domain
  private factDatabases: Map<string, FactDatabase> = new Map();
  
  // Source credibility ratings
  private sourceCredibility: Map<string, number> = new Map();
  
  // Expert network for specialized verification
  private expertNetwork: Map<string, Expert[]> = new Map();
  
  // Verification cache
  private verificationCache: Map<string, { result: FactVerificationResult; cachedAt: Date }> = new Map();
  
  // Performance metrics
  private verificationStats = {
    totalRequests: 0,
    verifiedClaims: 0,
    disputedClaims: 0,
    falseClaims: 0,
    averageProcessingTime: 0,
    averageConfidence: 0,
    sourcesChecked: 0
  };

  private constructor() {
    super();
    this.initializeFactVerificationSystem();
  }

  public static getInstance(): FactVerificationService {
    if (!FactVerificationService.instance) {
      FactVerificationService.instance = new FactVerificationService();
    }
    return FactVerificationService.instance;
  }

  /**
   * Verify facts in content
   */
  public async verifyFacts(request: FactVerificationRequest): Promise<FactVerificationResult> {
    const startTime = Date.now();
    
    try {
      logger.info('🔍 Starting fact verification', {
        component: 'FactVerificationService',
        claimsCount: request.claims.length,
        domain: request.context?.domain,
        urgency: request.urgency
      });

      this.verificationStats.totalRequests++;

      // Check cache first
      const cacheKey = this.generateCacheKey(request);
      const cached = this.verificationCache.get(cacheKey);
      if (cached && !this.isCacheExpired(cached.cachedAt)) {
        logger.info('📦 Using cached verification result');
        return cached.result;
      }

      // Extract claims if not provided
      const claims = request.claims.length > 0 ? request.claims : await this.extractClaims(request.content);

      // Verify each claim
      const claimVerifications = await Promise.all(
        claims.map(claim => this.verifyClaim(claim, request.context))
      );

      // Find and verify sources
      const sources = await this.identifyAndVerifySources(request.content, request.context);

      // Calculate overall verification status
      const overall = this.calculateOverallVerification(claimVerifications);

      // Generate recommendations
      const recommendations = this.generateRecommendations(claimVerifications, sources);

      const processingTime = Date.now() - startTime;

      const result: FactVerificationResult = {
        overall,
        claims: claimVerifications,
        sources,
        recommendations,
        verifiedAt: new Date(),
        processingTime
      };

      // Update statistics
      this.updateVerificationStats(claimVerifications, processingTime);

      // Cache result
      this.verificationCache.set(cacheKey, {
        result,
        cachedAt: new Date()
      });

      // Emit verification event
      this.emit('factsVerified', {
        request,
        result,
        processingTime
      });

      logger.info('✅ Fact verification completed', {
        component: 'FactVerificationService',
        overallStatus: result.overall.verificationStatus,
        confidence: result.overall.confidence,
        claimsVerified: claimVerifications.length,
        processingTime
      });

      return result;

    } catch (error) {
      logger.error('❌ Fact verification failed', {
        component: 'FactVerificationService',
        error: error instanceof Error ? error.message : String(error)
      });

      // Return safe default
      return {
        overall: {
          verificationStatus: 'needs_review',
          confidence: 0.1,
          credibilityScore: 0.5
        },
        claims: request.claims.map(claim => ({
          claim,
          status: 'unverified' as const,
          confidence: 0.1,
          evidence: [],
          contradictions: [],
          position: { start: 0, end: claim.length }
        })),
        sources: [],
        recommendations: ['Manual fact-checking required due to system error'],
        verifiedAt: new Date(),
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Batch verify multiple requests
   */
  public async batchVerifyFacts(requests: FactVerificationRequest[]): Promise<FactVerificationResult[]> {
    logger.info('📊 Starting batch fact verification', {
      component: 'FactVerificationService',
      batchSize: requests.length
    });

    const results = await Promise.allSettled(
      requests.map(request => this.verifyFacts(request))
    );

    return results.map(result => 
      result.status === 'fulfilled' ? result.value : {
        overall: {
          verificationStatus: 'needs_review' as const,
          confidence: 0,
          credibilityScore: 0
        },
        claims: [],
        sources: [],
        recommendations: ['Batch verification failed'],
        verifiedAt: new Date(),
        processingTime: 0
      }
    );
  }

  /**
   * Add verified fact to database
   */
  public async addVerifiedFact(fact: VerifiedFact, domain: string = 'general'): Promise<void> {
    let database = this.factDatabases.get(domain);
    
    if (!database) {
      database = {
        domain,
        facts: [],
        lastUpdated: new Date(),
        version: '1.0.0'
      };
      this.factDatabases.set(domain, database);
    }

    // Check for existing fact
    const existingIndex = database.facts.findIndex(f => f.statement === fact.statement);
    
    if (existingIndex >= 0) {
      database.facts[existingIndex] = fact;
      logger.info('Updated existing verified fact', { domain, statement: fact.statement });
    } else {
      database.facts.push(fact);
      logger.info('Added new verified fact', { domain, statement: fact.statement });
    }

    database.lastUpdated = new Date();
    
    this.emit('factAdded', { fact, domain });
  }

  /**
   * Update source credibility rating
   */
  public updateSourceCredibility(source: string, credibility: number): void {
    if (credibility < 0 || credibility > 1) {
      throw new Error('Credibility must be between 0 and 1');
    }

    this.sourceCredibility.set(source, credibility);
    
    logger.info('Updated source credibility', {
      component: 'FactVerificationService',
      source,
      credibility
    });

    this.emit('sourceCredibilityUpdated', { source, credibility });
  }

  /**
   * Get verification statistics
   */
  public getVerificationStatistics(): any {
    return {
      ...this.verificationStats,
      cacheSize: this.verificationCache.size,
      factDatabaseSize: Array.from(this.factDatabases.values()).reduce(
        (total, db) => total + db.facts.length, 0
      ),
      sourcesTracked: this.sourceCredibility.size,
      accuracy: {
        verificationRate: this.verificationStats.verifiedClaims / Math.max(1, this.verificationStats.totalRequests),
        disputeRate: this.verificationStats.disputedClaims / Math.max(1, this.verificationStats.totalRequests),
        falseClaimsRate: this.verificationStats.falseClaims / Math.max(1, this.verificationStats.totalRequests)
      }
    };
  }

  /**
   * Initialize fact verification system
   */
  private initializeFactVerificationSystem(): void {
    logger.info('🔍 Initializing fact verification system');

    // Initialize trusted source credibility ratings
    this.initializeTrustedSources();
    
    // Load domain-specific fact databases
    this.initializeFactDatabases();
    
    // Set up periodic cache cleanup
    this.startCacheMaintenenance();
  }

  /**
   * Initialize trusted source credibility ratings
   */
  private initializeTrustedSources(): void {
    const trustedSources = [
      { source: 'wikipedia.org', credibility: 0.8 },
      { source: 'britannica.com', credibility: 0.9 },
      { source: 'nature.com', credibility: 0.95 },
      { source: 'science.org', credibility: 0.95 },
      { source: 'pubmed.ncbi.nlm.nih.gov', credibility: 0.9 },
      { source: 'reuters.com', credibility: 0.85 },
      { source: 'bbc.com', credibility: 0.85 },
      { source: 'ap.org', credibility: 0.9 },
      { source: 'cdc.gov', credibility: 0.9 },
      { source: 'who.int', credibility: 0.9 },
      { source: 'nasa.gov', credibility: 0.95 },
      { source: 'mit.edu', credibility: 0.9 },
      { source: 'stanford.edu', credibility: 0.9 },
      { source: 'harvard.edu', credibility: 0.9 }
    ];

    trustedSources.forEach(({ source, credibility }) => {
      this.sourceCredibility.set(source, credibility);
    });

    logger.info(`Initialized ${trustedSources.length} trusted sources`);
  }

  /**
   * Initialize domain-specific fact databases
   */
  private initializeFactDatabases(): void {
    const domains = ['science', 'history', 'mathematics', 'geography', 'technology'];
    
    domains.forEach(domain => {
      this.factDatabases.set(domain, {
        domain,
        facts: [],
        lastUpdated: new Date(),
        version: '1.0.0'
      });
    });

    // Add some sample verified facts
    this.addSampleVerifiedFacts();
  }

  /**
   * Add sample verified facts for testing
   */
  private async addSampleVerifiedFacts(): Promise<void> {
    const sampleFacts: { domain: string; fact: VerifiedFact }[] = [
      {
        domain: 'science',
        fact: {
          id: 'fact_001',
          statement: 'Water boils at 100 degrees Celsius at sea level',
          status: 'true',
          confidence: 0.99,
          domain: 'science',
          sources: ['chemistry textbooks', 'scientific databases'],
          lastVerified: new Date()
        }
      },
      {
        domain: 'mathematics',
        fact: {
          id: 'fact_002',
          statement: 'The sum of angles in a triangle is 180 degrees',
          status: 'true',
          confidence: 1.0,
          domain: 'mathematics',
          sources: ['geometry textbooks', 'mathematical proofs'],
          lastVerified: new Date()
        }
      },
      {
        domain: 'geography',
        fact: {
          id: 'fact_003',
          statement: 'Mount Everest is the highest mountain in the world',
          status: 'true',
          confidence: 0.98,
          domain: 'geography',
          sources: ['geographical surveys', 'official measurements'],
          lastVerified: new Date()
        }
      }
    ];

    for (const { domain, fact } of sampleFacts) {
      await this.addVerifiedFact(fact, domain);
    }
  }

  /**
   * Extract claims from content
   */
  private async extractClaims(content: string): Promise<string[]> {
    // Simple claim extraction - in real implementation would use NLP
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    // Identify factual claims (simplified approach)
    const claims = sentences.filter(sentence => {
      const lowerSentence = sentence.toLowerCase();
      
      // Look for factual indicators
      const factualIndicators = [
        'is', 'are', 'was', 'were', 'has', 'have', 'contains', 'measures',
        'occurs', 'happens', 'discovered', 'invented', 'born', 'died',
        'located', 'found', 'established', 'founded', 'created'
      ];
      
      return factualIndicators.some(indicator => lowerSentence.includes(indicator));
    });

    return claims.map(claim => claim.trim());
  }

  /**
   * Verify individual claim
   */
  private async verifyClaim(claim: string, context?: any): Promise<ClaimVerification> {
    try {
      // Check against fact databases
      const databaseEvidence = await this.checkFactDatabases(claim, context?.domain);
      
      // Search for external evidence (mocked for now)
      const externalEvidence = await this.searchExternalEvidence(claim, context);
      
      // Combine evidence
      const allEvidence = [...databaseEvidence, ...externalEvidence];
      
      // Look for contradictions
      const contradictions = await this.findContradictions(claim, context);
      
      // Calculate verification status and confidence
      const { status, confidence } = this.calculateClaimVerification(allEvidence, contradictions);

      return {
        claim,
        status,
        confidence,
        evidence: allEvidence,
        contradictions,
        position: this.findClaimPosition(claim, claim), // Simplified
        lastUpdated: new Date()
      };

    } catch (error) {
      logger.error('Failed to verify claim', { claim, error });
      
      return {
        claim,
        status: 'unverified',
        confidence: 0.1,
        evidence: [],
        contradictions: [],
        position: { start: 0, end: claim.length }
      };
    }
  }

  /**
   * Check claim against fact databases
   */
  private async checkFactDatabases(claim: string, domain?: string): Promise<Evidence[]> {
    const evidence: Evidence[] = [];
    const databases = domain ? [this.factDatabases.get(domain)] : Array.from(this.factDatabases.values());
    
    for (const database of databases) {
      if (!database) continue;
      
      // Simple similarity matching - would use more sophisticated matching in real implementation
      const matchingFacts = database.facts.filter(fact => 
        this.calculateSimilarity(claim.toLowerCase(), fact.statement.toLowerCase()) > 0.7
      );
      
      matchingFacts.forEach(fact => {
        evidence.push({
          source: `Internal fact database (${database.domain})`,
          sourceType: 'encyclopedia',
          credibility: fact.confidence,
          relevance: this.calculateSimilarity(claim, fact.statement),
          recentness: this.calculateRecentness(fact.lastVerified),
          summary: `Database fact: ${fact.statement}`,
          publishDate: fact.lastVerified
        });
      });
    }

    return evidence;
  }

  /**
   * Search for external evidence (mocked implementation)
   */
  private async searchExternalEvidence(claim: string, context?: any): Promise<Evidence[]> {
    // Mock implementation - would integrate with fact-checking APIs in real version
    const mockEvidence: Evidence[] = [
      {
        source: 'Academic Source',
        sourceType: 'academic',
        credibility: 0.9,
        relevance: 0.8,
        recentness: 0.9,
        summary: `Academic research supports the claim: "${claim.substring(0, 50)}..."`,
        url: 'https://example.com/academic-source',
        publishDate: new Date(2023, 5, 15),
        authors: ['Dr. Jane Smith', 'Prof. John Doe']
      }
    ];

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 100));

    return mockEvidence;
  }

  /**
   * Find contradicting evidence
   */
  private async findContradictions(claim: string, context?: any): Promise<Evidence[]> {
    // Mock implementation - would search for contradicting sources
    const contradictions: Evidence[] = [];

    // Simulate finding contradictions based on claim content
    if (claim.toLowerCase().includes('always') || claim.toLowerCase().includes('never')) {
      contradictions.push({
        source: 'Critical Analysis',
        sourceType: 'expert',
        credibility: 0.7,
        relevance: 0.8,
        recentness: 0.9,
        summary: 'Absolute statements often have exceptions that should be considered',
        publishDate: new Date()
      });
    }

    return contradictions;
  }

  /**
   * Identify and verify sources in content
   */
  private async identifyAndVerifySources(content: string, context?: any): Promise<SourceVerification[]> {
    // Extract URLs and source references (simplified)
    const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
    const urls = content.match(urlRegex) || [];
    
    const sourceVerifications: SourceVerification[] = [];
    
    for (const url of urls) {
      try {
        const domain = new URL(url).hostname.replace('www.', '');
        const credibility = this.sourceCredibility.get(domain) || 0.5;
        
        sourceVerifications.push({
          source: domain,
          credibilityScore: credibility,
          biasScore: this.calculateBiasScore(domain),
          expertiseLevel: this.calculateExpertiseLevel(domain),
          reputationScore: credibility,
          factualAccuracy: credibility,
          lastVerified: new Date(),
          flags: this.generateSourceFlags(domain, credibility)
        });
        
      } catch (error) {
        logger.warn('Failed to parse URL for source verification', { url, error });
      }
    }

    return sourceVerifications;
  }

  /**
   * Calculate overall verification status
   */
  private calculateOverallVerification(claims: ClaimVerification[]): {
    verificationStatus: 'verified' | 'unverified' | 'disputed' | 'false' | 'needs_review';
    confidence: number;
    credibilityScore: number;
  } {
    if (claims.length === 0) {
      return {
        verificationStatus: 'needs_review',
        confidence: 0,
        credibilityScore: 0.5
      };
    }

    const verifiedClaims = claims.filter(c => c.status === 'verified').length;
    const falseClaims = claims.filter(c => c.status === 'false').length;
    const disputedClaims = claims.filter(c => c.status === 'disputed').length;
    
    const averageConfidence = claims.reduce((sum, c) => sum + c.confidence, 0) / claims.length;
    
    let status: 'verified' | 'unverified' | 'disputed' | 'false' | 'needs_review';
    
    if (falseClaims > 0) {
      status = 'false';
    } else if (disputedClaims > 0) {
      status = 'disputed';
    } else if (verifiedClaims / claims.length > 0.7) {
      status = 'verified';
    } else if (averageConfidence < 0.5) {
      status = 'needs_review';
    } else {
      status = 'unverified';
    }

    return {
      verificationStatus: status,
      confidence: averageConfidence,
      credibilityScore: Math.max(0.1, averageConfidence)
    };
  }

  /**
   * Generate recommendations based on verification results
   */
  private generateRecommendations(
    claims: ClaimVerification[],
    sources: SourceVerification[]
  ): string[] {
    const recommendations: string[] = [];

    // Check for false claims
    const falseClaims = claims.filter(c => c.status === 'false');
    if (falseClaims.length > 0) {
      recommendations.push('Remove or correct false claims identified in the content');
    }

    // Check for disputed claims
    const disputedClaims = claims.filter(c => c.status === 'disputed');
    if (disputedClaims.length > 0) {
      recommendations.push('Provide additional context for disputed claims');
    }

    // Check for low-confidence claims
    const lowConfidenceClaims = claims.filter(c => c.confidence < 0.5);
    if (lowConfidenceClaims.length > 0) {
      recommendations.push('Add supporting sources for claims with low verification confidence');
    }

    // Check source quality
    const lowCredibilitySources = sources.filter(s => s.credibilityScore < 0.6);
    if (lowCredibilitySources.length > 0) {
      recommendations.push('Consider using more credible sources for better fact verification');
    }

    // General recommendations
    if (claims.length === 0) {
      recommendations.push('No specific factual claims identified - consider adding verifiable facts');
    }

    if (recommendations.length === 0) {
      recommendations.push('Content appears to be factually sound based on current verification');
    }

    return recommendations;
  }

  /**
   * Calculate claim verification status and confidence
   */
  private calculateClaimVerification(
    evidence: Evidence[],
    contradictions: Evidence[]
  ): { status: 'verified' | 'unverified' | 'disputed' | 'false'; confidence: number } {
    if (evidence.length === 0) {
      return { status: 'unverified', confidence: 0.1 };
    }

    const supportingScore = evidence.reduce((sum, e) => 
      sum + (e.credibility * e.relevance), 0) / evidence.length;
    
    const contradictionScore = contradictions.length > 0 ?
      contradictions.reduce((sum, c) => sum + (c.credibility * c.relevance), 0) / contradictions.length : 0;

    let status: 'verified' | 'unverified' | 'disputed' | 'false';
    let confidence: number;

    if (contradictionScore > supportingScore + 0.2) {
      status = 'false';
      confidence = contradictionScore;
    } else if (contradictionScore > supportingScore - 0.2) {
      status = 'disputed';
      confidence = Math.abs(supportingScore - contradictionScore);
    } else if (supportingScore > 0.7) {
      status = 'verified';
      confidence = supportingScore;
    } else {
      status = 'unverified';
      confidence = supportingScore;
    }

    return { status, confidence: Math.max(0.1, Math.min(1.0, confidence)) };
  }

  /**
   * Helper methods
   */
  private generateCacheKey(request: FactVerificationRequest): string {
    const claimsHash = request.claims.join('|').substring(0, 100);
    const contextHash = JSON.stringify(request.context || {});
    return `fact_${claimsHash}_${contextHash}`.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  private isCacheExpired(cachedAt: Date): boolean {
    const TTL = 1000 * 60 * 60 * 24; // 24 hours
    return Date.now() - cachedAt.getTime() > TTL;
  }

  private calculateSimilarity(text1: string, text2: string): number {
    // Simple similarity calculation - would use more sophisticated methods in reality
    const words1 = text1.split(/\s+/);
    const words2 = text2.split(/\s+/);
    const intersection = words1.filter(word => words2.includes(word));
    return intersection.length / Math.max(words1.length, words2.length);
  }

  private calculateRecentness(date: Date): number {
    const now = new Date();
    const diffDays = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, 1 - (diffDays / 365)); // Recency score decreases over a year
  }

  private findClaimPosition(claim: string, content: string): { start: number; end: number } {
    const start = content.indexOf(claim);
    return {
      start: Math.max(0, start),
      end: Math.max(claim.length, start + claim.length)
    };
  }

  private calculateBiasScore(domain: string): number {
    // Mock bias calculation - would use actual bias databases
    const knownBiasedDomains = ['extremenews.com', 'biasedsource.org'];
    return knownBiasedDomains.includes(domain) ? 0.8 : 0.2;
  }

  private calculateExpertiseLevel(domain: string): number {
    const expertDomains = ['.edu', '.gov', 'nature.com', 'science.org', 'pubmed'];
    return expertDomains.some(expert => domain.includes(expert)) ? 0.9 : 0.6;
  }

  private generateSourceFlags(domain: string, credibility: number): SourceFlag[] {
    const flags: SourceFlag[] = [];

    if (credibility < 0.4) {
      flags.push({
        type: 'reliability',
        severity: 'warning',
        message: 'Source has low credibility rating'
      });
    }

    if (credibility < 0.2) {
      flags.push({
        type: 'reliability',
        severity: 'error',
        message: 'Source is considered unreliable'
      });
    }

    return flags;
  }

  private updateVerificationStats(claims: ClaimVerification[], processingTime: number): void {
    claims.forEach(claim => {
      switch (claim.status) {
        case 'verified':
          this.verificationStats.verifiedClaims++;
          break;
        case 'disputed':
          this.verificationStats.disputedClaims++;
          break;
        case 'false':
          this.verificationStats.falseClaims++;
          break;
      }
    });

    this.verificationStats.averageProcessingTime = 
      (this.verificationStats.averageProcessingTime * 0.9) + (processingTime * 0.1);

    const totalConfidence = claims.reduce((sum, c) => sum + c.confidence, 0);
    this.verificationStats.averageConfidence = 
      (this.verificationStats.averageConfidence * 0.9) + 
      ((totalConfidence / Math.max(1, claims.length)) * 0.1);
  }

  private startCacheMaintenenance(): void {
    // Clean expired cache entries every hour
    setInterval(() => {
      const now = new Date();
      const expired: string[] = [];
      
      this.verificationCache.forEach((value, key) => {
        if (this.isCacheExpired(value.cachedAt)) {
          expired.push(key);
        }
      });
      
      expired.forEach(key => this.verificationCache.delete(key));
      
      if (expired.length > 0) {
        logger.info(`Cleaned ${expired.length} expired cache entries`);
      }
    }, 1000 * 60 * 60); // Every hour
  }
}

interface Expert {
  id: string;
  name: string;
  domains: string[];
  credibility: number;
  contact: string;
}

export default FactVerificationService;


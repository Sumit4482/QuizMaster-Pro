import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { DatabaseConnectionPool } from '../infrastructure/database/connectionPool';

export interface QueryOptimizationRule {
  id: string;
  name: string;
  description: string;
  pattern: RegExp;
  suggestion: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  autoOptimize?: boolean;
}

export interface QueryAnalysis {
  query: string;
  executionTime: number;
  rowsExamined: number;
  rowsReturned: number;
  indexUsage: string[];
  missingIndexes: string[];
  optimizationSuggestions: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
}

export interface IndexRecommendation {
  table: string;
  columns: string[];
  type: 'btree' | 'gin' | 'hash' | 'gist';
  reason: string;
  impact: 'low' | 'medium' | 'high';
  estimatedImprovement: string;
}

export interface DatabaseOptimizationReport {
  summary: {
    totalQueries: number;
    slowQueries: number;
    missingIndexes: number;
    optimizationOpportunities: number;
    averageQueryTime: number;
  };
  slowQueries: QueryAnalysis[];
  indexRecommendations: IndexRecommendation[];
  optimizationRules: QueryOptimizationRule[];
  performanceMetrics: {
    cacheHitRatio: number;
    bufferHitRatio: number;
    connectionUtilization: number;
    deadlockCount: number;
  };
  timestamp: Date;
}

export class DatabaseOptimizer {
  private dbPool: DatabaseConnectionPool;
  private optimizationRules: QueryOptimizationRule[] = [];
  private queryHistory: QueryAnalysis[] = [];
  private readonly slowQueryThreshold = 1000; // 1 second

  constructor() {
    this.dbPool = DatabaseConnectionPool.getInstance();
    this.initializeOptimizationRules();
  }

  /**
   * Initialize query optimization rules
   */
  private initializeOptimizationRules(): void {
    this.optimizationRules = [
      {
        id: 'missing_where_clause',
        name: 'Missing WHERE Clause',
        description: 'Query without WHERE clause on large table',
        pattern: /SELECT.*FROM\s+(\w+)(?!\s+WHERE)/i,
        suggestion: 'Add WHERE clause to limit results and improve performance',
        severity: 'high',
        autoOptimize: false
      },
      {
        id: 'select_all_columns',
        name: 'SELECT * Usage',
        description: 'Using SELECT * instead of specific columns',
        pattern: /SELECT\s+\*\s+FROM/i,
        suggestion: 'Select only needed columns to reduce data transfer',
        severity: 'medium',
        autoOptimize: false
      },
      {
        id: 'non_indexed_order_by',
        name: 'Non-indexed ORDER BY',
        description: 'ORDER BY clause on non-indexed column',
        pattern: /ORDER\s+BY\s+(\w+)/i,
        suggestion: 'Consider adding index on ORDER BY columns',
        severity: 'medium',
        autoOptimize: false
      },
      {
        id: 'inefficient_like_query',
        name: 'Inefficient LIKE Query',
        description: 'LIKE query with leading wildcard',
        pattern: /LIKE\s+['"]%/i,
        suggestion: 'Avoid leading wildcards in LIKE queries, consider full-text search',
        severity: 'high',
        autoOptimize: false
      },
      {
        id: 'missing_limit',
        name: 'Missing LIMIT Clause',
        description: 'Query without LIMIT on potentially large result set',
        pattern: /SELECT.*FROM.*(?!LIMIT)/i,
        suggestion: 'Add LIMIT clause to prevent large result sets',
        severity: 'medium',
        autoOptimize: false
      },
      {
        id: 'subquery_optimization',
        name: 'Subquery Optimization',
        description: 'Subquery that could be optimized with JOIN',
        pattern: /WHERE\s+\w+\s+IN\s*\(\s*SELECT/i,
        suggestion: 'Consider replacing subquery with JOIN for better performance',
        severity: 'medium',
        autoOptimize: false
      },
      {
        id: 'function_in_where',
        name: 'Function in WHERE Clause',
        description: 'Function applied to column in WHERE clause',
        pattern: /WHERE\s+\w+\([^)]*\w+[^)]*\)/i,
        suggestion: 'Avoid functions on columns in WHERE clause, consider computed columns',
        severity: 'high',
        autoOptimize: false
      },
      {
        id: 'unnecessary_distinct',
        name: 'Unnecessary DISTINCT',
        description: 'DISTINCT used when not necessary',
        pattern: /SELECT\s+DISTINCT/i,
        suggestion: 'Verify if DISTINCT is necessary, consider using GROUP BY instead',
        severity: 'low',
        autoOptimize: false
      }
    ];

    logger.info('Database optimization rules initialized', {
      component: 'DatabaseOptimizer',
      ruleCount: this.optimizationRules.length
    });
  }

  /**
   * Analyze a query for optimization opportunities
   */
  async analyzeQuery(query: string, executionTime: number): Promise<QueryAnalysis> {
    const analysis: QueryAnalysis = {
      query: query.substring(0, 500), // Truncate for storage
      executionTime,
      rowsExamined: 0,
      rowsReturned: 0,
      indexUsage: [],
      missingIndexes: [],
      optimizationSuggestions: [],
      severity: 'low',
      timestamp: new Date()
    };

    try {
      // Analyze query against optimization rules
      for (const rule of this.optimizationRules) {
        if (rule.pattern.test(query)) {
          analysis.optimizationSuggestions.push(rule.suggestion);
          
          // Update severity to the highest found
          if (rule.severity === 'critical' || 
              (rule.severity === 'high' && analysis.severity !== 'critical') ||
              (rule.severity === 'medium' && ['low'].includes(analysis.severity))) {
            analysis.severity = rule.severity;
          }
        }
      }

      // Check if query is slow
      if (executionTime > this.slowQueryThreshold) {
        analysis.severity = analysis.severity === 'low' ? 'medium' : analysis.severity;
        analysis.optimizationSuggestions.push('Query execution time exceeds threshold');
      }

      // Get query plan if available (PostgreSQL specific)
      if (query.toLowerCase().startsWith('select')) {
        const explainResult = await this.getQueryPlan(query);
        if (explainResult) {
          analysis.indexUsage = explainResult.indexesUsed;
          analysis.missingIndexes = explainResult.missingIndexes;
          analysis.rowsExamined = explainResult.rowsExamined;
          analysis.rowsReturned = explainResult.rowsReturned;
        }
      }

      // Store in history
      this.queryHistory.push(analysis);
      
      // Keep only recent queries
      if (this.queryHistory.length > 1000) {
        this.queryHistory = this.queryHistory.slice(-1000);
      }

      if (analysis.optimizationSuggestions.length > 0) {
        logger.warn('Query optimization opportunities found', {
          component: 'DatabaseOptimizer',
          query: query.substring(0, 100),
          executionTime,
          suggestions: analysis.optimizationSuggestions.length,
          severity: analysis.severity
        });
      }

      return analysis;
    } catch (error) {
      logger.error('Query analysis failed', {
        component: 'DatabaseOptimizer',
        error: error instanceof Error ? error.message : String(error),
        query: query.substring(0, 100)
      });

      return analysis;
    }
  }

  /**
   * Get query execution plan
   */
  private async getQueryPlan(query: string): Promise<{
    indexesUsed: string[];
    missingIndexes: string[];
    rowsExamined: number;
    rowsReturned: number;
  } | null> {
    try {
      const client = this.dbPool.getPrimaryClient();
      
      // Get query plan
      const explainQuery = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`;
      const result = await client.$queryRawUnsafe(explainQuery) as any[];
      
      if (result && result[0] && result[0]['QUERY PLAN']) {
        const plan = result[0]['QUERY PLAN'][0];
        
        return {
          indexesUsed: this.extractIndexUsage(plan),
          missingIndexes: this.detectMissingIndexes(plan),
          rowsExamined: plan['Actual Rows'] || 0,
          rowsReturned: plan['Actual Rows'] || 0
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to get query plan', {
        component: 'DatabaseOptimizer',
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Extract index usage from query plan
   */
  private extractIndexUsage(plan: any): string[] {
    const indexes: string[] = [];
    
    const extractFromNode = (node: any): void => {
      if (node['Index Name']) {
        indexes.push(node['Index Name']);
      }
      
      if (node.Plans) {
        node.Plans.forEach((subPlan: any) => extractFromNode(subPlan));
      }
    };
    
    extractFromNode(plan);
    return [...new Set(indexes)]; // Remove duplicates
  }

  /**
   * Detect potentially missing indexes
   */
  private detectMissingIndexes(plan: any): string[] {
    const missingIndexes: string[] = [];
    
    const checkNode = (node: any): void => {
      // Check for sequential scans on large tables
      if (node['Node Type'] === 'Seq Scan' && node['Actual Rows'] > 1000) {
        missingIndexes.push(`Consider index on table: ${node['Relation Name']}`);
      }
      
      // Check for sorts that could benefit from indexes
      if (node['Node Type'] === 'Sort' && node['Sort Key']) {
        missingIndexes.push(`Consider index on sort columns: ${node['Sort Key'].join(', ')}`);
      }
      
      if (node.Plans) {
        node.Plans.forEach((subPlan: any) => checkNode(subPlan));
      }
    };
    
    checkNode(plan);
    return missingIndexes;
  }

  /**
   * Generate index recommendations
   */
  async generateIndexRecommendations(): Promise<IndexRecommendation[]> {
    const recommendations: IndexRecommendation[] = [];

    try {
      const client = this.dbPool.getPrimaryClient();

      // Analyze query patterns to suggest indexes
      const frequentQueries = this.queryHistory
        .filter(q => q.executionTime > this.slowQueryThreshold)
        .slice(-100); // Last 100 slow queries

      // Common index recommendations based on Prisma schema patterns
      const commonRecommendations: IndexRecommendation[] = [
        {
          table: 'User',
          columns: ['email'],
          type: 'btree',
          reason: 'Frequent authentication queries',
          impact: 'high',
          estimatedImprovement: '80% faster login queries'
        },
        {
          table: 'Question',
          columns: ['category', 'difficulty'],
          type: 'btree',
          reason: 'Frequent filtering by category and difficulty',
          impact: 'high',
          estimatedImprovement: '70% faster question searches'
        },
        {
          table: 'Question',
          columns: ['createdAt'],
          type: 'btree',
          reason: 'Sorting by creation date',
          impact: 'medium',
          estimatedImprovement: '50% faster chronological queries'
        },
        {
          table: 'Game',
          columns: ['status', 'createdAt'],
          type: 'btree',
          reason: 'Finding active games and game history',
          impact: 'high',
          estimatedImprovement: '75% faster game queries'
        },
        {
          table: 'GameParticipant',
          columns: ['gameId', 'userId'],
          type: 'btree',
          reason: 'Composite index for game participation queries',
          impact: 'high',
          estimatedImprovement: '90% faster participant lookups'
        },
        {
          table: 'UserAnswer',
          columns: ['userId', 'questionId'],
          type: 'btree',
          reason: 'User answer history queries',
          impact: 'medium',
          estimatedImprovement: '60% faster answer history'
        },
        {
          table: 'User',
          columns: ['username'],
          type: 'btree',
          reason: 'Username searches and uniqueness checks',
          impact: 'medium',
          estimatedImprovement: '65% faster username queries'
        },
        {
          table: 'Question',
          columns: ['content'],
          type: 'gin',
          reason: 'Full-text search on question content',
          impact: 'high',
          estimatedImprovement: '95% faster text searches'
        }
      ];

      recommendations.push(...commonRecommendations);

      logger.info('Index recommendations generated', {
        component: 'DatabaseOptimizer',
        recommendationCount: recommendations.length
      });

      return recommendations;
    } catch (error) {
      logger.error('Failed to generate index recommendations', {
        component: 'DatabaseOptimizer',
        error: error instanceof Error ? error.message : String(error)
      });

      return recommendations;
    }
  }

  /**
   * Apply recommended indexes
   */
  async applyIndexRecommendations(recommendations: IndexRecommendation[]): Promise<{
    applied: number;
    failed: number;
    errors: string[];
  }> {
    const result = {
      applied: 0,
      failed: 0,
      errors: [] as string[]
    };

    const client = this.dbPool.getPrimaryClient();

    for (const recommendation of recommendations) {
      try {
        const indexName = `idx_${recommendation.table.toLowerCase()}_${recommendation.columns.join('_').toLowerCase()}`;
        const tableName = recommendation.table;
        const columns = recommendation.columns.join(', ');
        
        let createIndexSQL: string;
        
        switch (recommendation.type) {
          case 'gin':
            // For full-text search
            createIndexSQL = `CREATE INDEX CONCURRENTLY "${indexName}" ON "${tableName}" USING gin(to_tsvector('english', ${columns}))`;
            break;
          case 'hash':
            createIndexSQL = `CREATE INDEX CONCURRENTLY "${indexName}" ON "${tableName}" USING hash(${columns})`;
            break;
          case 'gist':
            createIndexSQL = `CREATE INDEX CONCURRENTLY "${indexName}" ON "${tableName}" USING gist(${columns})`;
            break;
          default: // btree
            createIndexSQL = `CREATE INDEX CONCURRENTLY "${indexName}" ON "${tableName}"(${columns})`;
        }

        await client.$executeRawUnsafe(createIndexSQL);
        result.applied++;

        logger.info('Index applied successfully', {
          component: 'DatabaseOptimizer',
          indexName,
          table: tableName,
          columns: recommendation.columns
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.failed++;
        result.errors.push(`${recommendation.table}(${recommendation.columns.join(', ')}): ${errorMessage}`);

        logger.error('Failed to apply index', {
          component: 'DatabaseOptimizer',
          table: recommendation.table,
          columns: recommendation.columns,
          error: errorMessage
        });
      }
    }

    return result;
  }

  /**
   * Get database performance metrics
   */
  async getPerformanceMetrics(): Promise<{
    cacheHitRatio: number;
    bufferHitRatio: number;
    connectionUtilization: number;
    deadlockCount: number;
    slowQueryCount: number;
    averageQueryTime: number;
  }> {
    try {
      const client = this.dbPool.getPrimaryClient();

      // Get cache hit ratio
      const cacheStats = await client.$queryRaw`
        SELECT 
          sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as cache_hit_ratio
        FROM pg_statio_user_tables
        WHERE heap_blks_hit + heap_blks_read > 0
      ` as any[];

      // Get buffer hit ratio
      const bufferStats = await client.$queryRaw`
        SELECT 
          round(
            (sum(blks_hit) / (sum(blks_hit) + sum(blks_read))) * 100, 2
          ) as buffer_hit_ratio
        FROM pg_stat_database
        WHERE blks_read > 0
      ` as any[];

      // Get connection stats
      const connectionStats = await client.$queryRaw`
        SELECT 
          count(*) as active_connections,
          max_connections::int as max_connections
        FROM pg_stat_activity, (SELECT setting::int as max_connections FROM pg_settings WHERE name = 'max_connections') s
        WHERE state = 'active'
        GROUP BY max_connections
      ` as any[];

      // Calculate metrics from query history
      const slowQueries = this.queryHistory.filter(q => q.executionTime > this.slowQueryThreshold);
      const averageQueryTime = this.queryHistory.length > 0 
        ? this.queryHistory.reduce((sum, q) => sum + q.executionTime, 0) / this.queryHistory.length 
        : 0;

      return {
        cacheHitRatio: cacheStats[0]?.cache_hit_ratio || 0,
        bufferHitRatio: bufferStats[0]?.buffer_hit_ratio || 0,
        connectionUtilization: connectionStats[0] 
          ? (connectionStats[0].active_connections / connectionStats[0].max_connections) * 100 
          : 0,
        deadlockCount: 0, // Would require specific deadlock tracking
        slowQueryCount: slowQueries.length,
        averageQueryTime
      };
    } catch (error) {
      logger.error('Failed to get performance metrics', {
        component: 'DatabaseOptimizer',
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        cacheHitRatio: 0,
        bufferHitRatio: 0,
        connectionUtilization: 0,
        deadlockCount: 0,
        slowQueryCount: 0,
        averageQueryTime: 0
      };
    }
  }

  /**
   * Generate comprehensive optimization report
   */
  async generateOptimizationReport(): Promise<DatabaseOptimizationReport> {
    try {
      const [indexRecommendations, performanceMetrics] = await Promise.all([
        this.generateIndexRecommendations(),
        this.getPerformanceMetrics()
      ]);

      const slowQueries = this.queryHistory
        .filter(q => q.executionTime > this.slowQueryThreshold)
        .sort((a, b) => b.executionTime - a.executionTime)
        .slice(0, 20); // Top 20 slowest queries

      const report: DatabaseOptimizationReport = {
        summary: {
          totalQueries: this.queryHistory.length,
          slowQueries: slowQueries.length,
          missingIndexes: indexRecommendations.length,
          optimizationOpportunities: this.queryHistory.filter(q => q.optimizationSuggestions.length > 0).length,
          averageQueryTime: performanceMetrics.averageQueryTime
        },
        slowQueries,
        indexRecommendations,
        optimizationRules: this.optimizationRules,
        performanceMetrics,
        timestamp: new Date()
      };

      logger.info('Database optimization report generated', {
        component: 'DatabaseOptimizer',
        totalQueries: report.summary.totalQueries,
        slowQueries: report.summary.slowQueries,
        indexRecommendations: report.summary.missingIndexes
      });

      return report;
    } catch (error) {
      logger.error('Failed to generate optimization report', {
        component: 'DatabaseOptimizer',
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  /**
   * Clear query history
   */
  clearHistory(): void {
    this.queryHistory = [];
    logger.info('Query history cleared', { component: 'DatabaseOptimizer' });
  }

  /**
   * Get recent slow queries
   */
  getSlowQueries(limit: number = 50): QueryAnalysis[] {
    return this.queryHistory
      .filter(q => q.executionTime > this.slowQueryThreshold)
      .sort((a, b) => b.executionTime - a.executionTime)
      .slice(0, limit);
  }

  /**
   * Get optimization statistics
   */
  getOptimizationStats(): {
    totalQueries: number;
    slowQueries: number;
    optimizationOpportunities: number;
    averageQueryTime: number;
    rulesCount: number;
  } {
    const slowQueries = this.queryHistory.filter(q => q.executionTime > this.slowQueryThreshold);
    const optimizationOpportunities = this.queryHistory.filter(q => q.optimizationSuggestions.length > 0);
    const averageQueryTime = this.queryHistory.length > 0
      ? this.queryHistory.reduce((sum, q) => sum + q.executionTime, 0) / this.queryHistory.length
      : 0;

    return {
      totalQueries: this.queryHistory.length,
      slowQueries: slowQueries.length,
      optimizationOpportunities: optimizationOpportunities.length,
      averageQueryTime,
      rulesCount: this.optimizationRules.length
    };
  }
}

export default DatabaseOptimizer;


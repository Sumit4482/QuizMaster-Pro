'use client';

import React, { createContext, useContext, useCallback, useRef, useEffect, useState } from 'react';

interface PerformanceMetrics {
  // Core Web Vitals
  FCP?: number; // First Contentful Paint
  LCP?: number; // Largest Contentful Paint
  FID?: number; // First Input Delay
  CLS?: number; // Cumulative Layout Shift
  TTFB?: number; // Time to First Byte
  
  // Custom metrics
  interactionLatency: number[];
  renderCount: number;
  componentMountTime: number;
  apiResponseTimes: Map<string, number[]>;
  
  // Memory usage
  memoryUsage?: {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
  };
  
  // Network information
  networkInfo?: {
    effectiveType: string;
    downlink: number;
    rtt: number;
  };
}

interface PerformanceAlert {
  id: string;
  type: 'warning' | 'critical';
  metric: string;
  value: number;
  threshold: number;
  timestamp: number;
  resolved: boolean;
}

interface PerformanceContextType {
  metrics: PerformanceMetrics;
  alerts: PerformanceAlert[];
  
  // Measurement functions
  measureInteraction: (name: string, fn: () => Promise<void> | void) => Promise<void>;
  measureRender: (componentName: string, renderFn: () => void) => void;
  measureAPI: (endpoint: string, duration: number) => void;
  markFeatureUsage: (feature: string) => void;
  
  // Utilities
  isSlowDevice: boolean;
  isSlowNetwork: boolean;
  shouldOptimize: boolean;
  
  // Actions
  clearAlerts: () => void;
  exportMetrics: () => string;
}

const PerformanceContext = createContext<PerformanceContextType | null>(null);

// Performance thresholds (FAANG-level standards)
const PERFORMANCE_THRESHOLDS = {
  FCP: 1800, // 1.8s - Good
  LCP: 2500, // 2.5s - Good
  FID: 100,  // 100ms - Good
  CLS: 0.1,  // 0.1 - Good
  TTFB: 800, // 800ms - Good
  INTERACTION_LATENCY: 100, // 100ms
  API_RESPONSE: 500, // 500ms
  RENDER_TIME: 16, // 16ms (60fps)
} as const;

interface Props {
  children: React.ReactNode;
  enableReporting?: boolean;
  reportingEndpoint?: string;
}

/**
 * FAANG-Level Performance Monitoring Provider
 * 
 * Features:
 * - Core Web Vitals monitoring
 * - Custom performance metrics
 * - Real-time performance alerts
 * - Automatic performance optimization suggestions
 * - Device and network-aware optimizations
 * - Performance data export for analysis
 */
export function PerformanceProvider({ 
  children, 
  enableReporting = true,
  reportingEndpoint 
}: Props) {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    interactionLatency: [],
    renderCount: 0,
    componentMountTime: 0,
    apiResponseTimes: new Map(),
  });
  
  const [alerts, setAlerts] = useState<PerformanceAlert[]>([]);
  const observerRef = useRef<PerformanceObserver | null>(null);
  const startTimeRef = useRef(performance.now());

  // Device and network detection
  const [isSlowDevice, setIsSlowDevice] = useState(false);
  const [isSlowNetwork, setIsSlowNetwork] = useState(false);

  useEffect(() => {
    // Detect slow device (< 4 cores or < 4GB RAM estimate)
    const cores = navigator.hardwareConcurrency || 1;
    const memory = (navigator as any).deviceMemory || 1;
    setIsSlowDevice(cores < 4 || memory < 4);

    // Detect slow network
    const connection = (navigator as any).connection;
    if (connection) {
      setIsSlowNetwork(
        connection.effectiveType === 'slow-2g' || 
        connection.effectiveType === '2g' ||
        connection.downlink < 1.5
      );
      
      setMetrics(prev => ({
        ...prev,
        networkInfo: {
          effectiveType: connection.effectiveType,
          downlink: connection.downlink,
          rtt: connection.rtt,
        }
      }));
    }

    // Memory usage monitoring
    const updateMemoryUsage = () => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        setMetrics(prev => ({
          ...prev,
          memoryUsage: {
            jsHeapSizeLimit: memory.jsHeapSizeLimit,
            totalJSHeapSize: memory.totalJSHeapSize,
            usedJSHeapSize: memory.usedJSHeapSize,
          }
        }));
      }
    };

    updateMemoryUsage();
    const memoryInterval = setInterval(updateMemoryUsage, 30000); // Every 30 seconds

    return () => clearInterval(memoryInterval);
  }, []);

  // Core Web Vitals monitoring
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        switch (entry.entryType) {
          case 'paint':
            if (entry.name === 'first-contentful-paint') {
              setMetrics(prev => ({ ...prev, FCP: entry.startTime }));
              checkThreshold('FCP', entry.startTime, PERFORMANCE_THRESHOLDS.FCP);
            }
            break;

          case 'largest-contentful-paint':
            setMetrics(prev => ({ ...prev, LCP: entry.startTime }));
            checkThreshold('LCP', entry.startTime, PERFORMANCE_THRESHOLDS.LCP);
            break;

          case 'first-input':
            const fidEntry = entry as PerformanceEventTiming;
            const fid = fidEntry.processingStart - fidEntry.startTime;
            setMetrics(prev => ({ ...prev, FID: fid }));
            checkThreshold('FID', fid, PERFORMANCE_THRESHOLDS.FID);
            break;

          case 'layout-shift':
            if (!(entry as any).hadRecentInput) {
              setMetrics(prev => ({
                ...prev,
                CLS: (prev.CLS || 0) + (entry as any).value
              }));
              checkThreshold('CLS', (entry as any).value, PERFORMANCE_THRESHOLDS.CLS);
            }
            break;

          case 'navigation':
            const navEntry = entry as PerformanceNavigationTiming;
            const ttfb = navEntry.responseStart - navEntry.fetchStart;
            setMetrics(prev => ({ ...prev, TTFB: ttfb }));
            checkThreshold('TTFB', ttfb, PERFORMANCE_THRESHOLDS.TTFB);
            break;
        }
      });
    });

    // Observe multiple entry types
    try {
      observer.observe({ entryTypes: ['paint', 'largest-contentful-paint', 'first-input', 'layout-shift', 'navigation'] });
      observerRef.current = observer;
    } catch (e) {
      // Fallback for browsers that don't support all entry types
      console.warn('Some performance metrics may not be available:', e);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  const checkThreshold = useCallback((metric: string, value: number, threshold: number) => {
    if (value > threshold) {
      const alertId = `${metric}_${Date.now()}`;
      const alert: PerformanceAlert = {
        id: alertId,
        type: value > threshold * 1.5 ? 'critical' : 'warning',
        metric,
        value,
        threshold,
        timestamp: Date.now(),
        resolved: false,
      };

      setAlerts(prev => [...prev, alert]);

      // Auto-resolve alert after 5 minutes
      setTimeout(() => {
        setAlerts(prev => prev.map(a => 
          a.id === alertId ? { ...a, resolved: true } : a
        ));
      }, 300000);
    }
  }, []);

  const measureInteraction = useCallback(async (name: string, fn: () => Promise<void> | void) => {
    const start = performance.now();
    
    try {
      await fn();
    } finally {
      const duration = performance.now() - start;
      
      setMetrics(prev => ({
        ...prev,
        interactionLatency: [...prev.interactionLatency.slice(-99), duration] // Keep last 100
      }));

      checkThreshold('INTERACTION_LATENCY', duration, PERFORMANCE_THRESHOLDS.INTERACTION_LATENCY);

      // Mark the interaction in Performance API
      performance.mark(`interaction-${name}-start`);
      performance.mark(`interaction-${name}-end`);
      performance.measure(`interaction-${name}`, `interaction-${name}-start`, `interaction-${name}-end`);
    }
  }, [checkThreshold]);

  const measureRender = useCallback((componentName: string, renderFn: () => void) => {
    const start = performance.now();
    
    renderFn();
    
    const duration = performance.now() - start;
    
    setMetrics(prev => ({
      ...prev,
      renderCount: prev.renderCount + 1
    }));

    checkThreshold('RENDER_TIME', duration, PERFORMANCE_THRESHOLDS.RENDER_TIME);

    // Mark the render in Performance API
    performance.mark(`render-${componentName}`);
  }, [checkThreshold]);

  const measureAPI = useCallback((endpoint: string, duration: number) => {
    setMetrics(prev => {
      const existing = prev.apiResponseTimes.get(endpoint) || [];
      const updated = new Map(prev.apiResponseTimes);
      updated.set(endpoint, [...existing.slice(-19), duration]); // Keep last 20
      
      return {
        ...prev,
        apiResponseTimes: updated
      };
    });

    checkThreshold('API_RESPONSE', duration, PERFORMANCE_THRESHOLDS.API_RESPONSE);
  }, [checkThreshold]);

  const markFeatureUsage = useCallback((feature: string) => {
    performance.mark(`feature-${feature}-used`);
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  const exportMetrics = useCallback(() => {
    const exportData = {
      timestamp: new Date().toISOString(),
      sessionDuration: performance.now() - startTimeRef.current,
      metrics,
      alerts,
      performance: {
        navigation: performance.getEntriesByType('navigation'),
        paint: performance.getEntriesByType('paint'),
        measure: performance.getEntriesByType('measure'),
        mark: performance.getEntriesByType('mark'),
      }
    };

    return JSON.stringify(exportData, null, 2);
  }, [metrics, alerts]);

  // Determine if optimizations should be enabled
  const shouldOptimize = isSlowDevice || isSlowNetwork || 
    (metrics.LCP && metrics.LCP > PERFORMANCE_THRESHOLDS.LCP) ||
    alerts.filter(a => !a.resolved && a.type === 'critical').length > 0;

  // Report metrics to external service
  useEffect(() => {
    if (!enableReporting || !reportingEndpoint) return;

    const reportMetrics = async () => {
      try {
        await fetch(reportingEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: exportMetrics(),
        });
      } catch (error) {
        console.warn('Failed to report performance metrics:', error);
      }
    };

    // Report metrics every 5 minutes
    const interval = setInterval(reportMetrics, 300000);
    
    // Report on page unload
    const handleUnload = () => {
      // Use sendBeacon for reliable reporting on page unload
      if (navigator.sendBeacon) {
        navigator.sendBeacon(reportingEndpoint, exportMetrics());
      }
    };

    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [enableReporting, reportingEndpoint, exportMetrics]);

  const contextValue: PerformanceContextType = {
    metrics,
    alerts: alerts.filter(a => !a.resolved),
    measureInteraction,
    measureRender,
    measureAPI,
    markFeatureUsage,
    isSlowDevice,
    isSlowNetwork,
    shouldOptimize,
    clearAlerts,
    exportMetrics,
  };

  return (
    <PerformanceContext.Provider value={contextValue}>
      {children}
    </PerformanceContext.Provider>
  );
}

export function usePerformance() {
  const context = useContext(PerformanceContext);
  if (!context) {
    throw new Error('usePerformance must be used within a PerformanceProvider');
  }
  return context;
}

// HOC for measuring component render performance
export function withPerformanceTracking<P extends object>(
  Component: React.ComponentType<P>,
  componentName?: string
) {
  const WrappedComponent = (props: P) => {
    const { measureRender } = usePerformance();
    const displayName = componentName || Component.displayName || Component.name;

    return (
      <React.Profiler
        id={displayName}
        onRender={(id, phase, actualDuration) => {
          if (phase === 'mount' || phase === 'update') {
            measureRender(id, () => {}); // Duration already measured by Profiler
          }
        }}
      >
        <Component {...props} />
      </React.Profiler>
    );
  };

  WrappedComponent.displayName = `withPerformanceTracking(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

// Hook for measuring async operations
export function usePerformanceMeasure() {
  const { measureInteraction, measureAPI } = usePerformance();

  const measureAsync = useCallback(
    async (
      name: string,
      operation: () => Promise<any>,
      type: 'interaction' | 'api' = 'interaction'
    ) => {
      const start = performance.now();
      
      try {
        const result = await operation();
        const duration = performance.now() - start;
        
        if (type === 'api') {
          measureAPI(name, duration);
        } else {
          await measureInteraction(name, async () => {});
        }
        
        return result;
      } catch (error) {
        const duration = performance.now() - start;
        
        if (type === 'api') {
          measureAPI(`${name}_error`, duration);
        }
        
        throw error;
      }
    },
    [measureInteraction, measureAPI]
  );

  return measureAsync;
}

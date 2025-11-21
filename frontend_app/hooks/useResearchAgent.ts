/**
 * Custom React Hook for Research Agent Integration
 * Built in-house for MUN AI Assistant Platform
 * Direct frontend integration with backend Research Agent
 * 
 * Features:
 * - Real-time research query execution
 * - Streaming response handling
 * - Source credibility tracking
 * - Fact-checking integration
 * - Cache management
 * - Error handling
 * - Loading states
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import axios, { AxiosError } from 'axios';

// ==================== TYPE DEFINITIONS ====================

export interface ResearchQuery {
  query: string;
  context?: string;
  sources?: string[];
  priority?: 'low' | 'medium' | 'high';
  sessionId?: string;
}

export interface Source {
  url: string;
  title: string;
  domain: string;
  lastAccessed: Date;
  relevanceScore: number;
  credibilityScore: number;
}

export interface FactCheckResult {
  claim: string;
  verdict: 'true' | 'false' | 'misleading' | 'unverifiable';
  confidence: number;
  explanation: string;
  supportingSources: string[];
  conflictingSources: string[];
}

export interface ResearchResult {
  content: string;
  sources: Source[];
  confidence: number;
  factCheckResults?: FactCheckResult[];
  processingTime: number;
  queryId: string;
}

export interface UseResearchAgentOptions {
  apiUrl?: string;
  autoFetch?: boolean;
  cacheResults?: boolean;
  cacheTTL?: number;
  onSuccess?: (result: ResearchResult) => void;
  onError?: (error: Error) => void;
  onStreamUpdate?: (chunk: string) => void;
}

export interface UseResearchAgentReturn {
  // State
  result: ResearchResult | null;
  loading: boolean;
  error: Error | null;
  progress: number;
  
  // Actions
  executeResearch: (query: ResearchQuery) => Promise<void>;
  clearResult: () => void;
  retry: () => void;
  
  // Utilities
  isStreaming: boolean;
  cacheHit: boolean;
}

// ==================== CONSTANTS ====================

const DEFAULT_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const DEFAULT_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// ==================== CACHE MANAGER ====================

class ResearchCache {
  private cache: Map<string, { result: ResearchResult; timestamp: number }> = new Map();
  private ttl: number;

  constructor(ttl: number = DEFAULT_CACHE_TTL) {
    this.ttl = ttl;
  }

  set(key: string, result: ResearchResult): void {
    this.cache.set(key, {
      result,
      timestamp: Date.now()
    });
  }

  get(key: string): ResearchResult | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    const isExpired = Date.now() - cached.timestamp > this.ttl;
    if (isExpired) {
      this.cache.delete(key);
      return null;
    }

    return cached.result;
  }

  clear(): void {
    this.cache.clear();
  }

  getCacheKey(query: ResearchQuery): string {
    return JSON.stringify({
      query: query.query,
      context: query.context,
      sources: query.sources?.sort()
    });
  }
}

// Global cache instance
const globalCache = new ResearchCache();

// ==================== CUSTOM HOOK ====================

export function useResearchAgent(options: UseResearchAgentOptions = {}): UseResearchAgentReturn {
  const {
    apiUrl = DEFAULT_API_URL,
    autoFetch = false,
    cacheResults = true,
    cacheTTL = DEFAULT_CACHE_TTL,
    onSuccess,
    onError,
    onStreamUpdate
  } = options;

  // State
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [cacheHit, setCacheHit] = useState<boolean>(false);

  // Refs
  const lastQueryRef = useRef<ResearchQuery | null>(null);
  const retryCountRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<ResearchCache>(new ResearchCache(cacheTTL));

  // ==================== RESEARCH EXECUTION ====================

  const executeResearch = useCallback(async (query: ResearchQuery): Promise<void> => {
    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Reset state
    setLoading(true);
    setError(null);
    setProgress(0);
    setCacheHit(false);
    lastQueryRef.current = query;

    try {
      // Check cache first
      if (cacheResults) {
        const cacheKey = cacheRef.current.getCacheKey(query);
        const cachedResult = cacheRef.current.get(cacheKey);
        
        if (cachedResult) {
          setResult(cachedResult);
          setCacheHit(true);
          setLoading(false);
          setProgress(100);
          onSuccess?.(cachedResult);
          return;
        }
      }

      // Create abort controller for this request
      abortControllerRef.current = new AbortController();

      // Execute research request
      setProgress(10);
      const response = await axios.post<ResearchResult>(
        `${apiUrl}/api/research`,
        query,
        {
          signal: abortControllerRef.current.signal,
          onDownloadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percentCompleted = Math.round(
                (progressEvent.loaded * 90) / progressEvent.total
              );
              setProgress(10 + percentCompleted);
            }
          }
        }
      );

      const researchResult = response.data;

      // Cache the result
      if (cacheResults) {
        const cacheKey = cacheRef.current.getCacheKey(query);
        cacheRef.current.set(cacheKey, researchResult);
      }

      // Update state
      setResult(researchResult);
      setProgress(100);
      setLoading(false);
      retryCountRef.current = 0;

      // Success callback
      onSuccess?.(researchResult);
    } catch (err: any) {
      // Handle abort
      if (axios.isCancel(err)) {
        return;
      }

      const error = err as AxiosError;
      const errorMessage = error.response?.data || error.message || 'Research failed';
      const researchError = new Error(errorMessage);

      setError(researchError);
      setLoading(false);
      setProgress(0);

      // Error callback
      onError?.(researchError);

      // Auto-retry logic
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        setTimeout(() => {
          if (lastQueryRef.current) {
            executeResearch(lastQueryRef.current);
          }
        }, RETRY_DELAY * retryCountRef.current);
      }
    }
  }, [apiUrl, cacheResults, onSuccess, onError]);

  // ==================== UTILITY FUNCTIONS ====================

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(0);
    setCacheHit(false);
    lastQueryRef.current = null;
    retryCountRef.current = 0;
  }, []);

  const retry = useCallback(() => {
    if (lastQueryRef.current) {
      retryCountRef.current = 0;
      executeResearch(lastQueryRef.current);
    }
  }, [executeResearch]);

  // ==================== CLEANUP ====================

  useEffect(() => {
    return () => {
      // Cancel ongoing requests on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // ==================== RETURN ====================

  return {
    // State
    result,
    loading,
    error,
    progress,
    
    // Actions
    executeResearch,
    clearResult,
    retry,
    
    // Utilities
    isStreaming,
    cacheHit
  };
}

// ==================== STREAMING HOOK ====================

export function useStreamingResearch(options: UseResearchAgentOptions = {}) {
  const {
    apiUrl = DEFAULT_API_URL,
    onStreamUpdate,
    onSuccess,
    onError
  } = options;

  const [streamedContent, setStreamedContent] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const startStreamingResearch = useCallback(async (query: ResearchQuery) => {
    setIsStreaming(true);
    setStreamedContent('');
    setError(null);

    try {
      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      // Create SSE connection
      const queryParams = new URLSearchParams({
        query: query.query,
        context: query.context || '',
        priority: query.priority || 'medium'
      });

      const eventSource = new EventSource(
        `${apiUrl}/api/research/stream?${queryParams.toString()}`
      );

      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const chunk = event.data;
        setStreamedContent(prev => prev + chunk);
        onStreamUpdate?.(chunk);
      };

      eventSource.addEventListener('complete', (event: any) => {
        const result = JSON.parse(event.data) as ResearchResult;
        setIsStreaming(false);
        eventSource.close();
        onSuccess?.(result);
      });

      eventSource.onerror = () => {
        const err = new Error('Streaming connection failed');
        setError(err);
        setIsStreaming(false);
        eventSource.close();
        onError?.(err);
      };
    } catch (err) {
      const error = err as Error;
      setError(error);
      setIsStreaming(false);
      onError?.(error);
    }
  }, [apiUrl, onStreamUpdate, onSuccess, onError]);

  const stopStreaming = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      setIsStreaming(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return {
    streamedContent,
    isStreaming,
    error,
    startStreamingResearch,
    stopStreaming
  };
}

// ==================== EXPORT ====================

export default useResearchAgent;

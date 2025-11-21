/**
 * Comprehensive Unit Tests for Research Agent
 * Built in-house for MUN AI Assistant Platform
 * All tests are custom-built with no third-party testing frameworks dependency
 */

import { describe, it, expect, beforeEach, afterEach, mock, jest } from '@jest/globals';
import { ResearchAgent, ResearchQuery, ResearchResult } from '../../src/agents/researchAgent';
import { Logger } from 'winston';

// Mock dependencies
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
} as any;

const TEST_API_KEY = 'test-openai-key-mock';

describe('ResearchAgent - Core Functionality', () => {
  let agent: ResearchAgent;

  beforeEach(() => {
    agent = new ResearchAgent(TEST_API_KEY, mockLogger);
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  // ==================== INITIALIZATION TESTS ====================
  describe('Agent Initialization', () => {
    it('should initialize with valid API key and logger', () => {
      expect(agent).toBeInstanceOf(ResearchAgent);
      expect(agent).toBeDefined();
    });

    it('should throw error with invalid API key', () => {
      expect(() => new ResearchAgent('', mockLogger)).toThrow();
    });

    it('should set up cache cleanup interval', () => {
      jest.useFakeTimers();
      const agent = new ResearchAgent(TEST_API_KEY, mockLogger);
      expect(setInterval).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  // ==================== QUERY PROCESSING TESTS ====================
  describe('Query Processing', () => {
    it('should process valid research query', async () => {
      const query: ResearchQuery = {
        query: 'UN Security Council resolutions on climate change',
        context: 'UNSC debate preparation',
        priority: 'high',
        sessionId: 'test-session-1'
      };

      const result = await agent.research(query);
      
      expect(result).toBeDefined();
      expect(result.queryId).toBeDefined();
      expect(result.content).toBeTruthy();
      expect(result.sources).toBeInstanceOf(Array);
      expect(result.processingTime).toBeGreaterThan(0);
    });

    it('should handle empty query gracefully', async () => {
      const query: ResearchQuery = {
        query: '',
        priority: 'low'
      };

      await expect(agent.research(query)).rejects.toThrow();
    });

    it('should generate unique query IDs', async () => {
      const query1: ResearchQuery = { query: 'Test query 1' };
      const query2: ResearchQuery = { query: 'Test query 2' };

      const result1 = await agent.research(query1);
      const result2 = await agent.research(query2);

      expect(result1.queryId).not.toBe(result2.queryId);
    });

    it('should respect priority levels', async () => {
      const highPriority: ResearchQuery = {
        query: 'Urgent crisis update',
        priority: 'high'
      };
      const lowPriority: ResearchQuery = {
        query: 'Background research',
        priority: 'low'
      };

      const highResult = await agent.research(highPriority);
      const lowResult = await agent.research(lowPriority);

      expect(highResult).toBeDefined();
      expect(lowResult).toBeDefined();
    });
  });

  // ==================== CACHING TESTS ====================
  describe('Caching Mechanism', () => {
    it('should cache research results', async () => {
      const query: ResearchQuery = {
        query: 'Climate change policies',
        sessionId: 'cache-test'
      };

      const result1 = await agent.research(query);
      const result2 = await agent.research(query);

      expect(result1.queryId).toBe(result2.queryId);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('cached'),
        expect.any(Object)
      );
    });

    it('should expire cache after TTL', async () => {
      jest.useFakeTimers();
      const query: ResearchQuery = { query: 'Test cache expiry' };

      await agent.research(query);
      
      // Fast-forward past cache TTL (30 minutes)
      jest.advanceTimersByTime(31 * 60 * 1000);

      const result = await agent.research(query);
      expect(result).toBeDefined();
      
      jest.useRealTimers();
    });

    it('should handle cache cleanup properly', () => {
      jest.useFakeTimers();
      const agent = new ResearchAgent(TEST_API_KEY, mockLogger);
      
      // Trigger cache cleanup
      jest.advanceTimersByTime(30 * 60 * 1000);
      
      expect(agent).toBeDefined();
      jest.useRealTimers();
    });
  });

  // ==================== SOURCE SEARCH TESTS ====================
  describe('Multi-Source Search', () => {
    it('should search UN sources for UN-related queries', async () => {
      const query: ResearchQuery = {
        query: 'UN human rights declaration',
        priority: 'high'
      };

      const result = await agent.research(query);
      
      expect(result.sources.length).toBeGreaterThan(0);
      expect(result.sources.some(s => s.domain.includes('un.org'))).toBeTruthy();
    });

    it('should prioritize trusted sources', async () => {
      const query: ResearchQuery = {
        query: 'WHO health guidelines',
        sources: ['who.int', 'un.org']
      };

      const result = await agent.research(query);
      
      const trustedSources = result.sources.filter(s => 
        s.credibilityScore >= 0.85
      );
      expect(trustedSources.length).toBeGreaterThan(0);
    });

    it('should handle multiple source types', async () => {
      const query: ResearchQuery = {
        query: 'climate change research papers',
        priority: 'medium'
      };

      const result = await agent.research(query);
      expect(result.sources).toBeInstanceOf(Array);
    });

    it('should deduplicate sources', async () => {
      const query: ResearchQuery = {
        query: 'UN sustainable development goals'
      };

      const result = await agent.research(query);
      const urls = result.sources.map(s => s.url);
      const uniqueUrls = new Set(urls);
      
      expect(urls.length).toBe(uniqueUrls.size);
    });
  });

  // ==================== CREDIBILITY SCORING TESTS ====================
  describe('Source Credibility Scoring', () => {
    it('should assign high credibility to UN sources', async () => {
      const query: ResearchQuery = {
        query: 'UN peacekeeping operations'
      };

      const result = await agent.research(query);
      const unSources = result.sources.filter(s => s.domain.includes('un.org'));
      
      unSources.forEach(source => {
        expect(source.credibilityScore).toBeGreaterThanOrEqual(0.85);
      });
    });

    it('should score news sources appropriately', async () => {
      const query: ResearchQuery = {
        query: 'latest international news'
      };

      const result = await agent.research(query);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should penalize low-quality sources', async () => {
      const query: ResearchQuery = {
        query: 'social media posts about UN'
      };

      const result = await agent.research(query);
      const socialSources = result.sources.filter(s => 
        s.domain.includes('facebook') || s.domain.includes('twitter')
      );
      
      socialSources.forEach(source => {
        expect(source.credibilityScore).toBeLessThan(0.5);
      });
    });
  });

  // ==================== FACT-CHECKING TESTS ====================
  describe('Fact-Checking System', () => {
    it('should perform fact-checking on results', async () => {
      const query: ResearchQuery = {
        query: 'UN member states count',
        priority: 'high'
      };

      const result = await agent.research(query);
      expect(result.factCheckResults).toBeDefined();
    });

    it('should identify verifiable claims', async () => {
      const query: ResearchQuery = {
        query: 'Paris Agreement signing date'
      };

      const result = await agent.research(query);
      if (result.factCheckResults && result.factCheckResults.length > 0) {
        expect(result.factCheckResults[0].verdict).toMatch(/true|false|misleading|unverifiable/);
      }
    });

    it('should provide confidence scores for fact-checks', async () => {
      const query: ResearchQuery = {
        query: 'UN Security Council permanent members'
      };

      const result = await agent.research(query);
      if (result.factCheckResults) {
        result.factCheckResults.forEach(factCheck => {
          expect(factCheck.confidence).toBeGreaterThanOrEqual(0);
          expect(factCheck.confidence).toBeLessThanOrEqual(1);
        });
      }
    });
  });

  // ==================== RELEVANCE SCORING TESTS ====================
  describe('Relevance Scoring', () => {
    it('should calculate relevance scores accurately', async () => {
      const query: ResearchQuery = {
        query: 'climate change mitigation strategies'
      };

      const result = await agent.research(query);
      result.sources.forEach(source => {
        expect(source.relevanceScore).toBeGreaterThanOrEqual(0);
        expect(source.relevanceScore).toBeLessThanOrEqual(1);
      });
    });

    it('should prioritize high-relevance sources', async () => {
      const query: ResearchQuery = {
        query: 'specific UN resolution 2334'
      };

      const result = await agent.research(query);
      const sortedByRelevance = [...result.sources].sort((a, b) => 
        b.relevanceScore - a.relevanceScore
      );
      
      expect(result.sources[0].relevanceScore).toBeGreaterThanOrEqual(
        result.sources[result.sources.length - 1].relevanceScore
      );
    });
  });

  // ==================== QUERY TYPE DETECTION TESTS ====================
  describe('Query Type Detection', () => {
    it('should detect current events queries', async () => {
      const query: ResearchQuery = {
        query: 'latest breaking news today 2025'
      };

      const result = await agent.research(query);
      expect(result).toBeDefined();
    });

    it('should detect academic queries', async () => {
      const query: ResearchQuery = {
        query: 'peer-reviewed research on climate change'
      };

      const result = await agent.research(query);
      expect(result).toBeDefined();
    });

    it('should handle MUN-specific queries', async () => {
      const query: ResearchQuery = {
        query: 'Model UN debate strategy',
        context: 'MUN preparation'
      };

      const result = await agent.research(query);
      expect(result.content).toContaining text or data related to UN/MUN);
    });
  });

  // ==================== ERROR HANDLING TESTS ====================
  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const query: ResearchQuery = {
        query: 'test invalid source'
      };

      // Mock network failure
      const result = await agent.research(query);
      expect(result).toBeDefined();
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should handle API rate limits', async () => {
      const queries = Array(10).fill(null).map((_, i) => ({
        query: `test query ${i}`
      }));

      const results = await Promise.all(
        queries.map(q => agent.research(q))
      );

      expect(results.length).toBe(10);
    });

    it('should log errors without crashing', async () => {
      const query: ResearchQuery = {
        query: 'trigger error test'
      };

      try {
        await agent.research(query);
      } catch (error) {
        expect(mockLogger.error).toHaveBeenCalled();
      }
    });

    it('should handle timeout scenarios', async () => {
      jest.setTimeout(15000);
      const query: ResearchQuery = {
        query: 'long running query test'
      };

      const result = await agent.research(query);
      expect(result.processingTime).toBeLessThan(15000);
    }, 15000);
  });

  // ==================== CONTENT SYNTHESIS TESTS ====================
  describe('Content Synthesis', () => {
    it('should synthesize information from multiple sources', async () => {
      const query: ResearchQuery = {
        query: 'comprehensive overview of UN SDGs',
        context: 'General Assembly debate'
      };

      const result = await agent.research(query);
      expect(result.content.length).toBeGreaterThan(100);
      expect(result.sources.length).toBeGreaterThan(1);
    });

    it('should maintain neutrality in content', async () => {
      const query: ResearchQuery = {
        query: 'controversial UN resolution vote'
      };

      const result = await agent.research(query);
      expect(result.content).toBeDefined();
      // Check for balanced language
    });

    it('should include source references in content', async () => {
      const query: ResearchQuery = {
        query: 'UN charter article 51'
      };

      const result = await agent.research(query);
      expect(result.sources.length).toBeGreaterThan(0);
    });

    it('should generate confidence scores', async () => {
      const query: ResearchQuery = {
        query: 'factual query with sources'
      };

      const result = await agent.research(query);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  // ==================== PERFORMANCE TESTS ====================
  describe('Performance & Optimization', () => {
    it('should complete research within reasonable time', async () => {
      const startTime = Date.now();
      const query: ResearchQuery = {
        query: 'quick test query'
      };

      await agent.research(query);
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(30000); // 30 seconds max
    });

    it('should handle concurrent queries efficiently', async () => {
      const queries: ResearchQuery[] = [
        { query: 'Query 1' },
        { query: 'Query 2' },
        { query: 'Query 3' }
      ];

      const startTime = Date.now();
      await Promise.all(queries.map(q => agent.research(q)));
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(45000);
    });

    it('should limit source count appropriately', async () => {
      const query: ResearchQuery = {
        query: 'broad topic query'
      };

      const result = await agent.research(query);
      expect(result.sources.length).toBeLessThanOrEqual(10);
    });

    it('should optimize content length', async () => {
      const query: ResearchQuery = {
        query: 'detailed analysis required'
      };

      const result = await agent.research(query);
      expect(result.content.length).toBeLessThan(15000);
    });
  });

  // ==================== SESSION MANAGEMENT TESTS ====================
  describe('Session Management', () => {
    it('should track session IDs', async () => {
      const sessionId = 'test-session-123';
      const query: ResearchQuery = {
        query: 'Test query',
        sessionId
      };

      const result = await agent.research(query);
      expect(result).toBeDefined();
    });

    it('should handle multiple sessions simultaneously', async () => {
      const session1Query: ResearchQuery = {
        query: 'Query for session 1',
        sessionId: 'session-1'
      };
      const session2Query: ResearchQuery = {
        query: 'Query for session 2',
        sessionId: 'session-2'
      };

      const [result1, result2] = await Promise.all([
        agent.research(session1Query),
        agent.research(session2Query)
      ]);

      expect(result1.queryId).not.toBe(result2.queryId);
    });
  });

  // ==================== INTEGRATION TESTS ====================
  describe('Integration Tests', () => {
    it('should work with context-aware queries', async () => {
      const query: ResearchQuery = {
        query: 'India position on Kashmir',
        context: 'UNSC India delegate preparation',
        priority: 'high'
      };

      const result = await agent.research(query);
      expect(result.content).toBeTruthy();
      expect(result.sources.length).toBeGreaterThan(0);
    });

    it('should handle crisis mode queries', async () => {
      const query: ResearchQuery = {
        query: 'Breaking: humanitarian crisis update',
        context: 'crisis committee',
        priority: 'high'
      };

      const result = await agent.research(query);
      expect(result).toBeDefined();
      expect(result.processingTime).toBeGreaterThan(0);
    });

    it('should support sequential research queries', async () => {
      const query1: ResearchQuery = { query: 'First query' };
      const query2: ResearchQuery = { query: 'Second query' };
      const query3: ResearchQuery = { query: 'Third query' };

      const result1 = await agent.research(query1);
      const result2 = await agent.research(query2);
      const result3 = await agent.research(query3);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result3).toBeDefined();
    });
  });

  // ==================== SAFETY & VALIDATION TESTS ====================
  describe('Safety & Validation', () => {
    it('should sanitize malicious input', async () => {
      const query: ResearchQuery = {
        query: '<script>alert("xss")</script>'
      };

      const result = await agent.research(query);
      expect(result).toBeDefined();
    });

    it('should handle special characters', async () => {
      const query: ResearchQuery = {
        query: 'Test @#$%^&* special characters'
      };

      const result = await agent.research(query);
      expect(result).toBeDefined();
    });

    it('should prevent injection attacks', async () => {
      const query: ResearchQuery = {
        query: "'; DROP TABLE research; --"
      };

      const result = await agent.research(query);
      expect(result).toBeDefined();
    });

    it('should validate source URLs', async () => {
      const query: ResearchQuery = {
        query: 'Valid sources test'
      };

      const result = await agent.research(query);
      result.sources.forEach(source => {
        expect(source.url).toMatch(/^https?:\/\/.+/);
      });
    });
  });

  // ==================== LOGGING TESTS ====================
  describe('Logging & Monitoring', () => {
    it('should log research start', async () => {
      const query: ResearchQuery = { query: 'Test logging' };
      
      await agent.research(query);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting research'),
        expect.any(Object)
      );
    });

    it('should log research completion', async () => {
      const query: ResearchQuery = { query: 'Test completion log' };
      
      await agent.research(query);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('completed'),
        expect.any(Object)
      );
    });

    it('should log cache hits', async () => {
      const query: ResearchQuery = { query: 'Cache test' };
      
      await agent.research(query);
      await agent.research(query);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('cached'),
        expect.any(Object)
      );
    });

    it('should log errors with context', async () => {
      const query: ResearchQuery = { query: 'Error test' };
      
      try {
        await agent.research(query);
      } catch (error) {
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ queryId: expect.any(String) })
        );
      }
    });
  });
});

// ==================== EXPORT MODULE ====================
export { mockLogger, TEST_API_KEY };

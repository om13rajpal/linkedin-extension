/**
 * LinkedIn Data Extractor - Main World Interceptor v3.0
 *
 * This script runs in the MAIN world at document_start, ensuring it executes
 * before LinkedIn's code can cache references to fetch/XHR.
 *
 * FIXES in v3.0:
 * - Added Response.text() interceptor (LinkedIn uses text() + JSON.parse())
 * - Smart JSON.parse that detects data by STRUCTURE, not just URL
 * - PerformanceObserver for URL tracking (can't be bypassed by cached fetch)
 * - Structure-based categorization when URL is unknown
 */

(function() {
  'use strict';

  // Prevent double initialization
  if (window.__linkedInMainWorldInterceptorLoaded) return;
  window.__linkedInMainWorldInterceptorLoaded = true;

  console.log('[MainWorldInterceptor] v3.0 Initializing at document_start...');

  // ============================================
  // STORE ORIGINAL REFERENCES IMMEDIATELY
  // ============================================

  const _originalFetch = window.fetch;
  const _originalXHROpen = XMLHttpRequest.prototype.open;
  const _originalXHRSend = XMLHttpRequest.prototype.send;
  const _originalResponseJson = Response.prototype.json;
  const _originalResponseText = Response.prototype.text;
  const _originalJSONParse = JSON.parse;

  // Expose for debugging
  window.__originalFetchRef = _originalFetch;

  // ============================================
  // URL TRACKING VIA PERFORMANCE OBSERVER
  // ============================================
  // This can't be bypassed even if LinkedIn caches fetch!

  const recentVoyagerUrls = new Map(); // url -> timestamp
  const MAX_URL_AGE = 10000; // 10 seconds

  function trackVoyagerUrl(url) {
    if (url && url.includes('/voyager/')) {
      recentVoyagerUrls.set(url, Date.now());
      // Clean old entries
      const now = Date.now();
      for (const [u, t] of recentVoyagerUrls) {
        if (now - t > MAX_URL_AGE) recentVoyagerUrls.delete(u);
      }
    }
  }

  function getRecentVoyagerUrl() {
    const now = Date.now();
    let bestUrl = null;
    let bestTime = 0;
    for (const [url, time] of recentVoyagerUrls) {
      if (now - time < MAX_URL_AGE && time > bestTime) {
        bestUrl = url;
        bestTime = time;
      }
    }
    return bestUrl;
  }

  // Use PerformanceObserver to track ALL network requests (can't be bypassed!)
  try {
    const perfObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest') {
          trackVoyagerUrl(entry.name);
        }
      }
    });
    perfObserver.observe({ entryTypes: ['resource'] });
    console.log('[MainWorldInterceptor] PerformanceObserver installed for URL tracking');
  } catch (e) {
    console.warn('[MainWorldInterceptor] PerformanceObserver not available:', e.message);
  }

  // ============================================
  // CONFIGURATION
  // ============================================

  const capturePatterns = ['/voyager/api/', '/voyagerMessagingGraphQL/', '/li/track'];

  function shouldCapture(url) {
    return capturePatterns.some(p => String(url).includes(p));
  }

  // GraphQL queryId patterns for categorization
  const graphqlCategories = {
    feed: ['voyagerFeedDashMainFeed', 'voyagerFeedDashFeedUpdate', 'voyagerFeedDashRecommendedFeed'],
    myPosts: ['voyagerFeedDashProfileUpdates', 'voyagerFeedDashMemberActivityFeed'],
    comments: ['voyagerSocialDashComments', 'voyagerSocialDashReplies'],
    reactions: ['voyagerSocialDashReactions', 'voyagerSocialDashReactors'],
    messaging: ['messengerMailboxCounts', 'messengerConversations', 'messengerMessages'],
    profile: ['voyagerIdentityDashProfiles', 'voyagerIdentityDashProfileCards'],
    network: ['voyagerRelationshipsDashConnections', 'voyagerRelationshipsDashFollowers'],
    analytics: ['voyagerCreatorDashAnalytics', 'voyagerContentDashAnalytics', 'voyagerIdentityDashWvmp']
  };

  function extractQueryId(url) {
    if (!url) return null;
    const match = String(url).match(/queryId=([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }

  function categorizeByUrl(url) {
    if (!url) return null;
    const queryId = extractQueryId(url);
    if (queryId) {
      for (const [cat, patterns] of Object.entries(graphqlCategories)) {
        if (patterns.some(p => queryId.toLowerCase().includes(p.toLowerCase()))) {
          return cat;
        }
      }
    }
    // Fallback to URL-based categorization
    const urlStr = String(url).toLowerCase();
    if (urlStr.includes('feed')) return 'feed';
    if (urlStr.includes('messaging') || urlStr.includes('messenger')) return 'messaging';
    if (urlStr.includes('identity') || urlStr.includes('profile')) return 'profile';
    if (urlStr.includes('relationship') || urlStr.includes('connection')) return 'network';
    if (urlStr.includes('analytics') || urlStr.includes('wvmp')) return 'analytics';
    return 'other';
  }

  // ============================================
  // STRUCTURE-BASED CATEGORIZATION (NEW!)
  // ============================================
  // Detect data type by examining the actual structure

  function categorizeByStructure(data) {
    if (!data || typeof data !== 'object') return null;

    // Check for feed data structures
    if (data.data) {
      const d = data.data;
      // Feed data has feedDashMainFeedByMainFeed or similar
      if (d.feedDashMainFeedByMainFeed || d.feedDashRecommendedFeedByRecommendedFeed) {
        return 'feed';
      }
      // Profile updates
      if (d.feedDashProfileUpdatesByMemberProfileUpdates || d.feedDashMemberActivityFeedByMemberActivityFeed) {
        return 'myPosts';
      }
      // Messaging
      if (d.messengerConversationsBySyncToken || d.messengerMailboxCounts) {
        return 'messaging';
      }
      // Comments
      if (d.socialDashCommentsBySocialDetail) {
        return 'comments';
      }
    }

    // Check included array for type hints
    if (Array.isArray(data.included) && data.included.length > 0) {
      const types = new Set();
      for (const item of data.included.slice(0, 20)) {
        if (item._type || item.$type) {
          const t = (item._type || item.$type).toLowerCase();
          if (t.includes('feed') || t.includes('update')) types.add('feed');
          if (t.includes('message') || t.includes('conversation')) types.add('messaging');
          if (t.includes('profile') || t.includes('member')) types.add('profile');
          if (t.includes('comment')) types.add('comments');
          if (t.includes('connection') || t.includes('relationship')) types.add('network');
        }
      }
      // Prioritize feed if present
      if (types.has('feed')) return 'feed';
      if (types.has('messaging')) return 'messaging';
      if (types.has('profile')) return 'profile';
      if (types.has('comments')) return 'comments';
      if (types.has('network')) return 'network';
    }

    // Check elements array
    if (Array.isArray(data.elements) && data.elements.length > 0) {
      const first = data.elements[0];
      if (first) {
        if (first.actor || first.commentary || first.socialDetail) return 'feed';
        if (first.conversationParticipants || first.messages) return 'messaging';
        if (first.firstName || first.lastName || first.headline) return 'profile';
      }
    }

    return null;
  }

  function categorize(url, data) {
    // Try URL-based first
    const urlCategory = categorizeByUrl(url);
    if (urlCategory && urlCategory !== 'other') return urlCategory;

    // Fall back to structure-based
    const structureCategory = categorizeByStructure(data);
    if (structureCategory) return structureCategory;

    return urlCategory || 'other';
  }

  function getPathname(url) {
    try {
      return new URL(url, window.location.origin).pathname;
    } catch (e) {
      return String(url || 'unknown');
    }
  }

  // ============================================
  // DEDUPLICATION
  // ============================================

  const recentDispatches = new Map(); // hash -> timestamp
  const DISPATCH_DEDUP_WINDOW = 2000; // 2 seconds

  function hashData(data) {
    try {
      // Create a simple hash from data structure
      const str = JSON.stringify(data).substring(0, 500);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
      }
      return hash;
    } catch (e) {
      return Math.random();
    }
  }

  function shouldDispatch(data) {
    const hash = hashData(data);
    const now = Date.now();

    // Clean old entries
    for (const [h, t] of recentDispatches) {
      if (now - t > DISPATCH_DEDUP_WINDOW) recentDispatches.delete(h);
    }

    if (recentDispatches.has(hash)) {
      return false; // Duplicate
    }

    recentDispatches.set(hash, now);
    return true;
  }

  // ============================================
  // EVENT DISPATCH
  // ============================================

  function dispatch(data) {
    // Deduplicate
    if (!shouldDispatch(data.data)) {
      return;
    }

    try {
      document.dispatchEvent(new CustomEvent('linkedin-api-captured', { detail: data }));
      console.log('[MainWorldInterceptor] Dispatched:', data.category, data.type, data.queryId || data.endpoint?.substring(0, 40));
    } catch (e) {
      console.error('[MainWorldInterceptor] Error dispatching:', e);
    }
  }

  // ============================================
  // FETCH INTERCEPTOR
  // ============================================

  window.fetch = async function(input, init) {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method || (input instanceof Request ? input.method : 'GET');

    // Track URL
    trackVoyagerUrl(url);

    // Call original fetch
    const response = await _originalFetch.apply(this, arguments);

    // Capture if it's a LinkedIn API call
    if (shouldCapture(url)) {
      try {
        const clone = response.clone();
        const contentType = clone.headers.get('content-type') || '';

        if (contentType.includes('application/json') || contentType.includes('application/vnd.linkedin')) {
          clone.json().then(data => {
            if (data) {
              const category = categorize(url, data);
              const queryId = extractQueryId(url);

              dispatch({
                type: 'fetch',
                url: url,
                endpoint: getPathname(url),
                method: method,
                category: category,
                queryId: queryId,
                isGraphQL: url.includes('/graphql'),
                data: data,
                timestamp: Date.now()
              });
            }
          }).catch(() => {});
        }
      } catch (e) {
        // Silent fail
      }
    }

    return response;
  };

  // Preserve fetch properties
  Object.keys(_originalFetch).forEach(key => {
    try { window.fetch[key] = _originalFetch[key]; } catch (e) {}
  });

  window.__linkedInFetchInterceptor = window.fetch;

  // ============================================
  // XMLHTTPREQUEST INTERCEPTOR
  // ============================================

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._interceptData = { method, url };
    trackVoyagerUrl(url);
    return _originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(body) {
    const xhr = this;
    const data = this._interceptData;

    if (data && shouldCapture(data.url)) {
      xhr.addEventListener('load', function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const ct = xhr.getResponseHeader('content-type') || '';
            if (ct.includes('application/json') || ct.includes('application/vnd.linkedin')) {
              const json = _originalJSONParse(xhr.responseText);
              if (json) {
                const category = categorize(data.url, json);
                const queryId = extractQueryId(data.url);

                dispatch({
                  type: 'xhr',
                  url: data.url,
                  endpoint: getPathname(data.url),
                  method: data.method,
                  category: category,
                  queryId: queryId,
                  isGraphQL: data.url.includes('/graphql'),
                  data: json,
                  timestamp: Date.now()
                });
              }
            }
          } catch (e) {
            // Silent fail
          }
        }
      });
    }

    return _originalXHRSend.apply(this, arguments);
  };

  // ============================================
  // RESPONSE.JSON() INTERCEPTOR
  // ============================================

  Response.prototype.json = async function() {
    const url = this.url || '';
    const result = await _originalResponseJson.apply(this, arguments);

    if (result && (shouldCapture(url) || categorizeByStructure(result))) {
      try {
        const category = categorize(url, result);
        const queryId = extractQueryId(url);

        dispatch({
          type: 'response-json',
          url: url || getRecentVoyagerUrl() || 'unknown',
          endpoint: getPathname(url),
          method: 'GET',
          category: category,
          queryId: queryId,
          isGraphQL: url.includes('/graphql'),
          data: result,
          timestamp: Date.now()
        });
      } catch (e) {
        // Silent fail
      }
    }

    return result;
  };

  console.log('[MainWorldInterceptor] Response.json interceptor installed');

  // ============================================
  // RESPONSE.TEXT() INTERCEPTOR (NEW!)
  // ============================================
  // LinkedIn often uses response.text() + JSON.parse() instead of response.json()

  Response.prototype.text = async function() {
    const url = this.url || '';
    const result = await _originalResponseText.apply(this, arguments);

    // Track this response's text for potential JSON.parse correlation
    if (url && shouldCapture(url)) {
      try {
        // Try to parse as JSON and capture
        const jsonData = _originalJSONParse(result);
        if (jsonData && typeof jsonData === 'object') {
          const category = categorize(url, jsonData);
          const queryId = extractQueryId(url);

          dispatch({
            type: 'response-text',
            url: url,
            endpoint: getPathname(url),
            method: 'GET',
            category: category,
            queryId: queryId,
            isGraphQL: url.includes('/graphql'),
            data: jsonData,
            timestamp: Date.now()
          });
        }
      } catch (e) {
        // Not JSON or parse error - that's fine
      }
    }

    return result;
  };

  console.log('[MainWorldInterceptor] Response.text interceptor installed');

  // ============================================
  // JSON.PARSE INTERCEPTOR (ULTIMATE FALLBACK)
  // ============================================
  // Catches ALL JSON parsing, even when URL tracking fails

  JSON.parse = function(text, reviver) {
    const result = _originalJSONParse.apply(this, arguments);

    // Only process objects that look like LinkedIn API responses
    if (result && typeof result === 'object') {
      try {
        const structureCategory = categorizeByStructure(result);

        // If we can identify it as LinkedIn data by structure
        if (structureCategory) {
          // Try to find a matching URL from recent requests
          const url = getRecentVoyagerUrl();
          const category = url ? categorize(url, result) : structureCategory;
          const queryId = url ? extractQueryId(url) : null;

          dispatch({
            type: 'json-parse',
            url: url || 'structure-detected',
            endpoint: url ? getPathname(url) : '/unknown',
            method: 'GET',
            category: category,
            queryId: queryId,
            isGraphQL: url ? url.includes('/graphql') : false,
            data: result,
            timestamp: Date.now()
          });

          console.log('[MainWorldInterceptor] JSON.parse captured by structure:', category);
        }
      } catch (e) {
        // Silent fail
      }
    }

    return result;
  };

  console.log('[MainWorldInterceptor] JSON.parse interceptor installed');

  // ============================================
  // INITIALIZATION COMPLETE
  // ============================================

  console.log('[MainWorldInterceptor] v3.0 All interceptors installed successfully');

  document.dispatchEvent(new CustomEvent('linkedin-main-interceptor-ready', {
    detail: { version: '3.0.0' }
  }));

})();

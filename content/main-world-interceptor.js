/**
 * LinkedIn Data Extractor - Main World Interceptor
 *
 * This script runs in the MAIN world at document_start, ensuring it executes
 * before LinkedIn's code can cache references to fetch/XHR.
 *
 * Uses Manifest V3's world: "MAIN" feature.
 */

(function() {
  'use strict';

  // Prevent double initialization
  if (window.__linkedInMainWorldInterceptorLoaded) return;
  window.__linkedInMainWorldInterceptorLoaded = true;

  console.log('[MainWorldInterceptor] Initializing at document_start...');

  // ============================================
  // STORE ORIGINAL REFERENCES IMMEDIATELY
  // ============================================

  const _originalFetch = window.fetch;
  const _originalXHROpen = XMLHttpRequest.prototype.open;
  const _originalXHRSend = XMLHttpRequest.prototype.send;

  // Expose for debugging
  window.__originalFetchRef = _originalFetch;

  // ============================================
  // CONFIGURATION
  // ============================================

  // Capture patterns including GraphQL
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
    const match = String(url).match(/queryId=([a-zA-Z]+)/);
    return match ? match[1] : null;
  }

  function categorize(url) {
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
    if (urlStr.includes('messaging')) return 'messaging';
    if (urlStr.includes('identity') || urlStr.includes('profile')) return 'profile';
    if (urlStr.includes('relationship') || urlStr.includes('connection')) return 'network';
    if (urlStr.includes('analytics') || urlStr.includes('wvmp')) return 'analytics';
    return 'other';
  }

  function getPathname(url) {
    try {
      return new URL(url, window.location.origin).pathname;
    } catch (e) {
      return String(url);
    }
  }

  // ============================================
  // EVENT DISPATCH
  // ============================================

  function dispatch(data) {
    try {
      // Use document.dispatchEvent instead of window.dispatchEvent
      // because document is shared between MAIN and ISOLATED worlds,
      // but window is NOT shared - each world has its own window object.
      document.dispatchEvent(new CustomEvent('linkedin-api-captured', { detail: data }));
      console.log('[MainWorldInterceptor] Dispatched:', data.category, data.queryId || data.endpoint?.substring(0, 40));
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

    // Call original fetch
    const response = await _originalFetch.apply(this, arguments);

    // Capture if it's a LinkedIn API call
    if (shouldCapture(url)) {
      try {
        const clone = response.clone();
        const contentType = clone.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
          clone.json().then(data => {
            if (data) {
              const category = categorize(url);
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

              // Debug log for feed captures
              if (category === 'feed') {
                console.log('[MainWorldInterceptor] Feed API captured:', queryId || 'no-queryId');
              }
            }
          }).catch(() => {});
        }
      } catch (e) {
        // Silent fail for capture errors
      }
    }

    return response;
  };

  // Preserve fetch properties
  Object.keys(_originalFetch).forEach(key => {
    try {
      window.fetch[key] = _originalFetch[key];
    } catch (e) {}
  });

  window.__linkedInFetchInterceptor = window.fetch;

  // ============================================
  // XMLHTTPREQUEST INTERCEPTOR
  // ============================================

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._interceptData = { method, url };
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
            if (ct.includes('application/json')) {
              const json = JSON.parse(xhr.responseText);
              if (json) {
                const category = categorize(data.url);
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

                // Debug log for feed captures
                if (category === 'feed') {
                  console.log('[MainWorldInterceptor] Feed XHR captured:', queryId || 'no-queryId');
                }
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
  // RESPONSE.JSON() INTERCEPTOR (BACKUP)
  // ============================================
  // LinkedIn may capture fetch reference before our script runs.
  // But they MUST call Response.prototype.json() to parse responses.
  // This is our backup capture mechanism.

  const _originalResponseJson = Response.prototype.json;

  Response.prototype.json = async function() {
    const url = this.url || '';
    const result = await _originalResponseJson.apply(this, arguments);

    // Capture if it's a LinkedIn API response
    if (shouldCapture(url) && result) {
      try {
        const category = categorize(url);
        const queryId = extractQueryId(url);

        dispatch({
          type: 'response-json',
          url: url,
          endpoint: getPathname(url),
          method: 'GET', // Response doesn't carry method, assume GET
          category: category,
          queryId: queryId,
          isGraphQL: url.includes('/graphql'),
          data: result,
          timestamp: Date.now()
        });

        console.log('[MainWorldInterceptor] Response.json captured:', category, queryId || url.substring(0, 50));
      } catch (e) {
        // Silent fail
      }
    }

    return result;
  };

  console.log('[MainWorldInterceptor] Response.json interceptor installed');

  // ============================================
  // JSON.PARSE INTERCEPTOR (ULTIMATE FALLBACK)
  // ============================================
  // LinkedIn may cache Response.prototype.json reference.
  // But ALL JSON parsing ultimately uses JSON.parse.
  // We track the last voyager URL and capture when JSON.parse is called.

  let lastVoyagerUrl = null;
  let lastVoyagerTimestamp = 0;

  // Track fetch/XHR requests to associate with JSON.parse calls
  const pendingRequests = new Map();

  // Override fetch to track pending requests
  const _trackedFetch = window.fetch;
  window.fetch = async function(input, init) {
    const url = input instanceof Request ? input.url : String(input);
    const requestId = Date.now() + '-' + Math.random().toString(36).substring(2, 9);

    if (shouldCapture(url)) {
      pendingRequests.set(requestId, { url, timestamp: Date.now() });
      lastVoyagerUrl = url;
      lastVoyagerTimestamp = Date.now();
    }

    try {
      const response = await _trackedFetch.apply(this, arguments);
      return response;
    } finally {
      // Clean up old pending requests (older than 10 seconds)
      const now = Date.now();
      for (const [id, data] of pendingRequests) {
        if (now - data.timestamp > 10000) {
          pendingRequests.delete(id);
        }
      }
    }
  };

  // JSON.parse interceptor
  const _originalJSONParse = JSON.parse;

  JSON.parse = function(text, reviver) {
    const result = _originalJSONParse.apply(this, arguments);

    // Check if this might be a LinkedIn API response
    // We use the last tracked voyager URL if it was recent (within 5 seconds)
    const now = Date.now();
    if (lastVoyagerUrl && (now - lastVoyagerTimestamp) < 5000) {
      try {
        // Check if result looks like LinkedIn API response
        if (result && typeof result === 'object' &&
            (result.included || result.data || result.elements)) {

          const url = lastVoyagerUrl;
          const category = categorize(url);
          const queryId = extractQueryId(url);

          // Only dispatch for feed-related queries that weren't captured by other methods
          if (category === 'feed' || url.includes('Feed')) {
            dispatch({
              type: 'json-parse',
              url: url,
              endpoint: getPathname(url),
              method: 'GET',
              category: category,
              queryId: queryId,
              isGraphQL: url.includes('/graphql'),
              data: result,
              timestamp: now
            });

            console.log('[MainWorldInterceptor] JSON.parse captured feed:', queryId || 'no-queryId');
          }

          // Clear to avoid duplicate captures
          lastVoyagerUrl = null;
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

  console.log('[MainWorldInterceptor] All interceptors installed successfully');

  // Signal ready - use document for cross-world communication
  document.dispatchEvent(new CustomEvent('linkedin-main-interceptor-ready', {
    detail: { version: '2.3.0' }
  }));

})();

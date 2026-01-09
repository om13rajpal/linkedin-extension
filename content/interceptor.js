/**
 * LinkedIn Data Extractor - Network Interceptor
 *
 * Intercepts fetch() and XMLHttpRequest to capture LinkedIn Voyager API responses.
 * This script runs at document_start to ensure we patch before LinkedIn's code loads.
 */

(function() {
  'use strict';

  // Prevent double initialization
  if (window.__linkedInInterceptorLoaded) return;
  window.__linkedInInterceptorLoaded = true;

  console.log('[Interceptor] Initializing LinkedIn network interceptor...');

  // ============================================
  // CONFIGURATION
  // ============================================

  const CONFIG = {
    // API paths to capture
    capturePatterns: [
      '/voyager/api/identity',
      '/voyager/api/relationships',
      '/voyager/api/feed',
      '/voyager/api/analytics',
      '/voyager/api/growth',
      '/voyager/api/messaging',
      '/voyager/api/search'
    ],

    // Specific endpoints of interest
    interestingEndpoints: {
      profile: [
        '/voyager/api/identity/dash/profiles',
        '/voyager/api/identity/profiles'
      ],
      connections: [
        '/voyager/api/relationships/connectionsSummary',
        '/voyager/api/relationships/connections'
      ],
      analytics: [
        '/voyager/api/analytics',
        '/voyager/api/identity/wvmpCards'
      ],
      feed: [
        '/voyager/api/feed/updates'
      ],
      network: [
        '/voyager/api/relationships/invitationsSummary',
        '/voyager/api/relationships/myNetworkNotifications'
      ]
    },

    debug: false
  };

  // ============================================
  // UTILITY FUNCTIONS
  // ============================================

  /**
   * Extract pathname from URL
   */
  function getPathname(url) {
    try {
      if (typeof url === 'string') {
        return new URL(url, window.location.origin).pathname;
      }
      if (url instanceof URL) {
        return url.pathname;
      }
      if (url instanceof Request) {
        return new URL(url.url).pathname;
      }
      return String(url);
    } catch (e) {
      return String(url);
    }
  }

  /**
   * Check if URL should be captured
   */
  function shouldCapture(url) {
    const pathname = getPathname(url);
    return CONFIG.capturePatterns.some(pattern => pathname.includes(pattern));
  }

  /**
   * Determine the category of the endpoint
   */
  function categorizeEndpoint(url) {
    const pathname = getPathname(url);

    for (const [category, patterns] of Object.entries(CONFIG.interestingEndpoints)) {
      if (patterns.some(pattern => pathname.includes(pattern))) {
        return category;
      }
    }
    return 'other';
  }

  /**
   * Send captured data to content script / background
   */
  function sendCapturedData(data) {
    // Dispatch custom event for content script to catch
    window.dispatchEvent(new CustomEvent('linkedin-api-captured', {
      detail: data
    }));

    if (CONFIG.debug) {
      console.log('[Interceptor] Captured:', data.endpoint, data.category);
    }
  }

  /**
   * Parse response data safely
   */
  async function parseResponseData(response) {
    try {
      const clone = response.clone();
      const contentType = clone.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        return await clone.json();
      }
      return await clone.text();
    } catch (e) {
      return null;
    }
  }

  // ============================================
  // FETCH INTERCEPTOR
  // ============================================

  const originalFetch = window.fetch;

  window.fetch = async function(input, init) {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method || (input instanceof Request ? input.method : 'GET');

    // Call original fetch
    const response = await originalFetch.apply(this, arguments);

    // Check if we should capture this response
    if (shouldCapture(url)) {
      try {
        const pathname = getPathname(url);
        const category = categorizeEndpoint(url);
        const data = await parseResponseData(response);

        if (data) {
          sendCapturedData({
            type: 'fetch',
            url: url,
            endpoint: pathname,
            method: method,
            category: category,
            data: data,
            timestamp: Date.now()
          });
        }
      } catch (e) {
        if (CONFIG.debug) {
          console.error('[Interceptor] Error capturing fetch:', e);
        }
      }
    }

    return response;
  };

  // Preserve fetch properties
  Object.keys(originalFetch).forEach(key => {
    window.fetch[key] = originalFetch[key];
  });

  // ============================================
  // XMLHTTPREQUEST INTERCEPTOR
  // ============================================

  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
    // Store request info for later use in send()
    this._interceptorData = {
      method: method,
      url: url
    };

    return originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function(body) {
    const xhr = this;
    const interceptorData = this._interceptorData;

    if (interceptorData && shouldCapture(interceptorData.url)) {
      const originalOnReadyStateChange = xhr.onreadystatechange;

      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4 && xhr.status >= 200 && xhr.status < 300) {
          try {
            const pathname = getPathname(interceptorData.url);
            const category = categorizeEndpoint(interceptorData.url);
            let data;

            const contentType = xhr.getResponseHeader('content-type') || '';
            if (contentType.includes('application/json')) {
              data = JSON.parse(xhr.responseText);
            } else {
              data = xhr.responseText;
            }

            if (data) {
              sendCapturedData({
                type: 'xhr',
                url: interceptorData.url,
                endpoint: pathname,
                method: interceptorData.method,
                category: category,
                data: data,
                timestamp: Date.now()
              });
            }
          } catch (e) {
            if (CONFIG.debug) {
              console.error('[Interceptor] Error capturing XHR:', e);
            }
          }
        }

        if (originalOnReadyStateChange) {
          originalOnReadyStateChange.apply(this, arguments);
        }
      };

      // Also handle addEventListener style
      xhr.addEventListener('load', function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const pathname = getPathname(interceptorData.url);
            const category = categorizeEndpoint(interceptorData.url);
            let data;

            const contentType = xhr.getResponseHeader('content-type') || '';
            if (contentType.includes('application/json')) {
              data = JSON.parse(xhr.responseText);
            } else {
              data = xhr.responseText;
            }

            if (data) {
              sendCapturedData({
                type: 'xhr-load',
                url: interceptorData.url,
                endpoint: pathname,
                method: interceptorData.method,
                category: category,
                data: data,
                timestamp: Date.now()
              });
            }
          } catch (e) {
            // Silent fail
          }
        }
      });
    }

    return originalXHRSend.apply(this, arguments);
  };

  // ============================================
  // INITIALIZATION COMPLETE
  // ============================================

  console.log('[Interceptor] Network interceptor initialized successfully');

  // Signal that interceptor is ready
  window.dispatchEvent(new CustomEvent('linkedin-interceptor-ready'));

})();

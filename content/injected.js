/**
 * LinkedIn Data Extractor - Injected Script
 *
 * This script is injected directly into the page context (not content script sandbox)
 * to intercept fetch/XHR network requests made by LinkedIn.
 *
 * Note: This file is web-accessible and injected via script tag from content-script.js
 */

(function() {
  'use strict';

  // Prevent double initialization
  if (window.__linkedInInjectedLoaded) return;
  window.__linkedInInjectedLoaded = true;

  console.log('[Injected] LinkedIn Data Extractor - Main world script loading...');

  // ============================================
  // CONFIGURATION
  // ============================================

  const CONFIG = {
    // API paths to capture
    capturePatterns: [
      '/voyager/api/',
      '/voyagerMessagingGraphQL/',
      '/li/track'
    ],

    // Specific endpoints of interest with categories
    endpointCategories: {
      profile: [
        '/identity/dash/profiles',
        '/identity/profiles',
        '/identity/dash/profile',
        '/identitydashprofile',
        '/profileview',
        '/voyageridentitydash',
        'profileurn',
        '/me'
      ],
      connections: [
        '/relationships/connectionsSummary',
        '/relationships/connections',
        '/mynetwork/relationship-insights'
      ],
      analytics: [
        '/analytics',
        '/identity/wvmpCards',
        '/identity/profileAnalytics',
        '/dashProfileAnalytics',
        '/wvmp',
        '/contentAnalytics',
        '/postAnalytics'
      ],
      feed: [
        '/feed/updates',
        '/feed/deco',
        '/contentcreation',
        '/feedUpdates',
        '/feed/dash',
        '/graphql?queryId=voyagerFeed',
        '/voyagerFeedDash'
      ],
      posts: [
        '/updateActions',
        '/socialActions',
        '/ugcPosts',
        '/shares',
        '/articles',
        '/feed/updates',
        '/contentcreation/normShares',
        '/voyagerSocialDash',
        '/reactions'
      ],
      comments: [
        '/comments',
        '/socialDetail',
        '/feed/comments',
        '/voyagerSocialDashComments',
        '/updateComments',
        '/commentsV2'
      ],
      myPosts: [
        '/identity/profileUpdates',
        '/identity/dash/profileUpdates',
        '/contentcreation/creatorAnalytics',
        '/contentcreation/postAnalytics',
        '/creatorDashboard',
        '/voyagerContentDash',
        '/identity/memberActivityFeed',
        '/activityFeed'
      ],
      followers: [
        '/identity/profiles/.*/followingView',
        '/identity/dash/followers',
        '/relationships/followersSummary',
        '/followersCount',
        '/identity/followersView',
        '/creatorFollowers',
        '/networkInfo'
      ],
      network: [
        '/relationships/invitationsSummary',
        '/myNetworkNotifications',
        '/peopleAlsoViewed'
      ],
      messaging: [
        '/messaging',
        '/messengerconversations',
        '/voyagermessaging',
        '/messengermailbox'
      ],
      search: [
        '/search/blended'
      ],
      trending: [
        '/content/trendingTopics',
        '/voyagerNewsletterDash',
        '/news/trending',
        '/pulse/trending'
      ]
    },

    // GraphQL queryId patterns for categorization (LinkedIn's new API format)
    graphqlQueryIds: {
      feed: [
        'voyagerFeedDashMainFeed',           // Main feed posts
        'voyagerFeedDashFeedUpdate',          // Single feed update
        'voyagerFeedDashRecommendedFeed'      // Recommended content
      ],
      myPosts: [
        'voyagerFeedDashProfileUpdates',      // User's own activity/posts
        'voyagerFeedDashMemberActivityFeed',  // Member activity feed
        'voyagerContentDashPostAnalytics'     // Post analytics
      ],
      comments: [
        'voyagerSocialDashComments',          // Post comments
        'voyagerSocialDashReplies',           // Comment replies
        'voyagerSocialDashSocialDetail'       // Social details (likes, comments count)
      ],
      reactions: [
        'voyagerSocialDashReactions',         // Reactions on posts
        'voyagerSocialDashReactors',          // Who reacted
        'voyagerSocialDashSocialCounts'       // Social counts
      ],
      messaging: [
        'messengerMailboxCounts',             // Mailbox counts
        'messengerConversations',             // Conversations
        'messengerMessages'                   // Messages
      ],
      profile: [
        'voyagerIdentityDashProfiles',        // Profile data
        'voyagerIdentityDashProfileCards',    // Profile cards
        'voyagerIdentityDashSkills'           // Skills
      ],
      network: [
        'voyagerRelationshipsDashConnections', // Connections
        'voyagerRelationshipsDashFollowers',   // Followers
        'voyagerRelationshipsDashInvitations'  // Invitations
      ],
      analytics: [
        'voyagerCreatorDashAnalytics',        // Creator analytics
        'voyagerContentDashAnalytics',        // Content analytics
        'voyagerIdentityDashWvmp'             // Who viewed my profile
      ]
    },

    debug: true
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
    const urlString = String(url);
    return CONFIG.capturePatterns.some(pattern => urlString.includes(pattern));
  }

  /**
   * Extract queryId from GraphQL URL
   */
  function extractGraphQLQueryId(url) {
    const urlString = String(url);
    // Match queryId parameter: queryId=voyagerFeedDashMainFeed.xxxxx
    const match = urlString.match(/queryId=([a-zA-Z]+)\./);
    if (match) {
      return match[1];
    }
    // Also try without the dot (some endpoints)
    const match2 = urlString.match(/queryId=([a-zA-Z]+)/);
    if (match2) {
      return match2[1];
    }
    return null;
  }

  /**
   * Determine the category of the endpoint
   */
  function categorizeEndpoint(url) {
    const urlString = String(url).toLowerCase();

    // First, check if it's a GraphQL endpoint and categorize by queryId
    if (urlString.includes('/graphql')) {
      const queryId = extractGraphQLQueryId(url);
      if (queryId) {
        for (const [category, patterns] of Object.entries(CONFIG.graphqlQueryIds)) {
          if (patterns.some(pattern => queryId.toLowerCase().includes(pattern.toLowerCase()))) {
            return category;
          }
        }
        // Log unknown GraphQL queryIds for debugging
        if (CONFIG.debug) {
          console.log('[Injected] Unknown GraphQL queryId:', queryId);
        }
      }
    }

    // Fall back to path-based categorization
    for (const [category, patterns] of Object.entries(CONFIG.endpointCategories)) {
      if (patterns.some(pattern => urlString.includes(pattern.toLowerCase()))) {
        return category;
      }
    }
    return 'other';
  }

  /**
   * Send captured data to content script via custom event
   */
  function sendCapturedData(data) {
    try {
      window.dispatchEvent(new CustomEvent('linkedin-api-captured', {
        detail: data
      }));

      if (CONFIG.debug) {
        console.log('[Injected] API captured:', data.category, data.endpoint);
      }
    } catch (e) {
      console.error('[Injected] Error dispatching event:', e);
    }
  }

  /**
   * Safely parse JSON
   */
  function safeParseJSON(text) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return null;
    }
  }

  // ============================================
  // FETCH INTERCEPTION
  // ============================================

  // Check if early interceptor already installed (from inline injection)
  if (window.__linkedInEarlyInterceptorLoaded) {
    console.log('[Injected] Early interceptor detected, skipping duplicate fetch intercept');
  } else {
    console.log('[Injected] Installing fetch interceptor (no early interceptor found)');
  }

  // Use the original fetch reference if available, otherwise current fetch
  const originalFetch = window.__originalFetchRef || window.fetch;

  // Only install our interceptor if early interceptor isn't already in place
  if (!window.__linkedInEarlyInterceptorLoaded) {
    window.fetch = async function(input, init) {
    const url = input instanceof Request ? input.url : String(input);
    const method = init?.method || (input instanceof Request ? input.method : 'GET');

    // Call original fetch
    const response = await originalFetch.apply(this, arguments);

    // Check if we should capture this response
    if (shouldCapture(url)) {
      try {
        // Clone the response to read it without consuming
        const clone = response.clone();
        const contentType = clone.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
          clone.json().then(data => {
            if (data) {
              const category = categorizeEndpoint(url);
              const queryId = extractGraphQLQueryId(url);

              sendCapturedData({
                type: 'fetch',
                url: url,
                endpoint: getPathname(url),
                method: method,
                category: category,
                queryId: queryId,  // Include GraphQL queryId if present
                isGraphQL: url.includes('/graphql'),
                data: data,
                timestamp: Date.now()
              });

              // Enhanced logging for GraphQL endpoints
              if (CONFIG.debug && url.includes('/graphql')) {
                console.log('[Injected] GraphQL captured:', {
                  queryId: queryId,
                  category: category,
                  dataKeys: Object.keys(data || {})
                });
              }
            }
          }).catch(() => {});
        }
      } catch (e) {
        if (CONFIG.debug) {
          console.error('[Injected] Error capturing fetch:', e);
        }
      }
    }

    return response;
    };

    // Preserve fetch properties
    Object.keys(originalFetch).forEach(key => {
      try {
        window.fetch[key] = originalFetch[key];
      } catch (e) {}
    });

    // Store reference to our interceptor for self-healing
    const ourFetchInterceptor = window.fetch;
    window.__linkedInFetchInterceptor = ourFetchInterceptor;

    console.log('[Injected] Fetch interceptor installed');
  } // End of if (!window.__linkedInEarlyInterceptorLoaded)

  // ============================================
  // SELF-HEALING FETCH INTERCEPTOR
  // ============================================

  /**
   * Check if our fetch interceptor is still active and reinstall if replaced
   * Note: Skip if early interceptor is installed as it handles this
   */
  function checkAndReinstallFetchInterceptor() {
    // Skip self-healing if early interceptor is in place
    if (window.__linkedInEarlyInterceptorLoaded) return;

    if (window.fetch !== window.__linkedInFetchInterceptor) {
      console.log('[Injected] Fetch interceptor was replaced, reinstalling...');

      // The current fetch might be another interceptor wrapping original
      // We need to wrap whatever is currently there
      const currentFetch = window.fetch;

      window.fetch = async function(input, init) {
        const url = input instanceof Request ? input.url : String(input);
        const method = init?.method || (input instanceof Request ? input.method : 'GET');

        // Call current fetch (which might be another interceptor)
        const response = await currentFetch.apply(this, arguments);

        // Capture if needed
        if (shouldCapture(url)) {
          try {
            const clone = response.clone();
            const contentType = clone.headers.get('content-type') || '';

            if (contentType.includes('application/json')) {
              clone.json().then(data => {
                if (data) {
                  const category = categorizeEndpoint(url);
                  const queryId = extractGraphQLQueryId(url);

                  sendCapturedData({
                    type: 'fetch-reinstalled',
                    url: url,
                    endpoint: getPathname(url),
                    method: method,
                    category: category,
                    queryId: queryId,
                    isGraphQL: url.includes('/graphql'),
                    data: data,
                    timestamp: Date.now()
                  });

                  if (CONFIG.debug && url.includes('/graphql')) {
                    console.log('[Injected] GraphQL captured (reinstalled):', {
                      queryId: queryId,
                      category: category
                    });
                  }
                }
              }).catch(() => {});
            }
          } catch (e) {
            if (CONFIG.debug) {
              console.error('[Injected] Error in reinstalled interceptor:', e);
            }
          }
        }

        return response;
      };

      window.__linkedInFetchInterceptor = window.fetch;
      console.log('[Injected] Fetch interceptor reinstalled successfully');
    }
  }

  // Check every 2 seconds if interceptor was replaced
  setInterval(checkAndReinstallFetchInterceptor, 2000);

  // Also check immediately after common replacement points
  setTimeout(checkAndReinstallFetchInterceptor, 500);
  setTimeout(checkAndReinstallFetchInterceptor, 1000);
  setTimeout(checkAndReinstallFetchInterceptor, 3000);

  // ============================================
  // XMLHTTPREQUEST INTERCEPTION
  // ============================================

  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
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
      xhr.addEventListener('load', function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const contentType = xhr.getResponseHeader('content-type') || '';
            let data = null;

            if (contentType.includes('application/json')) {
              data = safeParseJSON(xhr.responseText);
            }

            if (data) {
              const category = categorizeEndpoint(interceptorData.url);
              const queryId = extractGraphQLQueryId(interceptorData.url);

              sendCapturedData({
                type: 'xhr',
                url: interceptorData.url,
                endpoint: getPathname(interceptorData.url),
                method: interceptorData.method,
                category: category,
                queryId: queryId,  // Include GraphQL queryId if present
                isGraphQL: interceptorData.url.includes('/graphql'),
                data: data,
                timestamp: Date.now()
              });

              // Enhanced logging for GraphQL endpoints
              if (CONFIG.debug && interceptorData.url.includes('/graphql')) {
                console.log('[Injected] GraphQL XHR captured:', {
                  queryId: queryId,
                  category: category,
                  dataKeys: Object.keys(data || {})
                });
              }
            }
          } catch (e) {
            if (CONFIG.debug) {
              console.error('[Injected] Error capturing XHR:', e);
            }
          }
        }
      });
    }

    return originalXHRSend.apply(this, arguments);
  };

  console.log('[Injected] XHR interceptor installed');

  // ============================================
  // RESPONSE.JSON() INTERCEPTION (BACKUP)
  // ============================================

  const originalJson = Response.prototype.json;
  Response.prototype.json = async function() {
    const result = await originalJson.call(this);

    // Check if this is a LinkedIn API response
    if (this.url && shouldCapture(this.url)) {
      try {
        window.dispatchEvent(new CustomEvent('linkedin-response-json', {
          detail: {
            url: this.url,
            endpoint: getPathname(this.url),
            category: categorizeEndpoint(this.url),
            data: result,
            timestamp: Date.now()
          }
        }));
      } catch (e) {}
    }

    return result;
  };

  console.log('[Injected] Response.json interceptor installed');

  // ============================================
  // LINKEDIN INTERNAL STATE ACCESS
  // ============================================

  /**
   * Try to access LinkedIn's internal application state
   */
  function tryGetLinkedInState() {
    try {
      if (window.__INITIAL_STATE__) {
        return window.__INITIAL_STATE__;
      }

      const reactRoot = document.getElementById('main') || document.querySelector('[data-reactroot]');
      if (reactRoot?._reactRootContainer?._internalRoot?.current?.memoizedState) {
        return reactRoot._reactRootContainer._internalRoot.current.memoizedState;
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Extract current user info from page state
   */
  function extractCurrentUser() {
    try {
      // Method 1: From meta tags
      const memberMeta = document.querySelector('meta[name="analytics:member"]');
      if (memberMeta) {
        return { memberUrn: memberMeta.content };
      }

      // Method 2: From global variables
      if (window.voyagerLoggedInMemberHandle) {
        return { handle: window.voyagerLoggedInMemberHandle };
      }

      // Method 3: From script tags containing config
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent;
        if (text.includes('clientPageInstanceId') || text.includes('memberUrn')) {
          const urnMatch = text.match(/urn:li:member:(\d+)/);
          if (urnMatch) {
            return { memberUrn: urnMatch[0], memberId: urnMatch[1] };
          }
        }
      }

      return null;
    } catch (e) {
      return null;
    }
  }

  // ============================================
  // EXPOSE UTILITIES
  // ============================================

  window.__LinkedInExtractor = {
    getState: tryGetLinkedInState,
    getCurrentUser: extractCurrentUser,
    version: '2.1.0',  // Updated with self-healing interceptor

    getCookies: function() {
      const cookies = {};
      document.cookie.split(';').forEach(cookie => {
        const [name, value] = cookie.trim().split('=');
        if (name) cookies[name] = value;
      });
      return cookies;
    },

    getAuthCookies: function() {
      const cookies = this.getCookies();
      return {
        li_at: cookies['li_at'],
        JSESSIONID: (cookies['JSESSIONID'] || '').replace(/"/g, ''),
        lidc: cookies['lidc'],
        bcookie: cookies['bcookie']
      };
    },

    // Manual trigger for testing
    testCapture: function() {
      sendCapturedData({
        type: 'test',
        url: 'test://manual-trigger',
        endpoint: '/test',
        method: 'TEST',
        category: 'test',
        data: { message: 'Manual test capture', timestamp: Date.now() },
        timestamp: Date.now()
      });
      console.log('[Injected] Test capture sent');
    }
  };

  // ============================================
  // INITIALIZATION COMPLETE
  // ============================================

  // Send initialization event
  window.dispatchEvent(new CustomEvent('linkedin-extractor-ready', {
    detail: { version: '2.1.0' }
  }));

  // Send current user info after page loads
  window.addEventListener('load', () => {
    setTimeout(() => {
      const currentUser = extractCurrentUser();
      if (currentUser) {
        window.dispatchEvent(new CustomEvent('linkedin-user-detected', {
          detail: currentUser
        }));
      }
    }, 1000);
  });

  console.log('[Injected] LinkedIn Data Extractor - Main world script initialized successfully');

})();

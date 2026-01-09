/**
 * LinkedIn Data Extractor - DOM Extractor
 *
 * Extracts data directly from LinkedIn's rendered DOM elements.
 * Provides fallback data when API interception doesn't capture everything.
 */

(function() {
  'use strict';

  // Prevent double initialization
  if (window.__linkedInDOMExtractorLoaded) return;
  window.__linkedInDOMExtractorLoaded = true;

  console.log('[DOMExtractor] Initializing DOM extractor...');

  // ============================================
  // DOM SELECTORS
  // ============================================

  const SELECTORS = {
    // Profile page selectors (updated for current LinkedIn UI)
    profile: {
      name: 'h1.text-heading-xlarge, .pv-text-details__left-panel h1, main h1, .mt2 h1, h1',
      headline: '.text-body-medium.break-words, .text-body-medium, .pv-text-details__left-panel .text-body-medium',
      location: '.text-body-small.inline.t-black--light.break-words, .text-body-small.inline.t-black--light, .pv-text-details__left-panel .text-body-small',
      about: '#about ~ .display-flex .pv-shared-text-with-see-more span[aria-hidden="true"], .pv-about__summary-text, section.pv-about-section div.inline-show-more-text',
      connectionCount: 'a[href*="/connections"] span, .pv-top-card--list-bullet li:first-child span',
      followerCount: 'span.t-bold:not([class*="connection"])',
      profilePhoto: 'img.pv-top-card-profile-picture__image, .presence-entity__image, img.profile-photo-edit__preview',
      backgroundPhoto: '.profile-background-image__image',
      currentCompany: '.pv-text-details__right-panel li:first-child, .inline-show-more-text',
      education: '.pv-text-details__right-panel li:nth-child(2)'
    },

    // Analytics dashboard selectors (updated)
    analytics: {
      profileViews: '[href*="profile-views"] span.t-bold, [data-test-id="profile-views"] .t-black--light, .analytics-card .t-20, .pv-dashboard-section span.t-20',
      postImpressions: '[href*="post-impressions"] span.t-bold, [data-test-id="post-impressions"] .t-black--light',
      searchAppearances: '[href*="search-appearances"] span.t-bold, [data-test-id="search-appearances"] .t-black--light',
      followerCount: '.pv-recent-activity-section__follower-count'
    },

    // Feed selectors
    feed: {
      posts: '.feed-shared-update-v2',
      postAuthor: '.feed-shared-actor__name',
      postContent: '.feed-shared-text__text-view',
      postTimestamp: '.feed-shared-actor__sub-description',
      postLikes: '.social-details-social-counts__reactions-count',
      postComments: '.social-details-social-counts__comments'
    },

    // Connection selectors
    connections: {
      connectionCard: '.mn-connection-card',
      connectionName: '.mn-connection-card__name',
      connectionOccupation: '.mn-connection-card__occupation',
      connectionTime: '.time-badge'
    },

    // URN extraction
    urn: {
      profileUrn: '[data-entity-urn*="member"], [data-urn*="member"]',
      activityUrn: '[data-activity-urn]'
    }
  };

  // ============================================
  // EXTRACTION FUNCTIONS
  // ============================================

  /**
   * Safe query selector that returns null if element not found
   */
  function safeQuery(selector, context = document) {
    try {
      return context.querySelector(selector);
    } catch (e) {
      return null;
    }
  }

  /**
   * Safe query selector all
   */
  function safeQueryAll(selector, context = document) {
    try {
      return Array.from(context.querySelectorAll(selector));
    } catch (e) {
      return [];
    }
  }

  /**
   * Get text content safely
   */
  function getText(selector, context = document) {
    const element = safeQuery(selector, context);
    return element ? element.textContent.trim() : null;
  }

  /**
   * Get attribute safely
   */
  function getAttr(selector, attr, context = document) {
    const element = safeQuery(selector, context);
    return element ? element.getAttribute(attr) : null;
  }

  /**
   * Parse number from text (e.g., "1.5K" -> 1500)
   */
  function parseNumber(text) {
    if (!text) return null;

    const cleaned = text.replace(/,/g, '').trim();

    if (cleaned.includes('K') || cleaned.includes('k')) {
      return Math.round(parseFloat(cleaned) * 1000);
    }
    if (cleaned.includes('M') || cleaned.includes('m')) {
      return Math.round(parseFloat(cleaned) * 1000000);
    }

    const num = parseInt(cleaned, 10);
    return isNaN(num) ? null : num;
  }

  // ============================================
  // PROFILE EXTRACTION
  // ============================================

  /**
   * Extract profile data from current page
   */
  function extractProfileData() {
    const data = {
      extractedAt: new Date().toISOString(),
      source: 'dom',
      url: window.location.href
    };

    // Basic info
    data.name = getText(SELECTORS.profile.name);
    data.headline = getText(SELECTORS.profile.headline);
    data.location = getText(SELECTORS.profile.location);
    data.about = getText(SELECTORS.profile.about);

    // Connections and followers
    const connectionText = getText(SELECTORS.profile.connectionCount);
    const followerText = getText(SELECTORS.profile.followerCount);

    data.connections = parseNumber(connectionText);
    data.followers = parseNumber(followerText);

    // Photos
    data.profilePhotoUrl = getAttr(SELECTORS.profile.profilePhoto, 'src');
    data.backgroundPhotoUrl = getAttr(SELECTORS.profile.backgroundPhoto, 'src');

    // Current position
    data.currentCompany = getText(SELECTORS.profile.currentCompany);
    data.education = getText(SELECTORS.profile.education);

    // Extract URN
    data.memberUrn = extractMemberUrn();

    return data;
  }

  /**
   * Extract member URN from page
   */
  function extractMemberUrn() {
    // Method 1: From data attributes
    const urnElement = safeQuery(SELECTORS.urn.profileUrn);
    if (urnElement) {
      const urn = urnElement.dataset.entityUrn || urnElement.dataset.urn;
      if (urn) return urn;
    }

    // Method 2: From URL
    const urlMatch = window.location.href.match(/\/in\/([^\/\?]+)/);
    if (urlMatch) {
      return `vanity:${urlMatch[1]}`;
    }

    // Method 3: From profile URL in page
    const profileLink = safeQuery('a[href*="/in/"]');
    if (profileLink) {
      const href = profileLink.getAttribute('href');
      const match = href.match(/\/in\/([^\/\?]+)/);
      if (match) return `vanity:${match[1]}`;
    }

    return null;
  }

  // ============================================
  // ANALYTICS EXTRACTION
  // ============================================

  /**
   * Extract analytics data from dashboard
   */
  function extractAnalyticsData() {
    const data = {
      extractedAt: new Date().toISOString(),
      source: 'dom',
      url: window.location.href
    };

    // Try multiple selector strategies
    const profileViewsText = getText(SELECTORS.analytics.profileViews);
    const postImpressionsText = getText(SELECTORS.analytics.postImpressions);
    const searchAppearancesText = getText(SELECTORS.analytics.searchAppearances);

    data.profileViews = parseNumber(profileViewsText);
    data.postImpressions = parseNumber(postImpressionsText);
    data.searchAppearances = parseNumber(searchAppearancesText);

    // Look for analytics cards
    const analyticsCards = safeQueryAll('.analytics-card, .pv-dashboard-section');
    analyticsCards.forEach(card => {
      const title = getText('.t-14, .pv-dashboard-section__title', card);
      const value = getText('.t-20, .pv-dashboard-section__value', card);

      if (title && value) {
        const key = title.toLowerCase().replace(/\s+/g, '_');
        data[key] = parseNumber(value) || value;
      }
    });

    return data;
  }

  // ============================================
  // FEED EXTRACTION
  // ============================================

  /**
   * Extract posts from feed
   */
  function extractFeedPosts(limit = 10) {
    const posts = [];
    const postElements = safeQueryAll(SELECTORS.feed.posts).slice(0, limit);

    postElements.forEach((postEl, index) => {
      const post = {
        index: index,
        extractedAt: new Date().toISOString()
      };

      post.author = getText(SELECTORS.feed.postAuthor, postEl);
      post.content = getText(SELECTORS.feed.postContent, postEl);
      post.timestamp = getText(SELECTORS.feed.postTimestamp, postEl);

      const likesText = getText(SELECTORS.feed.postLikes, postEl);
      const commentsText = getText(SELECTORS.feed.postComments, postEl);

      post.likes = parseNumber(likesText);
      post.comments = parseNumber(commentsText);

      // Get activity URN
      const activityUrn = postEl.dataset.activityUrn || getAttr('[data-activity-urn]', 'data-activity-urn', postEl);
      post.activityUrn = activityUrn;

      posts.push(post);
    });

    return posts;
  }

  // ============================================
  // CONNECTIONS EXTRACTION
  // ============================================

  /**
   * Extract connections from connections page
   */
  function extractConnections(limit = 50) {
    const connections = [];
    const connectionCards = safeQueryAll(SELECTORS.connections.connectionCard).slice(0, limit);

    connectionCards.forEach((card, index) => {
      const connection = {
        index: index,
        extractedAt: new Date().toISOString()
      };

      connection.name = getText(SELECTORS.connections.connectionName, card);
      connection.occupation = getText(SELECTORS.connections.connectionOccupation, card);
      connection.connectedTime = getText(SELECTORS.connections.connectionTime, card);

      // Get profile link
      const profileLink = safeQuery('a[href*="/in/"]', card);
      if (profileLink) {
        connection.profileUrl = profileLink.getAttribute('href');
        const match = connection.profileUrl.match(/\/in\/([^\/\?]+)/);
        if (match) connection.vanityName = match[1];
      }

      connections.push(connection);
    });

    return connections;
  }

  // ============================================
  // COOKIE EXTRACTION (for reference)
  // ============================================

  /**
   * Extract cookies from document.cookie
   */
  function extractCookies() {
    const cookies = {};
    document.cookie.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      if (name) {
        cookies[name] = value || '';
      }
    });
    return cookies;
  }

  /**
   * Get LinkedIn auth token from cookies
   */
  function getAuthToken() {
    const cookies = extractCookies();
    return cookies['li_at'] || null;
  }

  /**
   * Get CSRF token from cookies
   */
  function getCsrfToken() {
    const cookies = extractCookies();
    // JSESSIONID is surrounded by quotes
    const token = cookies['JSESSIONID'] || '';
    return token.replace(/"/g, '');
  }

  // ============================================
  // PAGE TYPE DETECTION
  // ============================================

  /**
   * Detect what type of LinkedIn page we're on
   */
  function detectPageType() {
    const url = window.location.href;
    const pathname = window.location.pathname;

    if (pathname.includes('/in/') && !pathname.includes('/in/')) {
      return 'profile';
    }
    if (pathname === '/feed/' || pathname === '/feed') {
      return 'feed';
    }
    if (pathname.includes('/mynetwork/')) {
      return 'network';
    }
    if (pathname.includes('/analytics/')) {
      return 'analytics';
    }
    if (pathname.includes('/messaging/')) {
      return 'messaging';
    }
    if (pathname.includes('/jobs/')) {
      return 'jobs';
    }
    if (pathname.includes('/search/')) {
      return 'search';
    }

    // Check for profile page pattern
    if (/\/in\/[^\/]+\/?$/.test(pathname)) {
      return 'profile';
    }

    return 'other';
  }

  // ============================================
  // PUBLIC API
  // ============================================

  window.LinkedInDOMExtractor = {
    extractProfileData,
    extractAnalyticsData,
    extractFeedPosts,
    extractConnections,
    extractCookies,
    getAuthToken,
    getCsrfToken,
    extractMemberUrn,
    detectPageType,

    // Extract all available data from current page
    extractAll: function() {
      const pageType = detectPageType();
      const data = {
        pageType: pageType,
        url: window.location.href,
        extractedAt: new Date().toISOString(),
        cookies: extractCookies(),
        memberUrn: extractMemberUrn()
      };

      switch (pageType) {
        case 'profile':
          data.profile = extractProfileData();
          break;
        case 'feed':
          data.posts = extractFeedPosts();
          break;
        case 'network':
          data.connections = extractConnections();
          break;
        case 'analytics':
          data.analytics = extractAnalyticsData();
          break;
        default:
          // Try to extract what we can
          data.profile = extractProfileData();
      }

      return data;
    }
  };

  console.log('[DOMExtractor] DOM extractor initialized successfully');

  // Signal ready
  window.dispatchEvent(new CustomEvent('linkedin-dom-extractor-ready'));

})();

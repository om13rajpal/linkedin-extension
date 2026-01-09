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
   * Extract analytics data from dashboard (updated for Creator Analytics page)
   */
  function extractAnalyticsData() {
    const data = {
      extractedAt: new Date().toISOString(),
      source: 'dom',
      url: window.location.href
    };

    // Detect if we're on the new Creator Analytics page
    const isCreatorAnalytics = window.location.pathname.includes('/analytics/creator');

    if (isCreatorAnalytics) {
      // Extract from Creator Analytics page structure
      data.pageType = 'creator_analytics';

      // Get time range from button
      const timeRangeBtn = safeQuery('button[type="button"]');
      if (timeRangeBtn && timeRangeBtn.textContent.includes('Past')) {
        data.timeRange = timeRangeBtn.textContent.trim();
      }

      // Direct extraction from main content using proper CSS selectors
      const mainEl = safeQuery('main');
      if (mainEl) {
        // Find all list items (li elements or elements with role="listitem")
        const allListItems = safeQueryAll('main li, main [role="listitem"]');

        allListItems.forEach(item => {
          const text = item.textContent || '';

          // Extract impressions - look for number followed by "Impressions"
          if (text.includes('Impressions') && !data.impressions) {
            // The number is usually in the first child element
            const firstChild = item.firstElementChild;
            if (firstChild) {
              const num = parseNumber(firstChild.textContent);
              if (num && num > 0) {
                data.impressions = num;
              }
            }
            // Fallback: look for number pattern in text
            if (!data.impressions) {
              const numMatch = text.match(/^[\s]*(\d+)[\s\S]*Impressions/i);
              if (numMatch) {
                data.impressions = parseInt(numMatch[1]);
              }
            }
          }

          // Extract members reached
          if (text.includes('Members reached') && !data.membersReached) {
            const firstChild = item.firstElementChild;
            if (firstChild) {
              const num = parseNumber(firstChild.textContent);
              if (num && num > 0) {
                data.membersReached = num;
              }
            }
            // Fallback
            if (!data.membersReached) {
              const numMatch = text.match(/^[\s]*(\d+)[\s\S]*Members reached/i);
              if (numMatch) {
                data.membersReached = parseInt(numMatch[1]);
              }
            }
          }
        });

        // Extract percentage changes from visible text
        const mainText = mainEl.textContent;
        const changeMatches = mainText.match(/(?:increase|decrease) by ([\d.]+)%/gi) || [];
        if (changeMatches.length > 0) {
          data.changes = changeMatches;
        }
      }

      // Extract chart data from Highcharts images
      const chartImages = safeQueryAll('img[alt*="Impressions"]');
      if (chartImages.length > 0) {
        data.chartData = [];
        chartImages.forEach(img => {
          const alt = img.getAttribute('alt') || '';
          // Parse: "1. Saturday, Jan 3, 2026, Impressions, 2"
          const match = alt.match(/(\d+)\.\s+(\w+),\s+(\w+\s+\d+,\s+\d+),\s+Impressions,\s+(\d+)/);
          if (match) {
            data.chartData.push({
              day: parseInt(match[1]),
              dayName: match[2],
              date: match[3],
              impressions: parseInt(match[4])
            });
          }
        });
      }

      // Extract top performing posts
      const postLinks = safeQueryAll('a[href*="/feed/update/urn:li:activity:"]');
      if (postLinks.length > 0) {
        data.topPosts = [];
        const processedUrns = new Set();

        postLinks.forEach(link => {
          const href = link.getAttribute('href') || '';
          const urnMatch = href.match(/urn:li:activity:(\d+)/);
          if (urnMatch && !processedUrns.has(urnMatch[1])) {
            processedUrns.add(urnMatch[1]);

            const listItem = link.closest('listitem, li');
            if (listItem) {
              const post = {
                activityUrn: `urn:li:activity:${urnMatch[1]}`,
                url: href
              };

              // Get content
              const contentEl = listItem.querySelector('a[href*="updateEntityUrn"] + *') ||
                               listItem.querySelector('[class*="text"]');
              if (contentEl) {
                post.content = contentEl.textContent.trim().substring(0, 200);
              }

              // Get impressions from the analytics link
              const impressionsLink = listItem.querySelector('a[href*="/analytics/post-summary/"]');
              if (impressionsLink) {
                const impMatch = impressionsLink.textContent.match(/(\d+)\s*Impressions/i);
                if (impMatch) post.impressions = parseInt(impMatch[1]);
              }

              // Get reactions
              const reactionsBtn = listItem.querySelector('button[type="button"]');
              if (reactionsBtn) {
                const reactMatch = reactionsBtn.textContent.match(/(\d+)\s*reactions/i);
                if (reactMatch) post.reactions = parseInt(reactMatch[1]);
              }

              // Get comments (search in text content since :has-text is not valid CSS)
              const commMatch = listItem.textContent.match(/(\d+)\s*comments/i);
              if (commMatch) post.comments = parseInt(commMatch[1]);

              // Get timestamp
              const timeText = listItem.textContent.match(/(\d+(?:mo|yr|d|h|w))/);
              if (timeText) post.timestamp = timeText[1];

              data.topPosts.push(post);
            }
          }
        });
      }

      console.log('[DOMExtractor] Extracted Creator Analytics:', data);
    } else {
      // Legacy dashboard extraction
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
    }

    return data;
  }

  // ============================================
  // POST ANALYTICS EXTRACTION
  // ============================================

  /**
   * Extract detailed analytics for a single post from /analytics/post-summary/ page
   */
  function extractPostAnalyticsData() {
    const data = {
      extractedAt: new Date().toISOString(),
      source: 'dom',
      url: window.location.href,
      pageType: 'post_analytics'
    };

    // Extract activity URN from URL
    const urnMatch = window.location.pathname.match(/urn:li:activity:(\d+)/);
    if (urnMatch) {
      data.activityUrn = `urn:li:activity:${urnMatch[1]}`;
      data.activityId = urnMatch[1];
    }

    // Get post content preview
    const mainEl = safeQuery('main');
    if (!mainEl) {
      console.log('[DOMExtractor] Post analytics: main element not found');
      return data;
    }

    // Extract post author and timestamp
    const postLink = safeQuery('a[href*="/feed/update/"]', mainEl);
    if (postLink) {
      const linkText = postLink.textContent || '';
      const timeMatch = linkText.match(/(\d+(?:mo|yr|d|h|w|min))/);
      if (timeMatch) data.postAge = timeMatch[1];

      // Get author name
      const authorEl = safeQuery('[class*="Om Rajpal"], .text-body-medium', postLink) || postLink;
      const authorMatch = (authorEl.textContent || '').match(/^([^•]+)/);
      if (authorMatch) data.author = authorMatch[1].replace('posted this', '').trim();
    }

    // Extract post content
    const contentEl = safeQuery('main [class*="feed-shared-text"], main .break-words', mainEl);
    if (contentEl) {
      data.postContent = contentEl.textContent.trim().substring(0, 500);
    }

    // Discovery section - Impressions and Members reached
    const discoverySection = Array.from(safeQueryAll('main section, main region, main [role="region"]'))
      .find(el => el.textContent.includes('Discovery'));

    if (discoverySection) {
      const listItems = safeQueryAll('li, [role="listitem"]', discoverySection);
      listItems.forEach(item => {
        const text = item.textContent || '';
        if (text.includes('Impressions')) {
          const numEl = item.firstElementChild;
          if (numEl) {
            const num = parseNumber(numEl.textContent);
            if (num > 0) data.impressions = num;
          }
        }
        if (text.includes('Members reached')) {
          const numEl = item.firstElementChild;
          if (numEl) {
            const num = parseNumber(numEl.textContent);
            if (num > 0) data.membersReached = num;
          }
        }
      });
    }

    // Fallback: Look for impressions/members anywhere in main
    if (!data.impressions) {
      const allListItems = safeQueryAll('main li, main [role="listitem"]');
      allListItems.forEach(item => {
        const text = item.textContent || '';
        if (text.includes('Impressions') && !data.impressions) {
          const numEl = item.firstElementChild;
          if (numEl) {
            const num = parseNumber(numEl.textContent);
            if (num > 0) data.impressions = num;
          }
        }
        if (text.includes('Members reached') && !data.membersReached) {
          const numEl = item.firstElementChild;
          if (numEl) {
            const num = parseNumber(numEl.textContent);
            if (num > 0) data.membersReached = num;
          }
        }
      });
    }

    // Profile activity section
    const profileActivitySection = Array.from(safeQueryAll('main section, main region, main [role="region"]'))
      .find(el => el.textContent.includes('Profile activity'));

    if (profileActivitySection) {
      const listItems = safeQueryAll('li, [role="listitem"]', profileActivitySection);
      listItems.forEach(item => {
        const text = item.textContent || '';
        // Find the number - it's usually at the end or in a specific element
        const numMatch = text.match(/(\d+)\s*$/);

        if (text.includes('Profile viewers from this post')) {
          if (numMatch) data.profileViewers = parseInt(numMatch[1]);
        }
        if (text.includes('Followers gained from this post')) {
          if (numMatch) data.followersGained = parseInt(numMatch[1]);
        }
      });
    }

    // Social engagement section
    const socialSection = Array.from(safeQueryAll('main section, main region, main [role="region"]'))
      .find(el => el.textContent.includes('Social engagement'));

    data.engagement = {};
    if (socialSection) {
      const listItems = safeQueryAll('li, [role="listitem"]', socialSection);
      listItems.forEach(item => {
        const text = item.textContent || '';
        const numMatch = text.match(/(\d+)/);
        const num = numMatch ? parseInt(numMatch[1]) : 0;

        if (text.includes('Reactions')) data.engagement.reactions = num;
        if (text.includes('Comments')) data.engagement.comments = num;
        if (text.includes('Reposts')) data.engagement.reposts = num;
        if (text.includes('Saves')) data.engagement.saves = num;
        if (text.includes('Sends on LinkedIn')) data.engagement.sends = num;
      });
    }

    // Post viewers demographics section
    const demographicsSection = Array.from(safeQueryAll('main section, main region, main [role="region"]'))
      .find(el => el.textContent.includes('Post viewers demographics'));

    if (demographicsSection) {
      data.demographics = [];
      const listItems = safeQueryAll('li, [role="listitem"]', demographicsSection);
      listItems.forEach(item => {
        const text = item.textContent || '';
        const percentMatch = text.match(/(\d+)%/);
        if (percentMatch) {
          const demographic = {
            percentage: parseInt(percentMatch[1])
          };

          // Determine type based on description text
          if (text.includes('experience level')) {
            demographic.type = 'experience';
            demographic.value = text.split('With this')[0].trim();
          } else if (text.includes('industry')) {
            demographic.type = 'industry';
            demographic.value = text.split('In this')[0].trim();
          } else if (text.includes('location')) {
            demographic.type = 'location';
            demographic.value = text.split('From this')[0].trim();
          } else if (text.includes('company')) {
            demographic.type = 'company';
            demographic.value = text.split('From this')[0].trim();
          } else if (text.includes('job title')) {
            demographic.type = 'job_title';
            demographic.value = text.split('With this')[0].trim();
          }

          if (demographic.value) {
            data.demographics.push(demographic);
          }
        }
      });
    }

    // Calculate engagement rate
    if (data.impressions && data.engagement) {
      const totalEngagement = (data.engagement.reactions || 0) +
                              (data.engagement.comments || 0) +
                              (data.engagement.reposts || 0) +
                              (data.engagement.saves || 0);
      data.engagementRate = ((totalEngagement / data.impressions) * 100).toFixed(2);
    }

    console.log('[DOMExtractor] Extracted Post Analytics:', data);
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

    // Check for profile page pattern first
    if (/\/in\/[^\/]+\/?$/.test(pathname)) {
      return 'profile';
    }
    if (pathname === '/feed/' || pathname === '/feed') {
      return 'feed';
    }
    if (pathname.includes('/mynetwork/')) {
      return 'network';
    }
    // Post analytics page (must check before general analytics)
    if (pathname.includes('/analytics/post-summary/')) {
      return 'post_analytics';
    }
    // Demographic detail page for posts
    if (pathname.includes('/analytics/demographic-detail/')) {
      return 'post_demographics';
    }
    // General analytics/creator analytics
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

    return 'other';
  }

  // ============================================
  // PUBLIC API
  // ============================================

  window.LinkedInDOMExtractor = {
    extractProfileData,
    extractAnalyticsData,
    extractPostAnalyticsData,
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
        case 'post_analytics':
          data.postAnalytics = extractPostAnalyticsData();
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

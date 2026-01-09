/**
 * LinkedIn Data Extractor - Service Worker (Background Script)
 *
 * Taplio-style LinkedIn API integration
 *
 * Handles:
 * - Cookie extraction via chrome.cookies API
 * - Direct LinkedIn Voyager API calls (like Taplio)
 * - Message routing between popup and content script
 * - Data storage management
 */

// ============================================
// CONSTANTS
// ============================================

const LINKEDIN_DOMAIN = '.linkedin.com';
const LINKEDIN_URL = 'https://www.linkedin.com';

const COOKIE_NAMES = {
  AUTH_TOKEN: 'li_at',
  CSRF_TOKEN: 'JSESSIONID',
  DATA_CENTER: 'lidc',
  BROWSER_ID: 'bcookie'
};

const STORAGE_KEYS = {
  AUTH_DATA: 'linkedin_auth',
  PROFILE_DATA: 'linkedin_profile',
  ANALYTICS_DATA: 'linkedin_analytics',
  POST_ANALYTICS_DATA: 'linkedin_post_analytics',
  AUDIENCE_DATA: 'linkedin_audience',
  CONNECTIONS_DATA: 'linkedin_connections',
  POSTS_DATA: 'linkedin_posts',
  FEED_POSTS: 'linkedin_feed_posts',
  MY_POSTS: 'linkedin_my_posts',
  COMMENTS: 'linkedin_comments',
  FOLLOWERS: 'linkedin_followers',
  TRENDING: 'linkedin_trending',
  CAPTURED_APIS: 'captured_apis',
  SETTINGS: 'extension_settings'
};

// LinkedIn API decoration IDs (these are used by LinkedIn internally)
const DECORATION_IDS = {
  FULL_PROFILE: 'com.linkedin.voyager.dash.deco.identity.profile.WebTopCardCore-16',
  PROFILE_VIEW: 'com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93',
  CONNECTIONS_LIST: 'com.linkedin.voyager.dash.deco.web.mynetwork.ConnectionList-16',
  MINI_PROFILE: 'com.linkedin.voyager.dash.deco.identity.profile.StandardMiniProfile-3'
};

// ============================================
// COOKIE MANAGEMENT
// ============================================

/**
 * Get all LinkedIn cookies
 */
async function getLinkedInCookies() {
  try {
    const cookies = await chrome.cookies.getAll({
      domain: LINKEDIN_DOMAIN
    });

    const cookieMap = {};
    cookies.forEach(cookie => {
      cookieMap[cookie.name] = cookie.value;
    });

    return {
      success: true,
      cookies: cookieMap,
      authToken: cookieMap[COOKIE_NAMES.AUTH_TOKEN] || null,
      csrfToken: cookieMap[COOKIE_NAMES.CSRF_TOKEN] || null,
      isAuthenticated: !!cookieMap[COOKIE_NAMES.AUTH_TOKEN]
    };
  } catch (error) {
    console.error('[ServiceWorker] Error getting cookies:', error);
    return {
      success: false,
      error: error.message,
      isAuthenticated: false
    };
  }
}

/**
 * Get specific LinkedIn cookie by name
 */
async function getLinkedInCookie(name) {
  try {
    const cookie = await chrome.cookies.get({
      url: LINKEDIN_URL,
      name: name
    });
    return cookie ? cookie.value : null;
  } catch (error) {
    console.error(`[ServiceWorker] Error getting cookie ${name}:`, error);
    return null;
  }
}

/**
 * Check if user is authenticated on LinkedIn
 */
async function checkAuthentication() {
  const authToken = await getLinkedInCookie(COOKIE_NAMES.AUTH_TOKEN);
  return {
    isAuthenticated: !!authToken,
    token: authToken
  };
}

// ============================================
// STORAGE MANAGEMENT
// ============================================

/**
 * Save data to chrome.storage.local
 */
async function saveToStorage(key, data) {
  try {
    await chrome.storage.local.set({ [key]: data });
    return { success: true };
  } catch (error) {
    console.error('[ServiceWorker] Storage save error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get data from chrome.storage.local
 */
async function getFromStorage(key) {
  try {
    const result = await chrome.storage.local.get(key);
    return { success: true, data: result[key] || null };
  } catch (error) {
    console.error('[ServiceWorker] Storage get error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all stored data
 */
async function getAllStoredData() {
  try {
    const result = await chrome.storage.local.get(null);
    return { success: true, data: result };
  } catch (error) {
    console.error('[ServiceWorker] Storage get all error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Clear all stored data
 */
async function clearStorage() {
  try {
    await chrome.storage.local.clear();
    return { success: true };
  } catch (error) {
    console.error('[ServiceWorker] Storage clear error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Append data to an array in storage
 */
async function appendToStorage(key, newData) {
  try {
    const existing = await getFromStorage(key);
    const currentArray = existing.data || [];

    // Add timestamp to new data
    const dataWithTimestamp = {
      ...newData,
      capturedAt: new Date().toISOString()
    };

    currentArray.push(dataWithTimestamp);

    // Keep only last 1000 entries to prevent storage bloat
    const trimmedArray = currentArray.slice(-1000);

    await saveToStorage(key, trimmedArray);
    return { success: true, count: trimmedArray.length };
  } catch (error) {
    console.error('[ServiceWorker] Append to storage error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save feed posts with deduplication and engagement sorting
 */
async function saveFeedPostsToStorage(newPosts) {
  try {
    if (!newPosts || !Array.isArray(newPosts) || newPosts.length === 0) {
      return { success: true, count: 0, message: 'No posts to save' };
    }

    const existing = await getFromStorage(STORAGE_KEYS.FEED_POSTS);
    let allPosts = existing.data || [];

    // Create a map for deduplication (use URN as key)
    const postMap = new Map();

    // Add existing posts to map
    allPosts.forEach(post => {
      if (post.urn) {
        postMap.set(post.urn, post);
      }
    });

    // Add/update with new posts (newer data wins)
    let newCount = 0;
    newPosts.forEach(post => {
      if (post.urn) {
        const existingPost = postMap.get(post.urn);
        if (!existingPost) {
          newCount++;
        }
        // Update with new data (may have updated engagement numbers)
        postMap.set(post.urn, {
          ...existingPost,
          ...post,
          lastUpdated: new Date().toISOString()
        });
      }
    });

    // Convert back to array
    allPosts = Array.from(postMap.values());

    // Sort by engagement score (highest first)
    allPosts.sort((a, b) => (b.engagementScore || 0) - (a.engagementScore || 0));

    // Keep only top 500 posts to prevent storage bloat
    allPosts = allPosts.slice(0, 500);

    // Calculate top hits (posts with high engagement)
    const topHits = allPosts
      .filter(p => p.engagementScore > 50)
      .slice(0, 20);

    // Save both all posts and summary
    const feedData = {
      posts: allPosts,
      topHits: topHits,
      totalCount: allPosts.length,
      lastUpdated: new Date().toISOString(),
      stats: calculateFeedStats(allPosts)
    };

    await saveToStorage(STORAGE_KEYS.FEED_POSTS, feedData);

    console.log(`[ServiceWorker] Feed posts saved: ${newCount} new, ${allPosts.length} total, ${topHits.length} top hits`);

    return {
      success: true,
      newCount: newCount,
      totalCount: allPosts.length,
      topHitsCount: topHits.length
    };
  } catch (error) {
    console.error('[ServiceWorker] Error saving feed posts:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Calculate feed statistics for content insights
 */
function calculateFeedStats(posts) {
  if (!posts || posts.length === 0) {
    return {
      avgEngagement: 0,
      avgLikes: 0,
      avgComments: 0,
      topHashtags: [],
      postTypes: {}
    };
  }

  // Calculate averages
  const totalLikes = posts.reduce((sum, p) => sum + (p.engagement?.likes || 0), 0);
  const totalComments = posts.reduce((sum, p) => sum + (p.engagement?.comments || 0), 0);
  const totalEngagement = posts.reduce((sum, p) => sum + (p.engagementScore || 0), 0);

  // Count hashtags
  const hashtagCounts = {};
  posts.forEach(p => {
    (p.hashtags || []).forEach(tag => {
      hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
    });
  });

  // Sort hashtags by frequency
  const topHashtags = Object.entries(hashtagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([tag, count]) => ({ tag, count }));

  // Count post types
  const postTypes = {};
  posts.forEach(p => {
    const type = p.type || 'text';
    postTypes[type] = (postTypes[type] || 0) + 1;
  });

  return {
    avgEngagement: Math.round(totalEngagement / posts.length),
    avgLikes: Math.round(totalLikes / posts.length),
    avgComments: Math.round(totalComments / posts.length),
    topHashtags: topHashtags,
    postTypes: postTypes
  };
}

/**
 * Save comments with deduplication and sorting by likes
 */
async function saveCommentsToStorage(newComments) {
  try {
    if (!newComments || !Array.isArray(newComments) || newComments.length === 0) {
      return { success: true, count: 0 };
    }

    const existing = await getFromStorage(STORAGE_KEYS.COMMENTS);
    let existingData = existing.data || { comments: [], stats: {} };
    let allComments = existingData.comments || [];

    // Deduplication map
    const commentMap = new Map();
    allComments.forEach(c => {
      if (c.urn) commentMap.set(c.urn, c);
    });

    // Add new comments
    let newCount = 0;
    newComments.forEach(c => {
      if (c.urn && !commentMap.has(c.urn)) {
        newCount++;
        commentMap.set(c.urn, c);
      }
    });

    allComments = Array.from(commentMap.values());

    // Sort by likes (highest first) - these are the best comments to learn from
    allComments.sort((a, b) => (b.likes || 0) - (a.likes || 0));

    // Keep top 1000 comments
    allComments = allComments.slice(0, 1000);

    // Calculate stats
    const topComments = allComments.filter(c => c.likes >= 5).slice(0, 50);
    const avgLength = allComments.length > 0
      ? Math.round(allComments.reduce((sum, c) => sum + (c.text?.length || 0), 0) / allComments.length)
      : 0;

    const commentsData = {
      comments: allComments,
      topComments: topComments,
      totalCount: allComments.length,
      lastUpdated: new Date().toISOString(),
      stats: {
        avgLength: avgLength,
        avgLikes: allComments.length > 0
          ? Math.round(allComments.reduce((sum, c) => sum + (c.likes || 0), 0) / allComments.length)
          : 0,
        topCommentsCount: topComments.length
      }
    };

    await saveToStorage(STORAGE_KEYS.COMMENTS, commentsData);
    console.log(`[ServiceWorker] Comments saved: ${newCount} new, ${allComments.length} total`);

    return { success: true, newCount, totalCount: allComments.length };
  } catch (error) {
    console.error('[ServiceWorker] Error saving comments:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save your own posts with analytics
 */
async function saveMyPostsToStorage(newPosts) {
  try {
    if (!newPosts || !Array.isArray(newPosts) || newPosts.length === 0) {
      return { success: true, count: 0 };
    }

    const existing = await getFromStorage(STORAGE_KEYS.MY_POSTS);
    let existingData = existing.data || { posts: [], stats: {} };
    let allPosts = existingData.posts || [];

    // Deduplication map
    const postMap = new Map();
    allPosts.forEach(p => {
      if (p.urn) postMap.set(p.urn, p);
    });

    // Add/update posts
    let newCount = 0;
    newPosts.forEach(p => {
      if (p.urn) {
        if (!postMap.has(p.urn)) newCount++;
        // Always update with latest data (analytics may have changed)
        postMap.set(p.urn, { ...postMap.get(p.urn), ...p, lastUpdated: new Date().toISOString() });
      }
    });

    allPosts = Array.from(postMap.values());

    // Sort by engagement score
    allPosts.sort((a, b) => {
      const scoreA = (a.engagement?.likes || 0) + (a.engagement?.comments || 0) * 3;
      const scoreB = (b.engagement?.likes || 0) + (b.engagement?.comments || 0) * 3;
      return scoreB - scoreA;
    });

    // Keep top 200 of your posts
    allPosts = allPosts.slice(0, 200);

    // Calculate stats
    const totalImpressions = allPosts.reduce((sum, p) => sum + (p.analytics?.impressions || 0), 0);
    const totalLikes = allPosts.reduce((sum, p) => sum + (p.engagement?.likes || 0), 0);
    const totalComments = allPosts.reduce((sum, p) => sum + (p.engagement?.comments || 0), 0);

    const myPostsData = {
      posts: allPosts,
      bestPost: allPosts[0] || null,
      totalCount: allPosts.length,
      lastUpdated: new Date().toISOString(),
      stats: {
        totalImpressions: totalImpressions,
        totalLikes: totalLikes,
        totalComments: totalComments,
        avgImpressions: allPosts.length > 0 ? Math.round(totalImpressions / allPosts.length) : 0,
        avgLikes: allPosts.length > 0 ? Math.round(totalLikes / allPosts.length) : 0,
        avgComments: allPosts.length > 0 ? Math.round(totalComments / allPosts.length) : 0,
        avgEngagementRate: allPosts.length > 0
          ? (allPosts.reduce((sum, p) => sum + (parseFloat(p.analytics?.engagementRate) || 0), 0) / allPosts.length).toFixed(2)
          : '0'
      }
    };

    await saveToStorage(STORAGE_KEYS.MY_POSTS, myPostsData);
    console.log(`[ServiceWorker] My posts saved: ${newCount} new, ${allPosts.length} total`);

    return { success: true, newCount, totalCount: allPosts.length };
  } catch (error) {
    console.error('[ServiceWorker] Error saving my posts:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save followers data
 */
async function saveFollowersToStorage(newData) {
  try {
    if (!newData) {
      return { success: true, count: 0 };
    }

    const existing = await getFromStorage(STORAGE_KEYS.FOLLOWERS);
    let existingData = existing.data || { followers: [], followerCount: 0, history: [] };

    // Update follower count
    if (newData.followerCount) {
      // Track history
      const history = existingData.history || [];
      history.push({
        count: newData.followerCount,
        timestamp: new Date().toISOString()
      });
      // Keep last 100 data points
      existingData.history = history.slice(-100);
      existingData.followerCount = newData.followerCount;
    }

    // Merge followers list
    if (newData.followers && newData.followers.length > 0) {
      const followerMap = new Map();
      (existingData.followers || []).forEach(f => {
        if (f.entityUrn) followerMap.set(f.entityUrn, f);
      });

      newData.followers.forEach(f => {
        if (f.entityUrn) followerMap.set(f.entityUrn, f);
      });

      existingData.followers = Array.from(followerMap.values()).slice(0, 500);
    }

    existingData.lastUpdated = new Date().toISOString();

    await saveToStorage(STORAGE_KEYS.FOLLOWERS, existingData);
    console.log(`[ServiceWorker] Followers saved: ${existingData.followers?.length || 0} followers, count: ${existingData.followerCount}`);

    return { success: true, count: existingData.followers?.length || 0, followerCount: existingData.followerCount };
  } catch (error) {
    console.error('[ServiceWorker] Error saving followers:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save trending topics
 */
async function saveTrendingToStorage(newTopics) {
  try {
    if (!newTopics || !Array.isArray(newTopics) || newTopics.length === 0) {
      return { success: true, count: 0 };
    }

    const existing = await getFromStorage(STORAGE_KEYS.TRENDING);
    let existingData = existing.data || { topics: [], history: [] };

    // Deduplication
    const topicMap = new Map();
    (existingData.topics || []).forEach(t => {
      if (t.topic) topicMap.set(t.topic, t);
    });

    newTopics.forEach(t => {
      if (t.topic) {
        topicMap.set(t.topic, { ...t, lastSeen: new Date().toISOString() });
      }
    });

    const allTopics = Array.from(topicMap.values());

    // Keep recent 200 topics
    const trendingData = {
      topics: allTopics.slice(0, 200),
      totalCount: allTopics.length,
      lastUpdated: new Date().toISOString()
    };

    await saveToStorage(STORAGE_KEYS.TRENDING, trendingData);
    console.log(`[ServiceWorker] Trending saved: ${allTopics.length} topics`);

    return { success: true, count: allTopics.length };
  } catch (error) {
    console.error('[ServiceWorker] Error saving trending:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save individual post analytics with deduplication by activity URN
 */
async function savePostAnalyticsToStorage(newData) {
  try {
    if (!newData || !newData.activityUrn) {
      return { success: false, error: 'No activity URN provided' };
    }

    const existing = await getFromStorage(STORAGE_KEYS.POST_ANALYTICS_DATA);
    let existingData = existing.data || { posts: [], stats: {} };
    let allPosts = existingData.posts || [];

    // Find existing post by URN
    const existingIndex = allPosts.findIndex(p => p.activityUrn === newData.activityUrn);

    if (existingIndex >= 0) {
      // Update existing post analytics
      allPosts[existingIndex] = {
        ...allPosts[existingIndex],
        ...newData,
        lastUpdated: new Date().toISOString()
      };
    } else {
      // Add new post analytics
      allPosts.push({
        ...newData,
        firstCaptured: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      });
    }

    // Sort by impressions (highest first)
    allPosts.sort((a, b) => (b.impressions || 0) - (a.impressions || 0));

    // Keep top 100 posts
    allPosts = allPosts.slice(0, 100);

    // Calculate aggregate stats
    const totalImpressions = allPosts.reduce((sum, p) => sum + (p.impressions || 0), 0);
    const totalReactions = allPosts.reduce((sum, p) => sum + (p.engagement?.reactions || 0), 0);
    const totalComments = allPosts.reduce((sum, p) => sum + (p.engagement?.comments || 0), 0);
    const avgEngagementRate = allPosts.length > 0
      ? (allPosts.reduce((sum, p) => sum + (parseFloat(p.engagementRate) || 0), 0) / allPosts.length).toFixed(2)
      : '0';

    const postAnalyticsData = {
      posts: allPosts,
      totalCount: allPosts.length,
      lastUpdated: new Date().toISOString(),
      stats: {
        totalImpressions,
        totalReactions,
        totalComments,
        avgEngagementRate,
        avgImpressions: allPosts.length > 0 ? Math.round(totalImpressions / allPosts.length) : 0,
        avgReactions: allPosts.length > 0 ? Math.round(totalReactions / allPosts.length) : 0
      }
    };

    await saveToStorage(STORAGE_KEYS.POST_ANALYTICS_DATA, postAnalyticsData);
    console.log(`[ServiceWorker] Post analytics saved: ${allPosts.length} posts, latest: ${newData.activityUrn}`);

    return {
      success: true,
      totalCount: allPosts.length,
      isUpdate: existingIndex >= 0
    };
  } catch (error) {
    console.error('[ServiceWorker] Error saving post analytics:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Save audience/follower data to storage
 */
async function saveAudienceDataToStorage(newData) {
  try {
    if (!newData) {
      return { success: false, error: 'No audience data provided' };
    }

    const audienceData = {
      ...newData,
      lastUpdated: new Date().toISOString()
    };

    await saveToStorage(STORAGE_KEYS.AUDIENCE_DATA, audienceData);
    console.log(`[ServiceWorker] Audience data saved: ${newData.totalFollowers} followers`);

    return {
      success: true,
      totalFollowers: newData.totalFollowers
    };
  } catch (error) {
    console.error('[ServiceWorker] Error saving audience data:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// DATA EXPORT
// ============================================

/**
 * Export data as JSON
 */
async function exportAsJSON() {
  const allData = await getAllStoredData();
  if (!allData.success) {
    return { success: false, error: allData.error };
  }

  const exportData = {
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
    data: allData.data
  };

  return {
    success: true,
    content: JSON.stringify(exportData, null, 2),
    filename: `linkedin-data-${Date.now()}.json`
  };
}

/**
 * Export data as CSV
 */
async function exportAsCSV(dataKey) {
  const result = await getFromStorage(dataKey);
  if (!result.success || !result.data) {
    return { success: false, error: 'No data to export' };
  }

  const data = result.data;
  if (!Array.isArray(data) || data.length === 0) {
    return { success: false, error: 'No data to export' };
  }

  // Get all unique keys from all objects
  const allKeys = new Set();
  data.forEach(item => {
    if (typeof item === 'object') {
      Object.keys(item).forEach(key => allKeys.add(key));
    }
  });

  const headers = Array.from(allKeys);
  const csvRows = [headers.join(',')];

  data.forEach(item => {
    const row = headers.map(header => {
      const value = item[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value).replace(/"/g, '""');
      return String(value).replace(/"/g, '""');
    });
    csvRows.push(row.map(v => `"${v}"`).join(','));
  });

  return {
    success: true,
    content: csvRows.join('\n'),
    filename: `linkedin-${dataKey}-${Date.now()}.csv`
  };
}

// ============================================
// TAPLIO-STYLE LINKEDIN API CALLS
// ============================================

/**
 * Make authenticated request to LinkedIn Voyager API (Taplio-style)
 */
async function fetchLinkedInAPI(endpoint, options = {}) {
  try {
    const cookies = await getLinkedInCookies();
    if (!cookies.isAuthenticated) {
      return { success: false, error: 'Not authenticated' };
    }

    const csrfToken = cookies.csrfToken?.replace(/"/g, '') || '';

    // Taplio-style headers
    const headers = {
      'accept': 'application/vnd.linkedin.normalized+json+2.1',
      'accept-language': 'en-US,en;q=0.9',
      'csrf-token': csrfToken,
      'x-li-lang': 'en_US',
      'x-li-page-instance': 'urn:li:page:d_flagship3_profile_view_base;' + generateUUID(),
      'x-li-track': JSON.stringify({
        clientVersion: '1.13.8960',
        mpVersion: '1.13.8960',
        osName: 'web',
        timezoneOffset: new Date().getTimezoneOffset() / -60,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        deviceFormFactor: 'DESKTOP',
        mpName: 'voyager-web'
      }),
      'x-restli-protocol-version': '2.0.0',
      ...options.headers
    };

    const response = await fetch(`https://www.linkedin.com${endpoint}`, {
      method: options.method || 'GET',
      headers: headers,
      credentials: 'include'
    });

    if (!response.ok) {
      console.error(`[ServiceWorker] API error: ${response.status} for ${endpoint}`);
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return { success: true, data: data, raw: data };
  } catch (error) {
    console.error('[ServiceWorker] API fetch error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate UUID for LinkedIn tracking
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Parse LinkedIn normalized response to extract entities
 */
function parseLinkedInResponse(data) {
  const result = {
    profiles: {},
    miniProfiles: {},
    companies: {},
    connections: [],
    posts: [],
    analytics: {}
  };

  if (!data) return result;

  // Parse included entities
  if (data.included && Array.isArray(data.included)) {
    data.included.forEach(item => {
      const type = item.$type || '';
      const urn = item.entityUrn || item['*miniProfile'] || '';

      // Profiles
      if (type.includes('Profile') && !type.includes('MiniProfile')) {
        result.profiles[urn] = item;
      }

      // Mini Profiles
      if (type.includes('MiniProfile')) {
        result.miniProfiles[urn] = item;
      }

      // Companies
      if (type.includes('Company') || type.includes('Organization')) {
        result.companies[urn] = item;
      }

      // Connections
      if (type.includes('Connection')) {
        result.connections.push(item);
      }

      // Posts/Activities
      if (type.includes('Update') || type.includes('Activity') || type.includes('Share')) {
        result.posts.push(item);
      }
    });
  }

  return result;
}

/**
 * Fetch current user's member URN (needed for other API calls)
 */
async function fetchMemberUrn() {
  const result = await fetchLinkedInAPI('/voyager/api/me');

  if (result.success && result.data) {
    // Extract member URN from response
    let memberUrn = null;
    let publicIdentifier = null;

    if (result.data.miniProfile) {
      memberUrn = result.data.miniProfile.entityUrn;
      publicIdentifier = result.data.miniProfile.publicIdentifier;
    }

    // Also check included array
    if (result.data.included) {
      result.data.included.forEach(item => {
        if (item.$type?.includes('MiniProfile') && item.entityUrn) {
          memberUrn = memberUrn || item.entityUrn;
          publicIdentifier = publicIdentifier || item.publicIdentifier;
        }
      });
    }

    // Try to extract from plain data
    if (!memberUrn && result.data.plainId) {
      memberUrn = `urn:li:fsd_profile:${result.data.plainId}`;
    }

    return { success: true, memberUrn, publicIdentifier, raw: result.data };
  }

  return { success: false, error: 'Could not get member URN' };
}

/**
 * Fetch current user's full profile data (Taplio-style)
 */
async function fetchMyProfile() {
  console.log('[ServiceWorker] Fetching profile...');

  // First get the member URN
  const memberData = await fetchMemberUrn();

  // Fetch basic profile from /me endpoint
  const meResult = await fetchLinkedInAPI('/voyager/api/me');

  if (!meResult.success) {
    return meResult;
  }

  const profile = {
    extractedAt: new Date().toISOString(),
    source: 'direct_api'
  };

  // Parse the /me response
  const parsed = parseLinkedInResponse(meResult.data);

  // Extract from miniProfile in response
  if (meResult.data.miniProfile) {
    const mp = meResult.data.miniProfile;
    profile.firstName = mp.firstName;
    profile.lastName = mp.lastName;
    profile.headline = mp.occupation;
    profile.publicIdentifier = mp.publicIdentifier;
    profile.entityUrn = mp.entityUrn;
    profile.trackingId = mp.trackingId;
    profile.profilePicture = mp.picture?.rootUrl;
  }

  // Extract from included entities
  Object.values(parsed.miniProfiles).forEach(mp => {
    if (!profile.firstName) {
      profile.firstName = mp.firstName;
      profile.lastName = mp.lastName;
      profile.headline = mp.occupation;
      profile.publicIdentifier = mp.publicIdentifier;
      profile.entityUrn = mp.entityUrn;
    }
  });

  // Get premium subscriber info
  if (meResult.data.premiumSubscriber !== undefined) {
    profile.isPremium = meResult.data.premiumSubscriber;
  }

  // Store memberUrn for other API calls
  if (memberData.success) {
    profile.memberUrn = memberData.memberUrn;
    profile.publicIdentifier = profile.publicIdentifier || memberData.publicIdentifier;
  }

  // Fetch connections count from working endpoint
  const connSummary = await fetchLinkedInAPI('/voyager/api/relationships/connectionsSummary');
  if (connSummary.success && connSummary.data) {
    const summaryData = connSummary.data.data || connSummary.data;
    profile.connectionsCount = summaryData.numConnections;
    profile.numConnections = summaryData.numConnections;
  }

  // Store raw data for debugging
  profile.rawData = meResult.data;

  await saveToStorage(STORAGE_KEYS.PROFILE_DATA, profile);
  console.log('[ServiceWorker] Profile fetched:', profile.firstName, profile.lastName);

  return { success: true, data: profile };
}

/**
 * Fetch profile analytics (FIXED - using only working endpoints)
 */
async function fetchAnalytics() {
  console.log('[ServiceWorker] Fetching analytics...');

  const analytics = {
    extractedAt: new Date().toISOString(),
    source: 'direct_api'
  };

  // Fetch WVMP cards (Who Viewed My Profile) - THIS ENDPOINT WORKS
  const wvmpResult = await fetchLinkedInAPI('/voyager/api/identity/wvmpCards');

  if (wvmpResult.success && wvmpResult.data) {
    // Parse WVMP data - check both data.data and data directly
    const wvmpData = wvmpResult.data.data || wvmpResult.data;

    if (wvmpData.elements) {
      wvmpData.elements.forEach(element => {
        // Profile views
        if (element.numViews !== undefined) {
          analytics.profileViews = element.numViews;
        }
        if (element.insightCards) {
          element.insightCards.forEach(card => {
            if (card.numViews !== undefined) {
              analytics.profileViews = card.numViews;
            }
          });
        }
      });
    }

    // Parse included for viewer details
    const included = wvmpResult.data.included || [];
    analytics.recentViewers = [];

    included.forEach(item => {
      if (item.$type?.includes('MiniProfile') || item.$type?.includes('Profile')) {
        if (item.firstName) {
          analytics.recentViewers.push({
            firstName: item.firstName,
            lastName: item.lastName,
            headline: item.occupation || item.headline,
            publicIdentifier: item.publicIdentifier
          });
        }
      }
    });
  }

  // Fetch connections count from working endpoint
  const connSummary = await fetchConnectionsSummary();
  if (connSummary.success && connSummary.data) {
    analytics.connectionsCount = connSummary.data.numConnections;
  }

  await saveToStorage(STORAGE_KEYS.ANALYTICS_DATA, analytics);
  console.log('[ServiceWorker] Analytics fetched:', analytics.profileViews, 'views,', analytics.connectionsCount, 'connections');

  return { success: true, data: analytics };
}

/**
 * Fetch connection summary (count) - FIXED
 */
async function fetchConnectionsSummary() {
  // Use the working endpoint
  const result = await fetchLinkedInAPI('/voyager/api/relationships/connectionsSummary');

  if (result.success && result.data) {
    // Data is nested under result.data.data
    const summaryData = result.data.data || result.data;

    return {
      success: true,
      data: {
        numConnections: summaryData.numConnections || 0,
        entityUrn: summaryData.entityUrn
      },
      raw: result.data
    };
  }

  return result;
}

/**
 * Fetch detailed connections list (Taplio-style) - FIXED for normalized response format
 */
async function fetchConnections(start = 0, count = 40) {
  console.log(`[ServiceWorker] Fetching connections: start=${start}, count=${count}`);

  // Use the proper LinkedIn connections endpoint with decoration
  const connectionsEndpoint = `/voyager/api/relationships/dash/connections?decorationId=${DECORATION_IDS.CONNECTIONS_LIST}&count=${count}&q=search&sortType=RECENTLY_ADDED&start=${start}`;

  const result = await fetchLinkedInAPI(connectionsEndpoint);

  if (result.success && result.data) {
    const connectionsData = {
      extractedAt: new Date().toISOString(),
      source: 'direct_api',
      connections: [],
      paging: result.data.data?.paging || result.data.paging || { start, count }
    };

    // NORMALIZED RESPONSE FORMAT (with accept: application/vnd.linkedin.normalized+json+2.1):
    // - Data is in result.data.included[] array
    // - Connection objects have $type: "com.linkedin.voyager.dash.relationships.Connection"
    // - Profile objects have $type: "com.linkedin.voyager.dash.identity.profile.Profile"
    // - Connections reference profiles via "*connectedMemberResolutionResult"

    const included = result.data.included || [];

    // Separate connections and profiles
    const connectionObjects = included.filter(item =>
      item.$type === 'com.linkedin.voyager.dash.relationships.Connection'
    );

    const profileObjects = included.filter(item =>
      item.$type === 'com.linkedin.voyager.dash.identity.profile.Profile'
    );

    // Build profile map by entityUrn
    const profileMap = {};
    profileObjects.forEach(profile => {
      if (profile.entityUrn) {
        profileMap[profile.entityUrn] = profile;
      }
    });

    console.log(`[ServiceWorker] Found ${connectionObjects.length} connections and ${profileObjects.length} profiles in included array`);

    // Process each connection object
    connectionObjects.forEach(conn => {
      // Get the profile URN from the connection (note: asterisk prefix in key name)
      const profileUrn = conn['*connectedMemberResolutionResult'] || conn.connectedMember;
      const profile = profileMap[profileUrn];

      const connection = {
        connectionUrn: conn.entityUrn,
        connectedMember: conn.connectedMember
      };

      if (profile) {
        connection.firstName = profile.firstName;
        connection.lastName = profile.lastName;
        connection.fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
        connection.headline = profile.headline;
        connection.publicIdentifier = profile.publicIdentifier;
        connection.entityUrn = profile.entityUrn;
        connection.profileUrl = profile.publicIdentifier ?
          `https://www.linkedin.com/in/${profile.publicIdentifier}` : null;
        connection.memorialized = profile.memorialized || false;

        // Get profile picture
        if (profile.profilePicture?.displayImageReference?.vectorImage) {
          const img = profile.profilePicture.displayImageReference.vectorImage;
          const artifact = img.artifacts?.[0]?.fileIdentifyingUrlPathSegment || '';
          connection.profilePicture = img.rootUrl ? (img.rootUrl + artifact) : null;
        } else if (profile.profilePicture?.displayImageUrn) {
          connection.profilePictureUrn = profile.profilePicture.displayImageUrn;
        }
      }

      // Only add if we have profile data
      if (connection.firstName || connection.publicIdentifier) {
        connectionsData.connections.push(connection);
      }
    });

    // Update paging info
    if (result.data.data?.paging) {
      connectionsData.paging = result.data.data.paging;
    }

    console.log(`[ServiceWorker] Processed ${connectionsData.connections.length} connections in this batch (raw: ${connectionObjects.length})`);

    return {
      success: true,
      data: connectionsData,
      connectionsCount: connectionsData.connections.length,
      rawConnectionCount: connectionObjects.length,  // Raw count before filtering for pagination
      requestedCount: count
    };
  }

  return result;
}

/**
 * Fetch all connections with pagination (Taplio-style) - FIXED
 */
async function fetchAllConnections(maxConnections = 500) {
  const allConnections = [];
  let start = 0;
  const pageSize = 40; // LinkedIn uses 40 per page
  let hasMore = true;

  console.log('[ServiceWorker] Starting to fetch all connections...');

  // Fetch connections in batches until we get fewer than requested (end of list)
  while (hasMore && allConnections.length < maxConnections) {
    const result = await fetchConnections(start, pageSize);

    if (result.success && result.data && result.data.connections) {
      const batchConnections = result.data.connections;

      // Avoid duplicates using Set
      const existingIds = new Set(allConnections.map(c =>
        c.publicIdentifier || c.entityUrn || c.connectionUrn
      ));

      const newConnections = batchConnections.filter(c => {
        const id = c.publicIdentifier || c.entityUrn || c.connectionUrn;
        return id && !existingIds.has(id);
      });

      allConnections.push(...newConnections);
      console.log(`[ServiceWorker] Fetched ${allConnections.length} connections so far (batch had ${batchConnections.length}, raw: ${result.rawConnectionCount})`);

      // Use RAW connection count for pagination (before filtering out profiles without data)
      const rawCount = result.rawConnectionCount || batchConnections.length;
      if (rawCount < pageSize) {
        hasMore = false;
        console.log('[ServiceWorker] Reached end of connections list');
      }
    } else {
      console.error('[ServiceWorker] Failed to fetch connections batch at start:', start);
      break;
    }

    start += pageSize;

    // Small delay to avoid rate limiting
    if (hasMore) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  const connectionsData = {
    extractedAt: new Date().toISOString(),
    source: 'direct_api',
    totalConnections: allConnections.length,
    fetchedConnections: allConnections.length,
    connections: allConnections
  };

  await saveToStorage(STORAGE_KEYS.CONNECTIONS_DATA, connectionsData);
  console.log(`[ServiceWorker] Finished fetching ${allConnections.length} connections`);

  return {
    success: true,
    data: connectionsData,
    totalConnections: allConnections.length,
    fetchedConnections: allConnections.length
  };
}

/**
 * Fetch feed posts from network (Top Hits feature like Taplio)
 * NOTE: LinkedIn's feed API is heavily restricted and doesn't work with direct fetch.
 * Feed posts are captured passively via content script when user browses their feed.
 */
async function fetchFeedPosts(count = 50) {
  console.log('[ServiceWorker] Feed posts: using passive capture (direct API disabled)');

  // Return empty - feed posts will be captured by content script when user browses feed
  // LinkedIn's feed API requires browser cookies/context that extensions can't reliably access
  return {
    success: true,
    data: {
      posts: [],
      topHits: [],
      message: 'Feed posts captured passively when browsing LinkedIn feed'
    }
  };
}

/**
 * Fetch user's own posts/activity
 */
async function fetchMyPosts(count = 20) {
  console.log('[ServiceWorker] Fetching my posts...');

  const postsData = {
    extractedAt: new Date().toISOString(),
    source: 'direct_api',
    posts: [],
    message: 'Posts data extracted from page interactions'
  };

  // Note: Direct feed API requires specific authentication that may not work from extension
  // Posts are better captured via the injected script intercepting feed API calls

  await saveToStorage(STORAGE_KEYS.POSTS_DATA, postsData);
  console.log('[ServiceWorker] Posts endpoint skipped (use API interception instead)');

  return { success: true, data: postsData };
}

// ============================================
// MESSAGE HANDLING
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[ServiceWorker] Received message:', message.type);

  // Handle async operations
  (async () => {
    let response;

    switch (message.type) {
      // Cookie operations
      case 'GET_COOKIES':
        response = await getLinkedInCookies();
        break;

      case 'CHECK_AUTH':
        response = await checkAuthentication();
        break;

      // Storage operations
      case 'SAVE_DATA':
        response = await saveToStorage(message.key, message.data);
        break;

      case 'GET_DATA':
        response = await getFromStorage(message.key);
        break;

      case 'GET_ALL_DATA':
        response = await getAllStoredData();
        break;

      case 'CLEAR_DATA':
        response = await clearStorage();
        break;

      case 'APPEND_DATA':
        response = await appendToStorage(message.key, message.data);
        break;

      // Captured API data from content script
      case 'API_CAPTURED':
        console.log('[ServiceWorker] API_CAPTURED received:', message.endpoint);
        response = await appendToStorage(STORAGE_KEYS.CAPTURED_APIS, {
          endpoint: message.endpoint,
          method: message.method,
          responseData: message.data,
          url: message.url
        });
        console.log('[ServiceWorker] API_CAPTURED stored, result:', response);
        break;

      case 'PROFILE_CAPTURED':
        response = await saveToStorage(STORAGE_KEYS.PROFILE_DATA, message.data);
        break;

      case 'ANALYTICS_CAPTURED':
        console.log('[ServiceWorker] ANALYTICS_CAPTURED received:', message.data);
        response = await saveToStorage(STORAGE_KEYS.ANALYTICS_DATA, message.data);
        console.log('[ServiceWorker] Analytics saved to storage:', response);
        break;

      case 'POST_ANALYTICS_CAPTURED':
        console.log('[ServiceWorker] POST_ANALYTICS_CAPTURED received:', message.data?.activityUrn);
        response = await savePostAnalyticsToStorage(message.data);
        console.log('[ServiceWorker] Post analytics saved:', response);
        break;

      case 'AUDIENCE_DATA_CAPTURED':
        console.log('[ServiceWorker] AUDIENCE_DATA_CAPTURED received:', message.data?.totalFollowers);
        response = await saveAudienceDataToStorage(message.data);
        console.log('[ServiceWorker] Audience data saved:', response);
        break;

      case 'SAVE_FEED_POSTS':
        // Save feed posts with deduplication and sorting by engagement
        response = await saveFeedPostsToStorage(message.posts);
        break;

      case 'SAVE_COMMENTS':
        // Save comments with deduplication
        response = await saveCommentsToStorage(message.comments);
        break;

      case 'SAVE_MY_POSTS':
        // Save your own posts with analytics
        response = await saveMyPostsToStorage(message.posts);
        break;

      case 'SAVE_FOLLOWERS':
        // Save followers data
        response = await saveFollowersToStorage(message.data);
        break;

      case 'SAVE_TRENDING':
        // Save trending topics
        response = await saveTrendingToStorage(message.topics);
        break;

      // Export operations
      case 'EXPORT_JSON':
        response = await exportAsJSON();
        break;

      case 'EXPORT_CSV':
        response = await exportAsCSV(message.dataKey);
        break;

      // Get statistics
      case 'GET_STATS':
        const allData = await getAllStoredData();
        if (allData.success) {
          const capturedApis = allData.data[STORAGE_KEYS.CAPTURED_APIS] || [];
          const profile = allData.data[STORAGE_KEYS.PROFILE_DATA];
          const analytics = allData.data[STORAGE_KEYS.ANALYTICS_DATA];
          const connections = allData.data[STORAGE_KEYS.CONNECTIONS_DATA];

          response = {
            success: true,
            stats: {
              apisCaptured: capturedApis.length,
              hasProfile: !!profile,
              hasAnalytics: !!analytics,
              hasConnections: !!connections,
              connectionsCount: connections?.connections?.length || connections?.fetchedConnections || 0,
              totalConnections: connections?.totalConnections || 0,
              lastCapture: capturedApis.length > 0
                ? capturedApis[capturedApis.length - 1].capturedAt
                : null
            }
          };
        } else {
          response = allData;
        }
        break;

      // Direct API calls (like Taplio)
      case 'FETCH_PROFILE':
        response = await fetchMyProfile();
        break;

      case 'FETCH_ANALYTICS':
        response = await fetchAnalytics();
        break;

      case 'FETCH_CONNECTIONS':
        response = await fetchConnections(message.start || 0, message.count || 100);
        break;

      case 'FETCH_CONNECTIONS_SUMMARY':
        response = await fetchConnectionsSummary();
        break;

      case 'FETCH_ALL_CONNECTIONS':
        response = await fetchAllConnections(message.maxConnections || 500);
        break;

      case 'FETCH_POSTS':
        response = await fetchMyPosts(message.count || 20);
        break;

      case 'FETCH_FEED_POSTS':
        response = await fetchFeedPosts(message.count || 50);
        break;

      case 'FETCH_ALL_DATA':
        // Fetch all data at once (Taplio-style)
        console.log('[ServiceWorker] Fetching all data...');

        // Fetch profile and analytics in parallel first
        const [profileResult, analyticsResult] = await Promise.all([
          fetchMyProfile(),
          fetchAnalytics()
        ]);

        // Then fetch ALL connections (with pagination)
        const connectionsResult = await fetchAllConnections(500);

        // Feed posts disabled - LinkedIn API requires browser context
        // Posts will be captured passively via content script when user browses feed
        const feedPostsResult = { success: true, data: { posts: [], topHits: [] } };

        response = {
          success: true,
          profile: profileResult,
          analytics: analyticsResult,
          connections: connectionsResult,
          posts: feedPostsResult
        };
        console.log('[ServiceWorker] All data fetched successfully');
        console.log(`[ServiceWorker] Connections: ${connectionsResult.fetchedConnections}`);
        break;

      default:
        response = { success: false, error: 'Unknown message type' };
    }

    sendResponse(response);
  })();

  // Return true to indicate async response
  return true;
});

// ============================================
// EXTENSION LIFECYCLE
// ============================================

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[ServiceWorker] Extension installed:', details.reason);

  // Initialize default settings
  saveToStorage(STORAGE_KEYS.SETTINGS, {
    autoCapture: true,
    captureProfiles: true,
    captureAnalytics: true,
    captureConnections: true,
    maxStoredApis: 1000
  });
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[ServiceWorker] Browser started');
});

// Log when service worker is active
console.log('[ServiceWorker] LinkedIn Data Extractor service worker loaded');

/**
 * LinkedIn Data Extractor - Content Script
 *
 * Main orchestrator for the content scripts.
 * Coordinates between interceptor, DOM extractor, and background service worker.
 */

(function() {
  'use strict';

  // Prevent double initialization
  if (window.__linkedInContentScriptLoaded) return;
  window.__linkedInContentScriptLoaded = true;

  console.log('[ContentScript] LinkedIn Data Extractor content script loading...');

  // ============================================
  // MAIN WORLD INTERCEPTOR LOADED VIA MANIFEST
  // ============================================
  // The main-world-interceptor.js is loaded via manifest.json with world: "MAIN"
  // This ensures it runs before LinkedIn's code can cache fetch/XHR references.
  // No script injection needed here - the manifest handles it.

  console.log('[ContentScript] Content script loaded - main world interceptor via manifest');

  // ============================================
  // CONFIGURATION
  // ============================================

  const CONFIG = {
    // Auto-capture settings
    autoCapture: true,
    debounceMs: 500,

    // Data categories to track
    categories: ['profile', 'analytics', 'connections', 'feed', 'posts', 'comments', 'myPosts', 'followers', 'trending', 'reactions', 'messaging', 'network', 'other'],

    // Maximum items to store per category
    maxItemsPerCategory: 100
  };

  // ============================================
  // STATE MANAGEMENT
  // ============================================

  const state = {
    isInitialized: false,
    capturedData: {
      profile: null,
      analytics: null,
      connections: [],
      feed: [],
      apiResponses: []
    },
    settings: null
  };

  // ============================================
  // MESSAGING WITH SERVICE WORKER
  // ============================================

  /**
   * Check if extension context is still valid
   */
  function isExtensionContextValid() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  /**
   * Send message to service worker and get response
   */
  async function sendToBackground(message) {
    // Check if extension context is still valid (handles extension reload)
    if (!isExtensionContextValid()) {
      console.log('[ContentScript] Extension context invalidated, skipping message');
      return null;
    }

    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, response => {
          if (chrome.runtime.lastError) {
            // Silently handle extension context errors
            const errorMsg = chrome.runtime.lastError.message || '';
            if (errorMsg.includes('Extension context invalidated') ||
                errorMsg.includes('message port closed')) {
              console.log('[ContentScript] Extension reloaded, message not sent');
              resolve(null);
            } else {
              reject(chrome.runtime.lastError);
            }
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        // Silently handle context errors
        if (error.message?.includes('Extension context invalidated')) {
          console.log('[ContentScript] Extension context lost');
          resolve(null);
        } else {
          reject(error);
        }
      }
    });
  }

  /**
   * Save captured API data to storage
   */
  async function saveApiData(data) {
    try {
      const result = await sendToBackground({
        type: 'API_CAPTURED',
        endpoint: data.endpoint,
        method: data.method,
        url: data.url,
        data: data.data
      });
      if (result) {
        console.log('[ContentScript] API saved:', data.category, '- total:', result.count);
      }
      // Silently ignore null results (extension reloaded - user needs to refresh page)
    } catch (error) {
      console.error('[ContentScript] Error saving API data:', error);
    }
  }

  /**
   * Save profile data to storage
   */
  async function saveProfileData(data) {
    try {
      await sendToBackground({
        type: 'PROFILE_CAPTURED',
        data: data
      });
      state.capturedData.profile = data;
    } catch (error) {
      console.error('[ContentScript] Error saving profile data:', error);
    }
  }

  /**
   * Save analytics data to storage
   */
  async function saveAnalyticsData(data) {
    try {
      await sendToBackground({
        type: 'ANALYTICS_CAPTURED',
        data: data
      });
      state.capturedData.analytics = data;
    } catch (error) {
      console.error('[ContentScript] Error saving analytics data:', error);
    }
  }

  // ============================================
  // API INTERCEPTION HANDLER
  // ============================================

  /**
   * Handle captured API responses from interceptor
   */
  function handleCapturedApi(event) {
    const data = event.detail;

    if (!data || !data.endpoint) return;

    console.log('[ContentScript] API captured:', data.category, data.endpoint);

    // Store in local state
    state.capturedData.apiResponses.push({
      ...data,
      capturedAt: new Date().toISOString()
    });

    // Trim if too many
    if (state.capturedData.apiResponses.length > CONFIG.maxItemsPerCategory) {
      state.capturedData.apiResponses = state.capturedData.apiResponses.slice(-CONFIG.maxItemsPerCategory);
    }

    // Send to background for persistent storage
    saveApiData(data);

    // Process specific data types
    processApiData(data);
  }

  /**
   * Process API data based on category
   */
  function processApiData(data) {
    switch (data.category) {
      case 'profile':
        processProfileApiData(data);
        break;
      case 'analytics':
        processAnalyticsApiData(data);
        break;
      case 'connections':
        processConnectionsApiData(data);
        break;
      case 'feed':
      case 'posts':
        processFeedApiData(data);
        break;
      case 'comments':
        processCommentsApiData(data);
        break;
      case 'myPosts':
        processMyPostsApiData(data);
        break;
      case 'followers':
        processFollowersApiData(data);
        break;
      case 'trending':
        processTrendingApiData(data);
        break;
      case 'reactions':
        processReactionsApiData(data);
        break;
      case 'messaging':
        processMessagingApiData(data);
        break;
    }
  }

  /**
   * Process profile API response
   */
  function processProfileApiData(data) {
    if (!data.data) return;

    const apiData = data.data;

    // Extract profile from various API response formats
    let profile = null;

    if (apiData.included && Array.isArray(apiData.included)) {
      // LinkedIn often returns data in 'included' array
      profile = apiData.included.find(item =>
        item.$type === 'com.linkedin.voyager.identity.profile.Profile' ||
        item.$type === 'com.linkedin.voyager.dash.identity.profile.Profile' ||
        item.firstName
      );
    } else if (apiData.firstName) {
      profile = apiData;
    }

    if (profile) {
      const extractedProfile = {
        firstName: profile.firstName,
        lastName: profile.lastName,
        headline: profile.headline,
        summary: profile.summary,
        locationName: profile.locationName || profile.geoLocationName,
        industryName: profile.industryName,
        profilePicture: extractProfilePicture(profile),
        publicIdentifier: profile.publicIdentifier,
        entityUrn: profile.entityUrn || profile['*profile'],
        extractedAt: new Date().toISOString(),
        source: 'api'
      };

      saveProfileData(extractedProfile);
    }
  }

  /**
   * Extract profile picture URL from various formats
   */
  function extractProfilePicture(profile) {
    if (!profile) return null;

    // Try different picture formats
    if (profile.profilePicture?.displayImageReference?.vectorImage?.rootUrl) {
      const img = profile.profilePicture.displayImageReference.vectorImage;
      const artifact = img.artifacts?.[img.artifacts.length - 1];
      if (artifact) {
        return img.rootUrl + artifact.fileIdentifyingUrlPathSegment;
      }
    }

    if (profile.picture?.['com.linkedin.common.VectorImage']) {
      const img = profile.picture['com.linkedin.common.VectorImage'];
      const artifact = img.artifacts?.[img.artifacts.length - 1];
      if (artifact) {
        return img.rootUrl + artifact.fileIdentifyingUrlPathSegment;
      }
    }

    return profile.profilePictureUrl || null;
  }

  /**
   * Process analytics API response
   */
  function processAnalyticsApiData(data) {
    if (!data.data) return;

    const apiData = data.data;
    let analytics = {};

    // Extract from various analytics response formats
    if (apiData.elements && Array.isArray(apiData.elements)) {
      apiData.elements.forEach(element => {
        if (element.cardType === 'PROFILE_VIEWS') {
          analytics.profileViews = element.value;
        } else if (element.cardType === 'POST_IMPRESSIONS') {
          analytics.postImpressions = element.value;
        } else if (element.cardType === 'SEARCH_APPEARANCES') {
          analytics.searchAppearances = element.value;
        }
      });
    }

    // Alternative format
    if (apiData.profileViews !== undefined) {
      analytics.profileViews = apiData.profileViews;
    }
    if (apiData.postImpressions !== undefined) {
      analytics.postImpressions = apiData.postImpressions;
    }

    if (Object.keys(analytics).length > 0) {
      analytics.extractedAt = new Date().toISOString();
      analytics.source = 'api';
      saveAnalyticsData(analytics);
    }
  }

  /**
   * Process connections API response
   */
  function processConnectionsApiData(data) {
    if (!data.data) return;

    const apiData = data.data;

    // Connection summary
    if (apiData.numConnections !== undefined) {
      state.capturedData.connectionSummary = {
        count: apiData.numConnections,
        extractedAt: new Date().toISOString()
      };
    }

    // Connection list
    if (apiData.elements && Array.isArray(apiData.elements)) {
      apiData.elements.forEach(connection => {
        state.capturedData.connections.push({
          entityUrn: connection.entityUrn,
          firstName: connection.firstName,
          lastName: connection.lastName,
          headline: connection.headline,
          publicIdentifier: connection.publicIdentifier,
          extractedAt: new Date().toISOString()
        });
      });

      // Trim if too many
      if (state.capturedData.connections.length > CONFIG.maxItemsPerCategory) {
        state.capturedData.connections = state.capturedData.connections.slice(-CONFIG.maxItemsPerCategory);
      }
    }
  }

  /**
   * Process feed API response - Enhanced for content intelligence
   */
  function processFeedApiData(data) {
    if (!data.data) {
      console.log('[ContentScript] processFeedApiData: No data.data');
      return;
    }

    const apiData = data.data;
    const posts = [];

    // Debug: log the structure we received
    console.log('[ContentScript] Feed API data keys:', Object.keys(apiData));

    // LinkedIn GraphQL returns 'included' at root level
    const included = apiData.included || [];

    // For GraphQL, also check for nested data structures
    let elements = apiData.elements || [];

    // GraphQL feed response structure varies - check multiple patterns
    const feedData = apiData.feedDashMainFeedByMainFeed ||
                     apiData.data?.feedDashMainFeedByMainFeed ||
                     apiData.feedDashRecommendedFeedByRecommendedFeed ||
                     apiData.data;

    if (feedData?.elements) {
      elements = feedData.elements;
    }
    if (feedData?.['*elements']) {
      // Element URN references - need to resolve from included
      const elementRefs = feedData['*elements'] || [];
      console.log('[ContentScript] GraphQL feed found', elementRefs.length, 'element refs');
    }

    console.log('[ContentScript] Processing feed - included:', included.length, 'elements:', elements.length);

    // Build lookup maps for included entities
    const updateMap = {};
    const actorMap = {};
    const socialDetailMap = {};
    const commentaryMap = {};

    included.forEach(item => {
      const type = item.$type || '';
      const urn = item.entityUrn || item['*update'] || '';

      // Feed updates
      if (type.includes('Update') || type.includes('Activity')) {
        updateMap[urn] = item;
      }

      // Actors (authors)
      if (type.includes('Actor') || type.includes('MiniProfile')) {
        actorMap[urn] = item;
      }

      // Social details (likes, comments, shares)
      if (type.includes('SocialDetail') || type.includes('SocialActivity')) {
        socialDetailMap[urn] = item;
      }

      // Commentary (post content)
      if (type.includes('Commentary') || type.includes('Share')) {
        commentaryMap[urn] = item;
      }
    });

    // Process updates from included array
    included.forEach(item => {
      const type = item.$type || '';

      // Look for feed update items - check multiple type patterns
      if ((type.includes('Update') || type.includes('FeedUpdate') || type.includes('Activity')) &&
          (item.actor || item['*actor'] || item.actorComponent)) {
        const post = extractPostData(item, actorMap, socialDetailMap, included);
        if (post && (post.text || post.urn)) {
          posts.push(post);
        }
      }
    });

    // Also process elements array if present
    elements.forEach(element => {
      if (element.actor || element['*actor'] || element.actorComponent) {
        const post = extractPostData(element, actorMap, socialDetailMap, included);
        if (post && (post.text || post.urn)) {
          posts.push(post);
        }
      }
    });

    // If we found included items but no posts yet, try extracting from all Update types
    if (posts.length === 0 && included.length > 0) {
      console.log('[ContentScript] No posts found, trying broader extraction...');
      included.forEach(item => {
        const type = item.$type || '';
        if (type.includes('Update') || type.includes('Post') || type.includes('Share')) {
          const post = extractPostData(item, actorMap, socialDetailMap, included);
          if (post && post.urn) {
            posts.push(post);
          }
        }
      });
    }

    // Save unique posts
    if (posts.length > 0) {
      console.log('[ContentScript] Extracted', posts.length, 'posts from feed');
      saveFeedPosts(posts);
    } else {
      console.log('[ContentScript] No posts extracted from feed data');
    }
  }

  /**
   * Extract structured post data from LinkedIn API response
   */
  function extractPostData(item, actorMap, socialDetailMap, included) {
    try {
      const post = {
        urn: item.entityUrn || item.activityUrn || item.urn,
        extractedAt: new Date().toISOString()
      };

      // Get actor (author) info
      const actorUrn = item.actor?.['*miniProfile'] || item['*actor'] || item.actor?.entityUrn;
      const actor = actorMap[actorUrn] || item.actor || {};

      // Also check included array for actor
      if (!actor.firstName && actorUrn) {
        const foundActor = included.find(i => i.entityUrn === actorUrn);
        if (foundActor) Object.assign(actor, foundActor);
      }

      post.author = {
        name: `${actor.firstName || ''} ${actor.lastName || ''}`.trim() || actor.name?.text || 'Unknown',
        headline: actor.occupation || actor.headline || '',
        profileUrl: actor.publicIdentifier ? `https://linkedin.com/in/${actor.publicIdentifier}` : null,
        profilePicture: extractActorPicture(actor)
      };

      // Get post content/commentary - check multiple possible locations
      const commentary = item.commentary || item.content || item.updateContent || {};
      let postText = commentary.text?.text ||
                     commentary.text ||
                     commentary.shareCommentary?.text?.text ||
                     commentary.shareCommentary?.text ||
                     item.shareText?.text ||
                     item.summary?.text ||
                     item.title?.text ||
                     '';

      // Also check for article/reshare content
      if (!postText && item.resharedUpdate) {
        const reshared = item.resharedUpdate;
        postText = reshared.commentary?.text?.text || reshared.commentary?.text || '';
      }

      // For GraphQL format with nested attributedText
      if (!postText && commentary.attributedText) {
        postText = commentary.attributedText.text || '';
      }

      // Clean up text
      if (typeof postText === 'object') {
        postText = postText.text || JSON.stringify(postText);
      }
      post.text = postText;

      // Get social metrics (engagement)
      const socialDetail = item.socialDetail || item['*socialDetail'] || {};
      const socialUrn = item['*socialDetail'];
      const socialData = socialDetailMap[socialUrn] || socialDetail;

      post.engagement = {
        likes: socialData.totalSocialActivityCounts?.numLikes ||
               socialData.likes?.paging?.total ||
               socialData.numLikes || 0,
        comments: socialData.totalSocialActivityCounts?.numComments ||
                  socialData.comments?.paging?.total ||
                  socialData.numComments || 0,
        shares: socialData.totalSocialActivityCounts?.numShares ||
                socialData.numShares || 0
      };

      // Calculate engagement score (simple formula)
      post.engagementScore = post.engagement.likes +
                            (post.engagement.comments * 3) +
                            (post.engagement.shares * 5);

      // Get post type
      post.type = detectPostType(item);

      // Get timestamp
      post.postedAt = item.createdAt || item.publishedAt || null;

      // Get hashtags
      post.hashtags = extractHashtags(post.text);

      // Get post URL
      if (post.urn) {
        const activityId = post.urn.split(':').pop();
        post.url = `https://www.linkedin.com/feed/update/${post.urn}`;
      }

      return post;
    } catch (error) {
      console.error('[ContentScript] Error extracting post data:', error);
      return null;
    }
  }

  /**
   * Extract profile picture from actor
   */
  function extractActorPicture(actor) {
    if (!actor) return null;

    const picture = actor.picture || actor.profilePicture;
    if (!picture) return null;

    if (picture.rootUrl && picture.artifacts) {
      const artifact = picture.artifacts[picture.artifacts.length - 1];
      return picture.rootUrl + (artifact?.fileIdentifyingUrlPathSegment || '');
    }

    if (picture['com.linkedin.common.VectorImage']) {
      const img = picture['com.linkedin.common.VectorImage'];
      const artifact = img.artifacts?.[img.artifacts.length - 1];
      return img.rootUrl + (artifact?.fileIdentifyingUrlPathSegment || '');
    }

    return picture.url || null;
  }

  /**
   * Detect post type (text, image, video, article, etc.)
   */
  function detectPostType(item) {
    if (item.content?.['com.linkedin.voyager.feed.render.ArticleComponent']) return 'article';
    if (item.content?.['com.linkedin.voyager.feed.render.ImageComponent']) return 'image';
    if (item.content?.['com.linkedin.voyager.feed.render.VideoComponent']) return 'video';
    if (item.content?.['com.linkedin.voyager.feed.render.DocumentComponent']) return 'document';
    if (item.content?.['com.linkedin.voyager.feed.render.CarouselComponent']) return 'carousel';
    if (item.resharedUpdate || item['*resharedUpdate']) return 'reshare';
    return 'text';
  }

  /**
   * Extract hashtags from post text
   */
  function extractHashtags(text) {
    if (!text) return [];
    const matches = text.match(/#[\w]+/g);
    return matches ? [...new Set(matches)] : [];
  }

  /**
   * Save feed posts to storage via background
   */
  async function saveFeedPosts(posts) {
    try {
      await sendToBackground({
        type: 'SAVE_FEED_POSTS',
        posts: posts
      });
      console.log('[ContentScript] Saved', posts.length, 'feed posts');
    } catch (error) {
      console.error('[ContentScript] Error saving feed posts:', error);
    }
  }

  // ============================================
  // COMMENTS PROCESSING
  // ============================================

  /**
   * Process comments API response
   */
  function processCommentsApiData(data) {
    if (!data.data) return;

    const apiData = data.data;
    const comments = [];
    const included = apiData.included || [];

    // Extract comments from included array
    included.forEach(item => {
      const type = item.$type || '';

      if (type.includes('Comment') || type.includes('comment')) {
        const comment = extractCommentData(item, included);
        if (comment && comment.text) {
          comments.push(comment);
        }
      }
    });

    // Also check elements array
    const elements = apiData.elements || apiData.data?.elements || [];
    elements.forEach(item => {
      if (item.comment || item.text || item.commentText) {
        const comment = extractCommentData(item, included);
        if (comment && comment.text) {
          comments.push(comment);
        }
      }
    });

    if (comments.length > 0) {
      console.log('[ContentScript] Extracted', comments.length, 'comments');
      saveComments(comments);
    }
  }

  /**
   * Extract comment data from API response item
   */
  function extractCommentData(item, included) {
    try {
      const comment = {
        urn: item.entityUrn || item.urn,
        extractedAt: new Date().toISOString()
      };

      // Get comment text
      comment.text = item.comment?.text?.text ||
                     item.commentText?.text ||
                     item.text?.text ||
                     item.message?.text ||
                     (typeof item.text === 'string' ? item.text : '');

      // Get author info
      const authorUrn = item.commenter?.['*miniProfile'] ||
                        item.author?.['*miniProfile'] ||
                        item['*commenter'] ||
                        item.actor?.['*miniProfile'];

      let author = {};
      if (authorUrn && included) {
        author = included.find(i => i.entityUrn === authorUrn) || {};
      }

      // Also check commenter directly
      if (item.commenter && item.commenter.firstName) {
        author = item.commenter;
      }

      comment.author = {
        name: `${author.firstName || ''} ${author.lastName || ''}`.trim() || 'Unknown',
        headline: author.occupation || author.headline || '',
        profileUrl: author.publicIdentifier ? `https://linkedin.com/in/${author.publicIdentifier}` : null
      };

      // Get engagement (likes on comment)
      comment.likes = item.socialDetail?.totalSocialActivityCounts?.numLikes ||
                      item.numLikes ||
                      item.likeCount || 0;

      // Get timestamp
      comment.createdAt = item.createdAt || item.created?.time || null;

      // Get parent post URN
      comment.postUrn = item.threadUrn || item['*activity'] || item.parentUrn || null;

      return comment;
    } catch (error) {
      console.error('[ContentScript] Error extracting comment:', error);
      return null;
    }
  }

  /**
   * Save comments to storage
   */
  async function saveComments(comments) {
    try {
      await sendToBackground({
        type: 'SAVE_COMMENTS',
        comments: comments
      });
    } catch (error) {
      console.error('[ContentScript] Error saving comments:', error);
    }
  }

  // ============================================
  // MY POSTS ANALYTICS PROCESSING
  // ============================================

  /**
   * Process your own posts analytics
   */
  function processMyPostsApiData(data) {
    if (!data.data) return;

    const apiData = data.data;
    const myPosts = [];
    const included = apiData.included || [];

    // Build maps
    const analyticsMap = {};
    included.forEach(item => {
      if (item.$type?.includes('Analytics') || item.impressionCount !== undefined) {
        const urn = item.entityUrn || item['*activity'];
        if (urn) analyticsMap[urn] = item;
      }
    });

    // Process elements
    const elements = apiData.elements || [];
    elements.forEach(item => {
      const post = extractMyPostData(item, analyticsMap, included);
      if (post) {
        myPosts.push(post);
      }
    });

    // Also check included for posts
    included.forEach(item => {
      const type = item.$type || '';
      if ((type.includes('Update') || type.includes('Activity') || type.includes('Share')) && item.actor) {
        const post = extractMyPostData(item, analyticsMap, included);
        if (post && post.text) {
          myPosts.push(post);
        }
      }
    });

    if (myPosts.length > 0) {
      console.log('[ContentScript] Extracted', myPosts.length, 'of your posts');
      saveMyPosts(myPosts);
    }
  }

  /**
   * Extract your post data with analytics
   */
  function extractMyPostData(item, analyticsMap, included) {
    try {
      const post = {
        urn: item.entityUrn || item.activityUrn || item.urn,
        extractedAt: new Date().toISOString(),
        isOwn: true
      };

      // Get post text
      const commentary = item.commentary || item.content || {};
      post.text = commentary.text?.text || commentary.text || item.shareText?.text || '';
      if (typeof post.text === 'object') post.text = post.text.text || '';

      // Get engagement
      const socialDetail = item.socialDetail || {};
      post.engagement = {
        likes: socialDetail.totalSocialActivityCounts?.numLikes || item.numLikes || 0,
        comments: socialDetail.totalSocialActivityCounts?.numComments || item.numComments || 0,
        shares: socialDetail.totalSocialActivityCounts?.numShares || item.numShares || 0
      };

      // Get analytics data (impressions, clicks, etc.)
      const analytics = analyticsMap[post.urn] || item.analytics || {};
      post.analytics = {
        impressions: analytics.impressionCount || analytics.totalImpressions || analytics.views || 0,
        uniqueViews: analytics.uniqueImpressionCount || analytics.uniqueViews || 0,
        clicks: analytics.clickCount || analytics.totalClicks || 0,
        engagementRate: analytics.engagementRate || 0,
        ctr: analytics.clickThroughRate || 0
      };

      // Calculate engagement rate if we have impressions
      if (post.analytics.impressions > 0 && !post.analytics.engagementRate) {
        const totalEngagement = post.engagement.likes + post.engagement.comments + post.engagement.shares;
        post.analytics.engagementRate = ((totalEngagement / post.analytics.impressions) * 100).toFixed(2);
      }

      // Get post type and timestamp
      post.type = detectPostType(item);
      post.postedAt = item.createdAt || item.publishedAt || null;
      post.hashtags = extractHashtags(post.text);

      // Post URL
      if (post.urn) {
        post.url = `https://www.linkedin.com/feed/update/${post.urn}`;
      }

      return post;
    } catch (error) {
      console.error('[ContentScript] Error extracting my post:', error);
      return null;
    }
  }

  /**
   * Save your posts to storage
   */
  async function saveMyPosts(posts) {
    try {
      await sendToBackground({
        type: 'SAVE_MY_POSTS',
        posts: posts
      });
    } catch (error) {
      console.error('[ContentScript] Error saving my posts:', error);
    }
  }

  // ============================================
  // FOLLOWERS PROCESSING
  // ============================================

  /**
   * Process followers API response
   */
  function processFollowersApiData(data) {
    if (!data.data) return;

    const apiData = data.data;
    const followers = [];
    const included = apiData.included || [];

    // Extract follower count from summary
    let followerCount = apiData.followerCount ||
                        apiData.numFollowers ||
                        apiData.data?.followerCount;

    // Extract followers from included
    included.forEach(item => {
      const type = item.$type || '';
      if (type.includes('Follower') || type.includes('MiniProfile')) {
        if (item.firstName) {
          followers.push({
            name: `${item.firstName || ''} ${item.lastName || ''}`.trim(),
            headline: item.occupation || item.headline || '',
            publicIdentifier: item.publicIdentifier,
            profileUrl: item.publicIdentifier ? `https://linkedin.com/in/${item.publicIdentifier}` : null,
            entityUrn: item.entityUrn,
            extractedAt: new Date().toISOString()
          });
        }
      }
    });

    // Also check elements
    const elements = apiData.elements || [];
    elements.forEach(item => {
      if (item.follower || item.firstName) {
        const f = item.follower || item;
        followers.push({
          name: `${f.firstName || ''} ${f.lastName || ''}`.trim(),
          headline: f.occupation || f.headline || '',
          publicIdentifier: f.publicIdentifier,
          profileUrl: f.publicIdentifier ? `https://linkedin.com/in/${f.publicIdentifier}` : null,
          entityUrn: f.entityUrn,
          extractedAt: new Date().toISOString()
        });
      }
    });

    if (followers.length > 0 || followerCount) {
      console.log('[ContentScript] Extracted followers data:', followers.length, 'followers, count:', followerCount);
      saveFollowers({ followers, followerCount });
    }
  }

  /**
   * Save followers to storage
   */
  async function saveFollowers(data) {
    try {
      await sendToBackground({
        type: 'SAVE_FOLLOWERS',
        data: data
      });
    } catch (error) {
      console.error('[ContentScript] Error saving followers:', error);
    }
  }

  // ============================================
  // TRENDING TOPICS PROCESSING
  // ============================================

  /**
   * Process trending topics API response
   */
  function processTrendingApiData(data) {
    if (!data.data) return;

    const apiData = data.data;
    const trending = [];
    const included = apiData.included || [];

    // Extract trending topics
    const elements = apiData.elements || [];
    elements.forEach(item => {
      if (item.topic || item.title || item.headline) {
        trending.push({
          topic: item.topic || item.title || item.headline,
          description: item.description || item.summary || '',
          articleCount: item.articleCount || item.numArticles || 0,
          url: item.url || null,
          extractedAt: new Date().toISOString()
        });
      }
    });

    // Also check included for news items
    included.forEach(item => {
      const type = item.$type || '';
      if (type.includes('News') || type.includes('Trending') || type.includes('Topic')) {
        trending.push({
          topic: item.title || item.headline || item.topic,
          description: item.description || item.summary || '',
          source: item.source || item.publisher || '',
          url: item.url || item.navigationUrl || null,
          extractedAt: new Date().toISOString()
        });
      }
    });

    if (trending.length > 0) {
      console.log('[ContentScript] Extracted', trending.length, 'trending topics');
      saveTrending(trending);
    }
  }

  /**
   * Save trending topics to storage
   */
  async function saveTrending(topics) {
    try {
      await sendToBackground({
        type: 'SAVE_TRENDING',
        topics: topics
      });
    } catch (error) {
      console.error('[ContentScript] Error saving trending:', error);
    }
  }

  // ============================================
  // REACTIONS PROCESSING
  // ============================================

  /**
   * Process reactions API response
   */
  function processReactionsApiData(data) {
    if (!data.data) return;

    const apiData = data.data;
    const reactions = [];
    const included = apiData.included || [];

    // Extract reaction counts and types
    const elements = apiData.elements || [];
    elements.forEach(item => {
      if (item.reactionType || item.count) {
        reactions.push({
          type: item.reactionType || item.type || 'LIKE',
          count: item.count || 1,
          postUrn: item.threadUrn || item['*activity'] || item.parentUrn,
          extractedAt: new Date().toISOString()
        });
      }
    });

    // Also extract reactors (who reacted)
    included.forEach(item => {
      const type = item.$type || '';
      if (type.includes('Reactor') || type.includes('Reaction')) {
        if (item.firstName) {
          reactions.push({
            reactor: {
              name: `${item.firstName || ''} ${item.lastName || ''}`.trim(),
              headline: item.occupation || item.headline || '',
              profileUrl: item.publicIdentifier ? `https://linkedin.com/in/${item.publicIdentifier}` : null
            },
            reactionType: item.reactionType || 'LIKE',
            extractedAt: new Date().toISOString()
          });
        }
      }
    });

    if (reactions.length > 0) {
      console.log('[ContentScript] Extracted', reactions.length, 'reactions');
      // Store in captured data - can be extended to save to background
      state.capturedData.reactions = state.capturedData.reactions || [];
      state.capturedData.reactions.push(...reactions);
    }
  }

  // ============================================
  // MESSAGING PROCESSING
  // ============================================

  /**
   * Process messaging API response
   */
  function processMessagingApiData(data) {
    if (!data.data) return;

    const apiData = data.data;

    // Extract mailbox counts
    if (apiData.unreadCount !== undefined || apiData.totalCount !== undefined) {
      const messagingStats = {
        unreadCount: apiData.unreadCount || 0,
        totalCount: apiData.totalCount || 0,
        extractedAt: new Date().toISOString()
      };
      console.log('[ContentScript] Messaging stats:', messagingStats);
      state.capturedData.messaging = messagingStats;
    }

    // Extract conversation previews
    const included = apiData.included || [];
    const conversations = [];

    included.forEach(item => {
      const type = item.$type || '';
      if (type.includes('Conversation') || type.includes('Thread')) {
        conversations.push({
          urn: item.entityUrn,
          unreadCount: item.unreadCount || 0,
          lastActivityAt: item.lastActivityAt || null,
          extractedAt: new Date().toISOString()
        });
      }
    });

    if (conversations.length > 0) {
      console.log('[ContentScript] Extracted', conversations.length, 'conversation previews');
    }
  }

  // ============================================
  // DOM EXTRACTION TRIGGERS
  // ============================================

  /**
   * Debounce function
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Extract data from current page DOM
   */
  const extractFromDOM = debounce(() => {
    if (!window.LinkedInDOMExtractor) return;

    const pageType = window.LinkedInDOMExtractor.detectPageType();
    console.log('[ContentScript] Extracting DOM data, page type:', pageType);

    switch (pageType) {
      case 'profile':
        const profileData = window.LinkedInDOMExtractor.extractProfileData();
        if (profileData && profileData.name) {
          saveProfileData(profileData);
        }
        break;

      case 'analytics':
        const analyticsData = window.LinkedInDOMExtractor.extractAnalyticsData();
        if (analyticsData) {
          saveAnalyticsData(analyticsData);
        }
        break;
    }
  }, CONFIG.debounceMs);

  // ============================================
  // PAGE CHANGE DETECTION
  // ============================================

  /**
   * Handle URL changes (LinkedIn uses SPA navigation)
   */
  function setupNavigationListener() {
    let lastUrl = location.href;

    // Use MutationObserver to detect URL changes
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        console.log('[ContentScript] URL changed:', lastUrl);
        extractFromDOM();
      }
    });

    // Wait for document.body to exist before observing
    function startObserving() {
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
        console.log('[ContentScript] MutationObserver started');
      } else {
        // If body doesn't exist yet, wait for it
        const bodyObserver = new MutationObserver((mutations, obs) => {
          if (document.body) {
            obs.disconnect();
            observer.observe(document.body, { childList: true, subtree: true });
            console.log('[ContentScript] MutationObserver started (delayed)');
          }
        });
        bodyObserver.observe(document.documentElement, { childList: true });
      }
    }

    startObserving();

    // Also listen for popstate
    window.addEventListener('popstate', () => {
      console.log('[ContentScript] Popstate event');
      extractFromDOM();
    });
  }

  // ============================================
  // MESSAGE HANDLING FROM POPUP
  // ============================================

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[ContentScript] Received message:', message.type);

    switch (message.type) {
      case 'EXTRACT_NOW':
        // Manual extraction triggered from popup
        const allData = window.LinkedInDOMExtractor?.extractAll() || {};
        sendResponse({ success: true, data: allData });
        break;

      case 'GET_PAGE_TYPE':
        const pageType = window.LinkedInDOMExtractor?.detectPageType() || 'unknown';
        sendResponse({ success: true, pageType: pageType });
        break;

      case 'GET_AUTH_STATUS':
        const authToken = window.LinkedInDOMExtractor?.getAuthToken();
        sendResponse({
          success: true,
          isAuthenticated: !!authToken,
          hasToken: !!authToken
        });
        break;

      case 'GET_CAPTURED_DATA':
        sendResponse({
          success: true,
          data: state.capturedData
        });
        break;

      default:
        sendResponse({ success: false, error: 'Unknown message type' });
    }

    return true; // Keep channel open for async response
  });

  // ============================================
  // INITIALIZATION
  // ============================================

  function initialize() {
    if (state.isInitialized) return;

    console.log('[ContentScript] Initializing...');

    // Listen for captured API data from main world interceptor
    // IMPORTANT: Use document.addEventListener because document is shared between
    // MAIN world (where interceptor runs) and ISOLATED world (where content script runs).
    // window.addEventListener won't work because each world has its own window object!
    document.addEventListener('linkedin-api-captured', handleCapturedApi);

    // Listen for injected script ready event
    document.addEventListener('linkedin-extractor-ready', (event) => {
      console.log('[ContentScript] Injected script ready, version:', event.detail?.version);
    });

    // Listen for main world interceptor ready
    document.addEventListener('linkedin-main-interceptor-ready', (event) => {
      console.log('[ContentScript] Main world interceptor ready, version:', event.detail?.version);
    });

    // Listen for Response.json captures (backup)
    document.addEventListener('linkedin-response-json', handleCapturedApi);

    // Set up navigation listener for SPA page changes
    setupNavigationListener();

    // Initial DOM extraction after page load
    if (document.readyState === 'complete') {
      extractFromDOM();
    } else {
      window.addEventListener('load', extractFromDOM);
    }

    // Also extract after a delay to catch dynamic content
    setTimeout(extractFromDOM, 2000);
    setTimeout(extractFromDOM, 5000);

    state.isInitialized = true;
    console.log('[ContentScript] Initialization complete');
  }

  // Wait for DOM extractor to be ready
  if (window.LinkedInDOMExtractor) {
    initialize();
  } else {
    window.addEventListener('linkedin-dom-extractor-ready', initialize);
    // Fallback - initialize after timeout even if extractor not ready
    setTimeout(initialize, 1000);
  }

})();

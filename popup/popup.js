/**
 * LinkedIn Analytics Pro - Popup Script
 * Enhanced dashboard with insights and analytics
 */

(function() {
  'use strict';

  // ============================================
  // STATE
  // ============================================

  const state = {
    profile: null,
    analytics: null,
    connections: [],
    posts: [],
    isAuthenticated: false,
    currentView: 'dashboard',
    chartPeriod: 'week'
  };

  // ============================================
  // DOM ELEMENTS
  // ============================================

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Elements will be populated after DOM is ready
  let elements = {};

  function initElements() {
    elements = {
      // Navigation
      navPills: $$('.nav-pill'),
      views: $$('.view'),

      // Profile
      profileAvatar: $('#profile-avatar'),
      profileName: $('#profile-name'),
      profileHeadline: $('#profile-headline'),
      profileLocation: $('#profile-location span'),
      profileIndustry: $('#profile-industry span'),
      premiumBadge: $('#premium-badge'),

      // Stats
      statConnections: $('#stat-connections'),
      statViews: $('#stat-views'),
      statSearch: $('#stat-search'),
      connectionsGrowth: $('#connections-growth'),
      viewsGrowth: $('#views-growth'),

      // Status
      statusIndicator: $('#status-indicator'),

      // Chart
      chartArea: $('#chart-area'),
      chartPlaceholder: $('#chart-placeholder'),
      chartTabs: $$('.chart-tab'),

      // Viewers
      viewersList: $('#viewers-list'),
      viewerCount: $('#viewer-count'),

      // Posts/Top Hits
      postsList: $('#posts-list'),
      postsCount: $('#posts-count'),

      // Connections
      connectionsList: $('#connections-list'),
      searchConnections: $('#search-connections'),
      showingCount: $('#showing-count'),
      totalCount: $('#total-count'),
      filterChips: $$('.chip'),

      // Insights
      industryList: $('#industry-list'),
      companyList: $('#company-list'),
      locationList: $('#location-list'),
      networkScore: $('#network-score'),
      scoreCircle: $('#score-circle'),

      // Buttons
      btnFetch: $('#btn-fetch'),
      btnRefresh: $('#btn-refresh'),
      btnExportJson: $('#btn-export-json'),
      btnExportCsv: $('#btn-export-csv'),
      btnExportAllJson: $('#btn-export-all-json'),
      btnExportAllCsv: $('#btn-export-all-csv'),
      btnClearData: $('#btn-clear-data'),
      btnLoadConnections: $('#btn-load-connections'),

      // Settings
      toggleAutoCapture: $('#toggle-auto-capture'),
      toggleStoreImages: $('#toggle-store-images'),

      // Loading
      loadingOverlay: $('#loading-overlay'),
      loadingText: $('#loading-text'),
      progressBar: $('#progress-bar'),

      // Toast
      toast: $('#toast'),
      toastMessage: $('#toast-message'),
      toastIcon: $('#toast-icon')
    };
  }

  // ============================================
  // MESSAGING
  // ============================================

  async function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  // ============================================
  // UI HELPERS
  // ============================================

  function showLoading(text = 'Loading...', progress = 0) {
    if (elements.loadingText) elements.loadingText.textContent = text;
    if (elements.progressBar) elements.progressBar.style.width = `${progress}%`;
    if (elements.loadingOverlay) elements.loadingOverlay.classList.remove('hidden');
  }

  function updateLoadingProgress(text, progress) {
    if (elements.loadingText) elements.loadingText.textContent = text;
    if (elements.progressBar) elements.progressBar.style.width = `${progress}%`;
  }

  function hideLoading() {
    if (elements.loadingOverlay) elements.loadingOverlay.classList.add('hidden');
    if (elements.progressBar) elements.progressBar.style.width = '0%';
  }

  function showToast(message, type = 'info') {
    if (!elements.toast || !elements.toastIcon || !elements.toastMessage) return;

    const icons = {
      success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>',
      error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
      warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'
    };

    elements.toastIcon.innerHTML = icons[type] || icons.info;
    elements.toastMessage.textContent = message;
    elements.toast.className = `toast ${type}`;
    elements.toast.classList.remove('hidden');

    setTimeout(() => {
      if (elements.toast) elements.toast.classList.add('hidden');
    }, 3500);
  }

  function switchView(viewName) {
    state.currentView = viewName;

    if (elements.navPills) {
      elements.navPills.forEach(pill => {
        if (pill) pill.classList.toggle('active', pill.dataset.view === viewName);
      });
    }

    if (elements.views) {
      elements.views.forEach(view => {
        if (view) view.classList.toggle('active', view.id === `${viewName}-view`);
      });
    }

    // Load data when switching views
    if (viewName === 'connections' && state.connections.length > 0) {
      renderConnections();
    } else if (viewName === 'insights' && state.connections.length > 0) {
      renderInsights();
    }
  }

  function animateValue(element, start, end, duration = 1000) {
    if (!element) return;

    const startTime = performance.now();
    const diff = end - start;

    function update(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current = Math.round(start + diff * eased);
      element.textContent = formatNumber(current);
      element.dataset.value = current;

      if (progress < 1) {
        requestAnimationFrame(update);
      }
    }

    requestAnimationFrame(update);
  }

  // ============================================
  // DATA DISPLAY
  // ============================================

  function updateProfile(profile) {
    if (!profile) return;

    state.profile = profile;

    // Name
    const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'LinkedIn User';
    if (elements.profileName) elements.profileName.textContent = fullName;

    // Headline
    if (elements.profileHeadline) elements.profileHeadline.textContent = profile.headline || 'Connect to see your profile';

    // Location
    if ((profile.locationName || profile.location) && elements.profileLocation) {
      elements.profileLocation.textContent = profile.locationName || profile.location;
    }

    // Industry
    if ((profile.industryName || profile.industry) && elements.profileIndustry) {
      elements.profileIndustry.textContent = profile.industryName || profile.industry;
    }

    // Avatar
    if (profile.profilePicture && elements.profileAvatar) {
      elements.profileAvatar.innerHTML = `<img src="${profile.profilePicture}" alt="${fullName}">`;
    }

    // Premium badge
    if (profile.premium && elements.premiumBadge) {
      elements.premiumBadge.style.display = 'block';
    }

    // Connection count
    const connCount = profile.connectionsCount || profile.numConnections || 0;
    animateValue(elements.statConnections, 0, connCount);
  }

  function updateAnalytics(analytics) {
    if (!analytics) return;

    state.analytics = analytics;

    // Profile views
    if (analytics.profileViews !== undefined) {
      animateValue(elements.statViews, 0, analytics.profileViews);
      if (elements.viewsGrowth) elements.viewsGrowth.textContent = '+' + (analytics.profileViewsGrowth || '0%');
    }

    // Search appearances
    if (analytics.searchAppearances !== undefined) {
      animateValue(elements.statSearch, 0, analytics.searchAppearances);
    }

    // Recent viewers
    if (analytics.recentViewers && analytics.recentViewers.length > 0) {
      renderViewers(analytics.recentViewers);
    }
  }

  function updateAuthStatus(isAuthenticated) {
    state.isAuthenticated = isAuthenticated;
    if (elements.statusIndicator) {
      elements.statusIndicator.classList.toggle('connected', isAuthenticated);
    }
  }

  function renderViewers(viewers) {
    if (!elements.viewersList || !elements.viewerCount) return;

    if (!viewers || viewers.length === 0) {
      elements.viewersList.innerHTML = `
        <div class="empty-state mini">
          <p>No viewers data available</p>
        </div>
      `;
      elements.viewerCount.textContent = '0';
      return;
    }

    elements.viewerCount.textContent = viewers.length;

    elements.viewersList.innerHTML = viewers.slice(0, 8).map(viewer => `
      <div class="viewer-card" data-url="${viewer.profileUrl || '#'}">
        <div class="viewer-avatar">
          ${viewer.profilePicture
            ? `<img src="${viewer.profilePicture}" alt="">`
            : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`
          }
        </div>
        <span class="viewer-name">${viewer.firstName || 'Someone'}</span>
      </div>
    `).join('');

    // Click handlers
    elements.viewersList.querySelectorAll('.viewer-card').forEach(card => {
      card.addEventListener('click', () => {
        const url = card.dataset.url;
        if (url && url !== '#') {
          chrome.tabs.create({ url });
        }
      });
    });
  }

  /**
   * Update feed statistics display
   */
  function updateFeedStats(stats, totalCount) {
    // Update captured posts count
    const capturedPostsEl = $('#captured-posts-count');
    if (capturedPostsEl) {
      capturedPostsEl.textContent = totalCount;
    }

    // Update average engagement
    const avgEngagementEl = $('#avg-engagement');
    if (avgEngagementEl) {
      avgEngagementEl.textContent = formatNumber(stats.avgEngagement || 0);
    }

    // Update top hashtags
    const hashtagsEl = $('#top-hashtags');
    if (hashtagsEl && stats.topHashtags && stats.topHashtags.length > 0) {
      hashtagsEl.innerHTML = stats.topHashtags.slice(0, 8).map(h =>
        `<span class="hashtag-chip">${h.tag} <small>(${h.count})</small></span>`
      ).join('');
    }

    // Update post types
    const postTypesEl = $('#post-types');
    if (postTypesEl && stats.postTypes) {
      const types = Object.entries(stats.postTypes).sort((a, b) => b[1] - a[1]);
      postTypesEl.innerHTML = types.map(([type, count]) =>
        `<span class="type-chip ${type}">${type}: ${count}</span>`
      ).join('');
    }
  }

  /**
   * Update comments statistics display
   */
  function updateCommentsStats(data) {
    const commentsCountEl = $('#comments-count');
    if (commentsCountEl) {
      commentsCountEl.textContent = data.totalCount || 0;
    }

    const topCommentsEl = $('#top-comments-count');
    if (topCommentsEl) {
      topCommentsEl.textContent = data.stats?.topCommentsCount || 0;
    }

    const avgCommentLengthEl = $('#avg-comment-length');
    if (avgCommentLengthEl) {
      avgCommentLengthEl.textContent = data.stats?.avgLength || 0;
    }

    // Render top comments if container exists
    const topCommentsList = $('#top-comments-list');
    if (topCommentsList && data.topComments && data.topComments.length > 0) {
      topCommentsList.innerHTML = data.topComments.slice(0, 5).map(c => `
        <div class="comment-card">
          <div class="comment-author">${c.author?.name || 'Unknown'}</div>
          <div class="comment-text">${truncateText(c.text || '', 100)}</div>
          <div class="comment-likes">${c.likes || 0} likes</div>
        </div>
      `).join('');
    }
  }

  /**
   * Update my posts statistics display
   */
  function updateMyPostsStats(data) {
    const myPostsCountEl = $('#my-posts-count');
    if (myPostsCountEl) {
      myPostsCountEl.textContent = data.totalCount || 0;
    }

    const totalImpressionsEl = $('#total-impressions');
    if (totalImpressionsEl) {
      totalImpressionsEl.textContent = formatNumber(data.stats?.totalImpressions || 0);
    }

    const avgEngagementRateEl = $('#avg-engagement-rate');
    if (avgEngagementRateEl) {
      avgEngagementRateEl.textContent = (data.stats?.avgEngagementRate || 0) + '%';
    }

    const avgLikesEl = $('#my-avg-likes');
    if (avgLikesEl) {
      avgLikesEl.textContent = formatNumber(data.stats?.avgLikes || 0);
    }

    // Render best post if exists
    const bestPostEl = $('#best-post');
    if (bestPostEl && data.bestPost) {
      const p = data.bestPost;
      bestPostEl.innerHTML = `
        <div class="best-post-card">
          <div class="best-post-text">${truncateText(p.text || '', 80)}</div>
          <div class="best-post-stats">
            <span>${formatNumber(p.engagement?.likes || 0)} likes</span>
            <span>${formatNumber(p.engagement?.comments || 0)} comments</span>
            <span>${formatNumber(p.analytics?.impressions || 0)} impressions</span>
          </div>
        </div>
      `;
    }
  }

  /**
   * Update followers statistics display
   */
  function updateFollowersStats(data) {
    const followerCountEl = $('#follower-count');
    if (followerCountEl) {
      followerCountEl.textContent = formatNumber(data.followerCount || 0);
    }

    const followersListCountEl = $('#followers-list-count');
    if (followersListCountEl) {
      followersListCountEl.textContent = data.followers?.length || 0;
    }
  }

  function renderPosts(posts) {
    if (!elements.postsList || !elements.postsCount) return;

    if (!posts || posts.length === 0) {
      elements.postsList.innerHTML = `
        <div class="empty-state mini">
          <p>Browse your LinkedIn feed to capture top posts</p>
        </div>
      `;
      elements.postsCount.textContent = '0';
      return;
    }

    state.posts = posts;
    elements.postsCount.textContent = posts.length;

    elements.postsList.innerHTML = posts.slice(0, 10).map(post => {
      const author = post.author || {};
      const likes = formatNumber(post.engagement?.likes || post.numLikes || 0);
      const comments = formatNumber(post.engagement?.comments || post.numComments || 0);
      const engagementScore = post.engagementScore || 0;
      const timeAgo = getTimeAgo(post.postedAt || post.createdAt);
      const text = truncateText(post.text || post.commentary || '', 100);
      const postType = post.type || 'text';

      return `
        <div class="post-card" data-url="${post.url || '#'}">
          <div class="post-author">
            <div class="post-avatar">
              ${author.profilePicture
                ? `<img src="${author.profilePicture}" alt="${author.name || ''}">`
                : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`
              }
            </div>
            <div class="post-author-info">
              <span class="post-author-name">${author.name || 'Unknown'}</span>
              <span class="post-time">${timeAgo}</span>
            </div>
          </div>
          <p class="post-text">${text}</p>
          <div class="post-stats">
            <span class="post-stat likes">
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M19.46 11l-3.91-3.91a7 7 0 01-1.69-2.74l-.49-1.47A2.76 2.76 0 0010.76 1 2.75 2.75 0 008 3.74v1.12a9.19 9.19 0 00.46 2.85L8.89 9H4.12A2.12 2.12 0 002 11.12a2.16 2.16 0 00.92 1.76A2.11 2.11 0 002 14.62a2.14 2.14 0 001.28 2 2 2 0 00-.28 1 2.12 2.12 0 002 2.12v.14A2.12 2.12 0 007.12 22h7.49a8.08 8.08 0 003.58-.84l.31-.16H21V11zM19 19h-1l-.73.37a6.14 6.14 0 01-2.69.63H7.72a1 1 0 01-.72-.3.93.93 0 01-.28-.7v-.14a.82.82 0 01.13-.44l.11-.14v-.83A.8.8 0 016.14 16a.63.63 0 01-.08-.1l-.11-.14v-.68a.84.84 0 01.08-.38l.11-.21v-.71l-.2-.26a.84.84 0 01-.14-.48 1.1 1.1 0 011.08-1.12H10a1 1 0 001-.88l-.39-1.17A7.24 7.24 0 0110 7.86V3.74a.74.74 0 01.74-.74.77.77 0 01.73.54l.49 1.47a9 9 0 002.13 3.46l4.91 4.91z"/>
              </svg>
              ${likes}
            </span>
            <span class="post-stat comments">
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M7 9h10v1H7zm0 4h7v-1H7zm16-2a6.78 6.78 0 01-2.84 5.61L12 22v-5H7A7 7 0 017 3h10a7 7 0 017 8zm-2 0a5 5 0 00-5-5H7a5 5 0 000 10h7v3.13L18.18 13A4.78 4.78 0 0021 9z"/>
              </svg>
              ${comments}
            </span>
          </div>
        </div>
      `;
    }).join('');

    // Click handlers to open post
    elements.postsList.querySelectorAll('.post-card').forEach(card => {
      card.addEventListener('click', () => {
        const url = card.dataset.url;
        if (url && url !== '#') {
          chrome.tabs.create({ url });
        }
      });
    });
  }

  function getTimeAgo(timestamp) {
    if (!timestamp) return '';

    const now = Date.now();
    const diff = now - timestamp;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  }

  function renderConnections(filter = '') {
    if (!elements.connectionsList) return;

    const connections = state.connections;

    if (!connections || connections.length === 0) {
      elements.connectionsList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
            </svg>
          </div>
          <h4>No connections loaded</h4>
          <p>Fetch your LinkedIn data to see your network</p>
          <button class="btn-secondary" id="btn-load-connections-inner">Load Network</button>
        </div>
      `;

      const loadBtn = $('#btn-load-connections-inner');
      if (loadBtn) {
        loadBtn.addEventListener('click', handleFetchData);
      }

      if (elements.showingCount) elements.showingCount.textContent = '0';
      if (elements.totalCount) elements.totalCount.textContent = '0';
      return;
    }

    // Filter connections
    const filtered = filter
      ? connections.filter(c => {
          const searchStr = `${c.firstName} ${c.lastName} ${c.fullName || ''} ${c.headline || ''} ${c.company || ''}`.toLowerCase();
          return searchStr.includes(filter.toLowerCase());
        })
      : connections;

    if (elements.showingCount) elements.showingCount.textContent = filtered.length;
    if (elements.totalCount) elements.totalCount.textContent = connections.length;

    // Render connections (virtualized - only render visible items)
    const displayConnections = filtered.slice(0, 50);

    elements.connectionsList.innerHTML = displayConnections.map(conn => `
      <div class="connection-card" data-url="${conn.profileUrl || '#'}">
        <div class="connection-avatar">
          ${conn.profilePicture
            ? `<img src="${conn.profilePicture}" alt="${conn.fullName || ''}">`
            : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`
          }
        </div>
        <div class="connection-info">
          <div class="connection-name">${conn.fullName || conn.firstName || 'Unknown'}</div>
          <div class="connection-headline">${conn.headline || '-'}</div>
          ${conn.company ? `<div class="connection-meta">${conn.company}</div>` : ''}
        </div>
        <div class="connection-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
        </div>
      </div>
    `).join('');

    // Click handlers
    elements.connectionsList.querySelectorAll('.connection-card').forEach(card => {
      card.addEventListener('click', () => {
        const url = card.dataset.url;
        if (url && url !== '#') {
          chrome.tabs.create({ url });
        }
      });
    });
  }

  // ============================================
  // CHART
  // ============================================

  function renderChart(connections, period = 'week') {
    if (!elements.chartArea || !elements.chartPlaceholder) return;

    if (!connections || connections.length === 0) {
      elements.chartPlaceholder.classList.remove('hidden');
      return;
    }

    elements.chartPlaceholder.classList.add('hidden');

    // Generate mock data based on connections count
    // In real app, you'd track connection dates
    const periods = {
      week: { count: 7, label: 'day', format: d => d.toLocaleDateString('en', { weekday: 'short' }) },
      month: { count: 30, label: 'day', format: d => d.getDate() },
      year: { count: 12, label: 'month', format: d => d.toLocaleDateString('en', { month: 'short' }) }
    };

    const config = periods[period];
    const data = [];
    const now = new Date();

    for (let i = config.count - 1; i >= 0; i--) {
      const date = new Date(now);
      if (period === 'year') {
        date.setMonth(date.getMonth() - i);
      } else {
        date.setDate(date.getDate() - i);
      }

      // Generate realistic-looking growth data
      const baseValue = Math.floor(connections.length / config.count);
      const variance = Math.floor(Math.random() * (baseValue * 0.5));
      const value = baseValue + variance - Math.floor(baseValue * 0.25);

      data.push({
        label: config.format(date),
        value: Math.max(0, value)
      });
    }

    const maxValue = Math.max(...data.map(d => d.value), 1);

    const chartHTML = `
      <div class="mini-chart">
        ${data.map((d, i) => {
          const height = Math.max((d.value / maxValue) * 100, 5);
          return `
            <div class="chart-bar-wrapper">
              <div class="chart-bar" style="height: ${height}%;" data-value="${d.value} new"></div>
              <span class="chart-bar-label">${d.label}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;

    elements.chartArea.innerHTML = chartHTML;
  }

  // ============================================
  // INSIGHTS
  // ============================================

  function renderInsights() {
    if (!state.connections || state.connections.length === 0) return;
    if (!elements.industryList || !elements.companyList || !elements.locationList) return;

    const connections = state.connections;

    // Industry breakdown
    const industries = {};
    connections.forEach(c => {
      const industry = c.industry || c.industryName || 'Other';
      industries[industry] = (industries[industry] || 0) + 1;
    });

    const topIndustries = Object.entries(industries)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (topIndustries.length > 0) {
      const maxIndustry = topIndustries[0][1];
      elements.industryList.innerHTML = topIndustries.map(([name, count], i) => `
        <div class="industry-item">
          <span class="industry-rank">${i + 1}</span>
          <div class="industry-bar">
            <div class="industry-fill" style="width: ${(count / maxIndustry) * 100}%;">
              <span class="industry-name">${name.length > 15 ? name.slice(0, 15) + '...' : name}</span>
            </div>
            <span class="industry-count">${count}</span>
          </div>
        </div>
      `).join('');
    }

    // Company breakdown
    const companies = {};
    connections.forEach(c => {
      const company = c.company || c.companyName || 'Unknown';
      if (company !== 'Unknown') {
        companies[company] = (companies[company] || 0) + 1;
      }
    });

    const topCompanies = Object.entries(companies)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (topCompanies.length > 0) {
      const maxCompany = topCompanies[0][1];
      elements.companyList.innerHTML = topCompanies.map(([name, count], i) => `
        <div class="company-item">
          <span class="company-rank">${i + 1}</span>
          <div class="company-bar">
            <div class="company-fill" style="width: ${(count / maxCompany) * 100}%;">
              <span class="company-name">${name.length > 12 ? name.slice(0, 12) + '...' : name}</span>
            </div>
            <span class="company-count">${count}</span>
          </div>
        </div>
      `).join('');
    }

    // Location breakdown
    const locations = {};
    connections.forEach(c => {
      const location = c.locationName || c.location || 'Unknown';
      if (location !== 'Unknown') {
        // Simplify to city/country
        const simplified = location.split(',')[0].trim();
        locations[simplified] = (locations[simplified] || 0) + 1;
      }
    });

    const topLocations = Object.entries(locations)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    if (topLocations.length > 0) {
      const maxLocation = topLocations[0][1];
      elements.locationList.innerHTML = topLocations.map(([name, count]) => `
        <div class="location-item">
          <span class="location-name">${name}</span>
          <div class="location-bar">
            <div class="location-fill" style="width: ${(count / maxLocation) * 100}%;"></div>
          </div>
          <span class="location-count">${count}</span>
        </div>
      `).join('');
    }

    // Network score (based on diversity)
    const industryDiversity = Object.keys(industries).length;
    const companyDiversity = Object.keys(companies).length;
    const locationDiversity = Object.keys(locations).length;

    // Calculate score (max 100)
    const networkSize = connections.length;
    const sizeScore = Math.min(networkSize / 500 * 30, 30);
    const industryScore = Math.min(industryDiversity / 20 * 25, 25);
    const companyScore = Math.min(companyDiversity / 50 * 25, 25);
    const locationScore = Math.min(locationDiversity / 30 * 20, 20);

    const totalScore = Math.round(sizeScore + industryScore + companyScore + locationScore);
    if (elements.networkScore) elements.networkScore.textContent = totalScore;

    // Animate score circle
    if (elements.scoreCircle) {
      const circumference = 2 * Math.PI * 54;
      const offset = circumference - (totalScore / 100) * circumference;
      elements.scoreCircle.style.strokeDashoffset = offset;
    }
  }

  // ============================================
  // DATA LOADING
  // ============================================

  async function loadAllData() {
    try {
      // Check auth
      const authResponse = await sendMessage({ type: 'CHECK_AUTH' });
      updateAuthStatus(authResponse.isAuthenticated);

      // Get profile
      const profileResponse = await sendMessage({ type: 'GET_DATA', key: 'linkedin_profile' });
      if (profileResponse.data) {
        updateProfile(profileResponse.data);
      }

      // Get analytics
      const analyticsResponse = await sendMessage({ type: 'GET_DATA', key: 'linkedin_analytics' });
      if (analyticsResponse.data) {
        updateAnalytics(analyticsResponse.data);
      }

      // Get connections
      const connectionsResponse = await sendMessage({ type: 'GET_DATA', key: 'linkedin_connections' });
      if (connectionsResponse.data && connectionsResponse.data.connections) {
        state.connections = connectionsResponse.data.connections;
        animateValue(elements.statConnections, 0, state.connections.length);
        if (elements.connectionsGrowth) elements.connectionsGrowth.textContent = '+' + state.connections.length;
        renderChart(state.connections, state.chartPeriod);
      }

      // Get feed posts (captured from browsing)
      const feedPostsResponse = await sendMessage({ type: 'GET_DATA', key: 'linkedin_feed_posts' });
      if (feedPostsResponse.data) {
        const feedData = feedPostsResponse.data;
        console.log('[Popup] Feed posts loaded:', feedData.totalCount || 0, 'posts');

        // Render top hits (high engagement posts)
        if (feedData.topHits && feedData.topHits.length > 0) {
          renderPosts(feedData.topHits);
        } else if (feedData.posts && feedData.posts.length > 0) {
          renderPosts(feedData.posts.slice(0, 10));
        }

        // Update feed stats display
        if (feedData.stats) {
          updateFeedStats(feedData.stats, feedData.totalCount || 0);
        }

        // Update settings feed count too
        const settingsFeedCount = $('#settings-feed-posts-count');
        if (settingsFeedCount) {
          settingsFeedCount.textContent = feedData.totalCount || 0;
        }
      } else {
        // Fallback to old posts storage
        const postsResponse = await sendMessage({ type: 'GET_DATA', key: 'linkedin_posts' });
        if (postsResponse.data) {
          const postsData = postsResponse.data;
          if (postsData.topHits && postsData.topHits.length > 0) {
            renderPosts(postsData.topHits);
          } else if (postsData.posts && postsData.posts.length > 0) {
            renderPosts(postsData.posts);
          }
        }
      }

      // Get captured APIs count (passive capture data)
      const capturedApisResponse = await sendMessage({ type: 'GET_DATA', key: 'captured_apis' });
      const capturedApisCount = capturedApisResponse.data?.length || 0;
      console.log('[Popup] Captured APIs count:', capturedApisCount);

      // Update captured APIs indicator if element exists
      const capturedIndicator = $('#captured-apis-count');
      if (capturedIndicator) {
        capturedIndicator.textContent = capturedApisCount;
      }

      // Get comments data
      const commentsResponse = await sendMessage({ type: 'GET_DATA', key: 'linkedin_comments' });
      if (commentsResponse.data) {
        const commentsData = commentsResponse.data;
        console.log('[Popup] Comments loaded:', commentsData.totalCount || 0);
        updateCommentsStats(commentsData);
      }

      // Get my posts data
      const myPostsResponse = await sendMessage({ type: 'GET_DATA', key: 'linkedin_my_posts' });
      if (myPostsResponse.data) {
        const myPostsData = myPostsResponse.data;
        console.log('[Popup] My posts loaded:', myPostsData.totalCount || 0);
        updateMyPostsStats(myPostsData);
      }

      // Get followers data
      const followersResponse = await sendMessage({ type: 'GET_DATA', key: 'linkedin_followers' });
      if (followersResponse.data) {
        const followersData = followersResponse.data;
        console.log('[Popup] Followers loaded:', followersData.followerCount || 0);
        updateFollowersStats(followersData);
      }

      // Get settings
      const settingsResponse = await sendMessage({ type: 'GET_DATA', key: 'extension_settings' });
      if (settingsResponse.data) {
        if (elements.toggleAutoCapture) elements.toggleAutoCapture.checked = settingsResponse.data.autoCapture !== false;
        if (elements.toggleStoreImages) elements.toggleStoreImages.checked = settingsResponse.data.storeImages !== false;
      }

    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  async function handleFetchData() {
    showLoading('Connecting to LinkedIn...', 10);

    try {
      updateLoadingProgress('Fetching profile data...', 20);

      const response = await sendMessage({ type: 'FETCH_ALL_DATA' });

      if (response.success) {
        updateLoadingProgress('Processing data...', 60);

        // Update profile
        if (response.profile && response.profile.data) {
          updateProfile(response.profile.data);
        }

        updateLoadingProgress('Loading connections...', 70);

        // Update connections
        if (response.connections && response.connections.data) {
          state.connections = response.connections.data.connections || [];
          animateValue(elements.statConnections, 0, state.connections.length);
          if (elements.connectionsGrowth) elements.connectionsGrowth.textContent = '+' + state.connections.length;
          renderChart(state.connections, state.chartPeriod);
        }

        updateLoadingProgress('Fetching top hits...', 85);

        // Update posts/top hits
        if (response.posts && response.posts.data) {
          const postsData = response.posts.data;
          if (postsData.topHits && postsData.topHits.length > 0) {
            renderPosts(postsData.topHits);
          } else if (postsData.posts && postsData.posts.length > 0) {
            renderPosts(postsData.posts);
          }
        }

        // Update analytics
        if (response.analytics && response.analytics.data) {
          updateAnalytics(response.analytics.data);
        }

        updateLoadingProgress('Done!', 100);

        setTimeout(() => {
          hideLoading();
          showToast('Data fetched successfully!', 'success');
        }, 500);

      } else {
        hideLoading();
        showToast(response.error || 'Failed to fetch data', 'error');
      }
    } catch (error) {
      console.error('Fetch error:', error);
      hideLoading();
      showToast('Make sure you\'re logged into LinkedIn', 'error');
    }
  }

  async function handleExport(type = 'json') {
    try {
      const messageType = type === 'csv' ? 'EXPORT_CSV' : 'EXPORT_JSON';
      const response = await sendMessage({
        type: messageType,
        dataKey: type === 'csv' ? 'linkedin_connections' : undefined
      });

      if (response.success) {
        downloadFile(response.content, response.filename, type === 'csv' ? 'text/csv' : 'application/json');
        showToast(`Exported as ${type.toUpperCase()}!`, 'success');
      } else {
        showToast(response.error || 'Export failed', 'error');
      }
    } catch (error) {
      console.error('Export error:', error);
      showToast('Export failed', 'error');
    }
  }

  async function handleClearData() {
    if (!confirm('Clear all stored data? This cannot be undone.')) {
      return;
    }

    try {
      await sendMessage({ type: 'CLEAR_DATA' });

      // Reset state
      state.profile = null;
      state.analytics = null;
      state.connections = [];
      state.posts = [];

      // Reset UI
      if (elements.profileName) elements.profileName.textContent = 'LinkedIn User';
      if (elements.profileHeadline) elements.profileHeadline.textContent = 'Connect to see your profile';
      if (elements.profileAvatar) elements.profileAvatar.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
      if (elements.statConnections) elements.statConnections.textContent = '-';
      if (elements.statViews) elements.statViews.textContent = '-';
      if (elements.statSearch) elements.statSearch.textContent = '-';

      renderConnections();
      renderViewers([]);
      renderPosts([]);

      showToast('All data cleared', 'success');
    } catch (error) {
      console.error('Clear error:', error);
      showToast('Failed to clear data', 'error');
    }
  }

  async function handleSaveSettings() {
    try {
      await sendMessage({
        type: 'SAVE_DATA',
        key: 'extension_settings',
        data: {
          autoCapture: elements.toggleAutoCapture ? elements.toggleAutoCapture.checked : true,
          storeImages: elements.toggleStoreImages ? elements.toggleStoreImages.checked : true
        }
      });
    } catch (error) {
      console.error('Settings save error:', error);
    }
  }

  function handleSearch(e) {
    const filter = e.target.value;
    renderConnections(filter);
  }

  function handleChartPeriodChange(period) {
    state.chartPeriod = period;
    if (elements.chartTabs) {
      elements.chartTabs.forEach(tab => {
        if (tab) tab.classList.toggle('active', tab.dataset.period === period);
      });
    }
    renderChart(state.connections, period);
  }

  // ============================================
  // UTILITIES
  // ============================================

  function formatNumber(num) {
    if (num === null || num === undefined) return '-';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString();
  }

  function downloadFile(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  function setupEventListeners() {
    try {
      // Navigation
      if (elements.navPills && elements.navPills.length > 0) {
        elements.navPills.forEach(pill => {
          if (pill) pill.addEventListener('click', () => switchView(pill.dataset.view));
        });
      }

    // Main actions
    if (elements.btnFetch) {
      elements.btnFetch.addEventListener('click', handleFetchData);
    }

    if (elements.btnRefresh) {
      elements.btnRefresh.addEventListener('click', handleFetchData);
    }

    // Export buttons
    if (elements.btnExportJson) {
      elements.btnExportJson.addEventListener('click', () => handleExport('json'));
    }

    if (elements.btnExportCsv) {
      elements.btnExportCsv.addEventListener('click', () => handleExport('csv'));
    }

    if (elements.btnExportAllJson) {
      elements.btnExportAllJson.addEventListener('click', () => handleExport('json'));
    }

    if (elements.btnExportAllCsv) {
      elements.btnExportAllCsv.addEventListener('click', () => handleExport('csv'));
    }

    // Clear data
    if (elements.btnClearData) {
      elements.btnClearData.addEventListener('click', handleClearData);
    }

    // Load connections
    if (elements.btnLoadConnections) {
      elements.btnLoadConnections.addEventListener('click', handleFetchData);
    }

    // Settings toggles
    if (elements.toggleAutoCapture) {
      elements.toggleAutoCapture.addEventListener('change', handleSaveSettings);
    }

    if (elements.toggleStoreImages) {
      elements.toggleStoreImages.addEventListener('change', handleSaveSettings);
    }

    // Search
    if (elements.searchConnections) {
      elements.searchConnections.addEventListener('input', handleSearch);
    }

    // Chart period tabs
    if (elements.chartTabs && elements.chartTabs.length > 0) {
      elements.chartTabs.forEach(tab => {
        if (tab) tab.addEventListener('click', () => handleChartPeriodChange(tab.dataset.period));
      });
    }

    // Filter chips
    if (elements.filterChips && elements.filterChips.length > 0) {
      elements.filterChips.forEach(chip => {
        if (chip) {
          chip.addEventListener('click', () => {
            elements.filterChips.forEach(c => c && c.classList.remove('active'));
            chip.classList.add('active');
            // Could implement filtering logic here
          });
        }
      });
    }
    } catch (error) {
      console.error('[Popup] Error in setupEventListeners:', error);
    }
  }

  async function initialize() {
    console.log('[Popup] Initializing LinkedIn Analytics Pro v2...');
    console.log('[Popup] Document readyState:', document.readyState);

    // Initialize DOM elements first (after DOM is ready)
    initElements();
    console.log('[Popup] Elements initialized:', Object.keys(elements).length, 'elements');
    console.log('[Popup] btnFetch:', elements.btnFetch);
    console.log('[Popup] navPills:', elements.navPills?.length);

    setupEventListeners();
    console.log('[Popup] Event listeners attached');

    await loadAllData();

    console.log('[Popup] Initialization complete');
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})();

class PurrductiveBackground {
  constructor() {
    this.init();
    this.setupEventListeners();
    this.broadcastTimeout = null;
    
    // UPDATED: Reduced popup frequency and simplified thresholds
    this.popupConfig = {
      healthThreshold: 25,
      showCooldown: 10 * 60 * 1000,
      lastShownTime: 0
    };
  }

  init() {
    chrome.runtime.onInstalled.addListener(() => {
      this.setDefaultSettings();
      this.createAlarms();
    });
    
    chrome.runtime.onStartup.addListener(() => {
      this.initializeSession();
    });
  }

  async initializeSession() {
    const now = Date.now();
    await chrome.storage.local.set({
      sessionStartTime: now,
      lastActiveTime: now,
      lastActiveDomain: null
    });
  }

  async setDefaultSettings() {
    const defaultSettings = {
      catHealth: 100,
      catHappiness: 70,
      currentScreenTime: 6,
      desiredScreenTime: 4,
      // NEW: User-configurable daily screen time goal
      dailyScreenTimeGoal: 6, // hours
      mutedUntil: null,
      totalProductiveTime: 0,
      totalUnproductiveTime: 0,
      popupLastShown: 0,
      sessionStartTime: Date.now(),
      lastActiveTime: Date.now(),
      lastActiveDomain: null,
      websiteCategories: {
        productive: [
          'news.google.com', 'bbc.com', 'reuters.com', 'npr.org',
          'linkedin.com', 'indeed.com', 'glassdoor.com',
          'udemy.com', 'coursera.org', 'khanacademy.org',
          'docs.google.com', 'sheets.google.com', 'github.com',
          'stackoverflow.com', 'medium.com', 'notion.so',
          'figma.com', 'canva.com', 'trello.com', 'slack.com', 'claude.ai', 'chatgpt.com'
        ],
        unproductive: [
          'instagram.com', 'tiktok.com', 'youtube.com',
          'facebook.com', 'twitter.com', 'reddit.com',
          'twitch.tv', 'netflix.com', 'hulu.com', 'tinder.com',
          'snapchat.com', 'pinterest.com', 'x.com'
        ]
      },
      dailyStats: {},
      weeklyProgress: [],
      // NEW: Historical data storage
      historicalData: {}
    };

    await chrome.storage.local.set(defaultSettings);
  }

  setupEventListeners() {
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.handleTabChange(activeInfo.tabId);
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.handleTabChange(tabId, tab.url);
      }
    });

    chrome.windows.onFocusChanged.addListener((windowId) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) {
        this.pauseTracking();
      } else {
        this.resumeTracking();
      }
    });

    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'updateCatStatus') {
        this.updateCatStatus();
      } else if (alarm.name === 'checkThresholds') {
        this.checkPopupThresholds();
      } else if (alarm.name === 'broadcastStats') {
        this.broadcastStatsToAllTabs();
      }
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true;
    });
  }

  createAlarms() {
    chrome.alarms.create('updateCatStatus', { periodInMinutes: 3 }); // More frequent updates for faster health decay
    chrome.alarms.create('checkThresholds', { periodInMinutes: 10 });
    chrome.alarms.create('broadcastStats', { periodInMinutes: 2 });
  }

  async pauseTracking() {
    await this.updateTimeTracking(null, null, true);
  }

  async resumeTracking() {
    const now = Date.now();
    await chrome.storage.local.set({ lastActiveTime: now });
  }

  async handleTabChange(tabId, url = null) {
    if (!url) {
      try {
        const tab = await chrome.tabs.get(tabId);
        url = tab.url;
      } catch (error) {
        return;
      }
    }

    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://') || 
        url.startsWith('moz-extension://') || url.startsWith('about:') || url === 'about:blank') {
      await this.updateTimeTracking(null, null, true);
      return;
    }

    const domain = this.extractDomain(url);
    if (!domain || domain === '') {
      await this.updateTimeTracking(null, null, true);
      return;
    }

    const category = await this.categorizeWebsite(domain);
    await this.updateTimeTracking(domain, category);
    
    chrome.tabs.sendMessage(tabId, {
      type: 'SITE_CATEGORY_UPDATE',
      category: category,
      domain: domain
    }).catch(() => {});
    
    clearTimeout(this.broadcastTimeout);
    this.broadcastTimeout = setTimeout(() => {
      this.broadcastStatsToAllTabs();
    }, 1000);
  }

  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return '';
    }
  }

  async categorizeWebsite(domain) {
    const data = await chrome.storage.local.get(['websiteCategories']);
    const categories = data.websiteCategories || { productive: [], unproductive: [] };
    
    console.log('Categorizing domain:', domain);
    console.log('Categories:', categories);
    
    // Check productive sites
    for (const site of categories.productive) {
      if (domain.includes(site)) {
        console.log(`Domain ${domain} categorized as PRODUCTIVE (matched: ${site})`);
        return 'productive';
      }
    }
    
    // Check unproductive sites  
    for (const site of categories.unproductive) {
      if (domain.includes(site)) {
        console.log(`Domain ${domain} categorized as UNPRODUCTIVE (matched: ${site})`);
        return 'unproductive';
      }
    }
    
    console.log(`Domain ${domain} categorized as NEUTRAL (no match found)`);
    return 'neutral';
  }

  async updateTimeTracking(domain, category, isPausing = false) {
    const now = Date.now();
    const today = new Date().toDateString();
    
    console.log('updateTimeTracking called:', { domain, category, isPausing, today });
    
    const data = await chrome.storage.local.get([
      'dailyStats', 'lastActiveTime', 'lastActiveDomain', 'totalProductiveTime', 'totalUnproductiveTime',
      'sessionStartTime', 'historicalData'
    ]);
    
    console.log('Current tracking data:', {
      lastActiveDomain: data.lastActiveDomain,
      lastActiveTime: data.lastActiveTime ? new Date(data.lastActiveTime).toLocaleTimeString() : 'null',
      dailyStats: data.dailyStats[today]
    });
    
    // Initialize daily stats if needed
    if (!data.dailyStats[today]) {
      data.dailyStats[today] = {
        productive: 0,
        unproductive: 0,
        neutral: 0,
        websites: {},
        sessions: []
      };
      console.log('Initialized daily stats for:', today);
    }

    // NEW: Initialize historical data
    if (!data.historicalData[today]) {
      data.historicalData[today] = {
        date: today,
        productive: 0,
        unproductive: 0,
        neutral: 0,
        totalTime: 0,
        websites: {},
        healthScore: data.catHealth || 100
      };
    }

    // Calculate time spent on previous site
    if (data.lastActiveTime && data.lastActiveDomain && data.lastActiveDomain !== '') {
      const timeSpent = Math.min(now - data.lastActiveTime, 10 * 60 * 1000);
      
      console.log('Time calculation:', {
        timeSpent: timeSpent,
        timeSpentFormatted: Math.round(timeSpent/1000) + 's',
        previousDomain: data.lastActiveDomain
      });
      
      // Only count if time spent is reasonable (more than 5 seconds, less than 10 minutes)
      if (timeSpent > 5000 && timeSpent <= 10 * 60 * 1000) {
        const prevCategory = await this.categorizeWebsite(data.lastActiveDomain);
        
        console.log('Recording time:', {
          domain: data.lastActiveDomain,
          category: prevCategory,
          timeSpent: Math.round(timeSpent/1000) + 's'
        });
        
        // Update daily stats
        if (prevCategory === 'productive') {
          data.dailyStats[today].productive += timeSpent;
          data.totalProductiveTime = (data.totalProductiveTime || 0) + timeSpent;
          data.historicalData[today].productive += timeSpent;
          console.log('Added to PRODUCTIVE:', Math.round(timeSpent/1000) + 's');
        } else if (prevCategory === 'unproductive') {
          data.dailyStats[today].unproductive += timeSpent;
          data.totalUnproductiveTime = (data.totalUnproductiveTime || 0) + timeSpent;
          data.historicalData[today].unproductive += timeSpent;
          console.log('Added to UNPRODUCTIVE:', Math.round(timeSpent/1000) + 's');
        } else {
          data.dailyStats[today].neutral += timeSpent;
          data.historicalData[today].neutral += timeSpent;
          console.log('Added to NEUTRAL:', Math.round(timeSpent/1000) + 's');
        }
        
        // Update historical data
        data.historicalData[today].totalTime = data.historicalData[today].productive + 
                                                data.historicalData[today].unproductive + 
                                                data.historicalData[today].neutral;
        
        if (!data.dailyStats[today].websites[data.lastActiveDomain]) {
          data.dailyStats[today].websites[data.lastActiveDomain] = {
            time: 0,
            category: prevCategory,
            sessions: 0
          };
        }
        data.dailyStats[today].websites[data.lastActiveDomain].time += timeSpent;
        data.dailyStats[today].websites[data.lastActiveDomain].sessions += 1;
        data.dailyStats[today].websites[data.lastActiveDomain].category = prevCategory;
        
        // Update historical websites data
        if (!data.historicalData[today].websites[data.lastActiveDomain]) {
          data.historicalData[today].websites[data.lastActiveDomain] = {
            time: 0,
            category: prevCategory
          };
        }
        data.historicalData[today].websites[data.lastActiveDomain].time += timeSpent;
        data.historicalData[today].websites[data.lastActiveDomain].category = prevCategory;
        
        data.dailyStats[today].sessions.push({
          domain: data.lastActiveDomain,
          category: prevCategory,
          startTime: data.lastActiveTime,
          endTime: now,
          duration: timeSpent
        });
        
        console.log('Updated totals:', {
          totalProductive: Math.round((data.dailyStats[today].productive)/1000) + 's',
          totalUnproductive: Math.round((data.dailyStats[today].unproductive)/1000) + 's'
        });
      } else {
        console.log('Time spent too short or too long, not recording:', Math.round(timeSpent/1000) + 's');
      }
    }

    if (!isPausing && domain && domain !== '') {
      data.lastActiveTime = now;
      data.lastActiveDomain = domain;
      console.log('Now tracking:', domain);
    } else if (isPausing) {
      data.lastActiveTime = null;
      data.lastActiveDomain = null;
      console.log('Paused tracking');
    }
    
    await chrome.storage.local.set(data);
  }

  // UPDATED: Faster and more aggressive health decay based on user's screen time goal
  async updateCatStatus() {
    const data = await chrome.storage.local.get([
      'catHealth', 'catHappiness', 'totalProductiveTime', 'totalUnproductiveTime',
      'currentScreenTime', 'desiredScreenTime', 'dailyStats', 'dailyScreenTimeGoal'
    ]);

    const today = new Date().toDateString();
    const todayStats = data.dailyStats[today] || { productive: 0, unproductive: 0 };
    
    const totalTime = todayStats.productive + todayStats.unproductive;
    const productiveRatio = totalTime > 0 ? todayStats.productive / totalTime : 0.5;
    
    // Get user's daily screen time goal (default to 6 hours if not set)
    const screenTimeGoal = data.dailyScreenTimeGoal || 6;
    const totalHours = totalTime / (1000 * 60 * 60);
    
    // UPDATED: More aggressive health changes
    let healthDelta = 0;
    let happinessDelta = 0;
    
    // Base health changes based on productivity ratio (faster decay)
    if (productiveRatio >= 0.8) {
      healthDelta += 3; // Increased from 1
      happinessDelta += 3;
    } else if (productiveRatio >= 0.6) {
      healthDelta += 1;
      happinessDelta += 2;
    } else if (productiveRatio >= 0.4) {
      healthDelta -= 2; // Increased penalty
      happinessDelta -= 1;
    } else {
      healthDelta -= 4; // Much faster decay for poor productivity
      happinessDelta -= 3;
    }
    
    // Screen time penalties (scaled by user's goal)
    const screenTimeRatio = totalHours / screenTimeGoal;
    if (screenTimeRatio > 1.5) {
      healthDelta -= 6; // Severe penalty for excessive screen time
      happinessDelta -= 4;
    } else if (screenTimeRatio > 1.2) {
      healthDelta -= 4; // Moderate penalty
      happinessDelta -= 3;
    } else if (screenTimeRatio > 1.0) {
      healthDelta -= 2; // Light penalty
      happinessDelta -= 1;
    }
    
    // Additional penalty for too much unproductive time
    const unproductiveHours = todayStats.unproductive / (1000 * 60 * 60);
    if (unproductiveHours > 2) {
      healthDelta -= Math.floor(unproductiveHours); // -1 health per hour of unproductive time over 2 hours
    }
    
    console.log('Health update:', {
      productiveRatio: Math.round(productiveRatio * 100) + '%',
      totalHours: Math.round(totalHours * 100) / 100,
      screenTimeGoal,
      screenTimeRatio: Math.round(screenTimeRatio * 100) / 100,
      healthDelta,
      happinessDelta
    });

    const newHealth = Math.max(0, Math.min(100, (data.catHealth || 100) + healthDelta));
    const newHappiness = Math.max(0, Math.min(100, (data.catHappiness || 70) + happinessDelta));

    // Update historical data with current health
    const historicalUpdate = {};
    historicalUpdate[`historicalData.${today}.healthScore`] = newHealth;

    await chrome.storage.local.set({
      catHealth: newHealth,
      catHappiness: newHappiness,
      ...historicalUpdate
    });

    await this.checkPopupThresholds();
    await this.broadcastStatsToAllTabs();
  }

  async broadcastStatsToAllTabs() {
    try {
      const stats = await this.getAllStats();
      const tabs = await chrome.tabs.query({});
      
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'STATS_UPDATE',
          stats: stats
        }).catch(() => {});
      }
    } catch (error) {
      console.log('Error broadcasting stats:', error);
    }
  }

  async getAllStats() {
    const data = await chrome.storage.local.get([
      'catHealth', 'catHappiness', 'dailyStats', 'totalProductiveTime', 
      'totalUnproductiveTime', 'currentScreenTime', 'desiredScreenTime', 'dailyScreenTimeGoal'
    ]);

    const today = new Date().toDateString();
    const todayStats = data.dailyStats[today] || { 
      productive: 0, 
      unproductive: 0, 
      neutral: 0, 
      websites: {} 
    };

    const totalTime = todayStats.productive + todayStats.unproductive;
    const productivityScore = totalTime > 0 ? 
      Math.round((todayStats.productive / totalTime) * 100) : 100;

    const websites = Object.entries(todayStats.websites || {})
      .map(([domain, info]) => ({
        domain,
        time: info.time,
        category: info.category,
        sessions: info.sessions
      }))
      .sort((a, b) => b.time - a.time)
      .slice(0, 10);

    const formatTime = (ms) => {
      const hours = Math.floor(ms / (1000 * 60 * 60));
      const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      }
      return `${minutes}m`;
    };

    return {
      catHealth: Math.round(data.catHealth || 100),
      catHappiness: Math.round(data.catHappiness || 70),
      productivityScore,
      productiveTime: formatTime(todayStats.productive),
      unproductiveTime: formatTime(todayStats.unproductive),
      totalTime: formatTime(totalTime),
      productiveTimeRaw: todayStats.productive,
      unproductiveTimeRaw: todayStats.unproductive,
      totalTimeRaw: totalTime,
      websites,
      currentScreenTime: data.currentScreenTime || 6,
      desiredScreenTime: data.desiredScreenTime || 4,
      dailyScreenTimeGoal: data.dailyScreenTimeGoal || 6, // NEW
      timestamp: Date.now()
    };
  }

  async checkPopupThresholds() {
    const data = await chrome.storage.local.get([
      'catHealth', 'popupLastShown', 'mutedUntil'
    ]);

    if (data.mutedUntil && Date.now() < data.mutedUntil) {
      return;
    }

    const now = Date.now();
    if (data.popupLastShown && (now - data.popupLastShown) < this.popupConfig.showCooldown) {
      return;
    }

    const shouldShowPopup = data.catHealth < this.popupConfig.healthThreshold;

    if (shouldShowPopup) {
      await this.triggerPopupOnActiveTab();
      await chrome.storage.local.set({ popupLastShown: now });
    }
  }

  async triggerPopupOnActiveTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SHOW_THRESHOLD_POPUP'
        }).catch(() => {
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: ['content-script.js']
          }).then(() => {
            setTimeout(() => {
              chrome.tabs.sendMessage(tabs[0].id, {
                type: 'SHOW_THRESHOLD_POPUP'
              }).catch(() => {});
            }, 100);
          }).catch(() => {});
        });
      }
    } catch (error) {
      console.log('Could not trigger popup:', error);
    }
  }

  async checkUnproductiveTime() {
    await this.checkPopupThresholds();
  }

  async handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'GET_CAT_STATUS':
        const catData = await chrome.storage.local.get(['catHealth', 'catHappiness']);
        sendResponse(catData);
        break;
        
      case 'GET_ALL_STATS':
        const allStats = await this.getAllStats();
        sendResponse(allStats);
        break;

      // NEW: Get historical data
      case 'GET_HISTORICAL_DATA':
        const historicalData = await chrome.storage.local.get(['historicalData', 'dailyStats']);
        sendResponse({
          historicalData: historicalData.historicalData || {},
          dailyStats: historicalData.dailyStats || {}
        });
        break;

      // NEW: Get settings
      case 'GET_SETTINGS':
        const settings = await chrome.storage.local.get([
          'dailyScreenTimeGoal', 'websiteCategories', 'desiredScreenTime'
        ]);
        sendResponse(settings);
        break;

      // NEW: Update website categories
      case 'UPDATE_WEBSITE_CATEGORIES':
        await chrome.storage.local.set({ 
          websiteCategories: message.categories 
        });
        sendResponse({ success: true });
        break;
        
      case 'MUTE_NOTIFICATIONS':
        const muteUntil = Date.now() + (24 * 60 * 60 * 1000);
        await chrome.storage.local.set({ mutedUntil: muteUntil });
        sendResponse({ success: true });
        break;
        
      case 'GET_DAILY_STATS':
        const statsData = await chrome.storage.local.get(['dailyStats', 'weeklyProgress']);
        sendResponse(statsData);
        break;
        
      case 'UPDATE_SETTINGS':
        await chrome.storage.local.set(message.settings);
        sendResponse({ success: true });
        break;

      case 'UPDATE_POPUP_THRESHOLDS':
        this.popupConfig = { ...this.popupConfig, ...message.thresholds };
        sendResponse({ success: true });
        break;

      case 'POPUP_DISMISSED':
        await chrome.storage.local.set({ popupLastShown: Date.now() });
        sendResponse({ success: true });
        break;

      case 'FORCE_CHECK_THRESHOLDS':
        await this.checkPopupThresholds();
        sendResponse({ success: true });
        break;
        
      case 'REQUEST_STATS_BROADCAST':
        await this.broadcastStatsToAllTabs();
        sendResponse({ success: true });
        break;
    }
  }

  updatePopupConfig(newConfig) {
    this.popupConfig = { ...this.popupConfig, ...newConfig };
  }
}

// Initialize the background script
new PurrductiveBackground();
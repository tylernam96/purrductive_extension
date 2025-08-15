class PurrductiveBackground {
  constructor() {
    this.init();
    this.setupEventListeners();
    this.broadcastTimeout = null;
    
    // FIXED: Reduced popup frequency and simplified thresholds
    this.popupConfig = {
      healthThreshold: 25, // Lower threshold so it triggers less often
      showCooldown: 10 * 60 * 1000, // Increased to 10 minutes cooldown
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
      catHealth: 100, // FIXED: Start at 100 instead of 80
      catHappiness: 70,
      currentScreenTime: 6,
      desiredScreenTime: 4,
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
          'snapchat.com', 'pinterest.com'
        ]
      },
      dailyStats: {},
      weeklyProgress: []
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
    // FIXED: Increased intervals to reduce popup frequency
    chrome.alarms.create('updateCatStatus', { periodInMinutes: 5 }); // Was 3
    chrome.alarms.create('checkThresholds', { periodInMinutes: 15 }); // Was 5
    chrome.alarms.create('broadcastStats', { periodInMinutes: 2 }); // Was 1
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
      'sessionStartTime'
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
        
        // FIXED: Proper aggregation of productive/unproductive time
        if (prevCategory === 'productive') {
          data.dailyStats[today].productive += timeSpent;
          data.totalProductiveTime = (data.totalProductiveTime || 0) + timeSpent;
          console.log('Added to PRODUCTIVE:', Math.round(timeSpent/1000) + 's');
        } else if (prevCategory === 'unproductive') {
          data.dailyStats[today].unproductive += timeSpent;
          data.totalUnproductiveTime = (data.totalUnproductiveTime || 0) + timeSpent;
          console.log('Added to UNPRODUCTIVE:', Math.round(timeSpent/1000) + 's');
        } else {
          data.dailyStats[today].neutral += timeSpent;
          console.log('Added to NEUTRAL:', Math.round(timeSpent/1000) + 's');
        }
        
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

  async updateCatStatus() {
    const data = await chrome.storage.local.get([
      'catHealth', 'catHappiness', 'totalProductiveTime', 'totalUnproductiveTime',
      'currentScreenTime', 'desiredScreenTime', 'dailyStats'
    ]);

    const today = new Date().toDateString();
    const todayStats = data.dailyStats[today] || { productive: 0, unproductive: 0 };
    
    const totalTime = todayStats.productive + todayStats.unproductive;
    const productiveRatio = totalTime > 0 ? todayStats.productive / totalTime : 0.5;
    
    // FIXED: More gradual health changes
    let healthDelta = (productiveRatio - 0.5) * 3; // Reduced from 5
    let happinessDelta = (productiveRatio >= 0.6 ? 2 : -1); // Reduced penalties
    
    if (productiveRatio >= 0.7) {
      healthDelta += 1; // Reduced bonus
      happinessDelta += 1;
    }
    
    const totalHours = totalTime / (1000 * 60 * 60);
    if (totalHours > data.currentScreenTime) {
      healthDelta -= 2; // Reduced penalty
      happinessDelta -= 2;
    }

    const newHealth = Math.max(0, Math.min(100, (data.catHealth || 80) + healthDelta));
    const newHappiness = Math.max(0, Math.min(100, (data.catHappiness || 70) + happinessDelta));

    await chrome.storage.local.set({
      catHealth: newHealth,
      catHappiness: newHappiness
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

  // FIXED: All percentages are now whole numbers
  async getAllStats() {
    const data = await chrome.storage.local.get([
      'catHealth', 'catHappiness', 'dailyStats', 'totalProductiveTime', 
      'totalUnproductiveTime', 'currentScreenTime', 'desiredScreenTime'
    ]);

    const today = new Date().toDateString();
    const todayStats = data.dailyStats[today] || { 
      productive: 0, 
      unproductive: 0, 
      neutral: 0, 
      websites: {} 
    };

    // FIXED: Proper productivity calculation with whole numbers
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
      catHealth: Math.round(data.catHealth || 100), // FIXED: Default to 100
      catHappiness: Math.round(data.catHappiness || 70),
      productivityScore, // Already rounded above
      productiveTime: formatTime(todayStats.productive),
      unproductiveTime: formatTime(todayStats.unproductive),
      totalTime: formatTime(totalTime),
      productiveTimeRaw: todayStats.productive,
      unproductiveTimeRaw: todayStats.unproductive,
      totalTimeRaw: totalTime,
      websites,
      currentScreenTime: data.currentScreenTime || 6,
      desiredScreenTime: data.desiredScreenTime || 4,
      timestamp: Date.now()
    };
  }

  // FIXED: Simplified popup threshold logic - only health matters
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

    // FIXED: Only trigger on low health to reduce frequency
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
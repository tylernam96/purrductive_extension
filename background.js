class PurrductiveBackground {
  constructor() {
    this.init();
    this.setupEventListeners();
    // Popup configuration with thresholds
    this.popupConfig = {
      healthThreshold: 30,
      happinessThreshold: 30,
      unproductiveTimeThreshold: 2 * 60 * 60 * 1000, // 2 hours in milliseconds
      productivityScoreThreshold: 40,
      showCooldown: 5 * 60 * 1000, // Don't show again for 5 minutes
      lastShownTime: 0
    };
  }

  init() {
    // Initialize default settings
    chrome.runtime.onInstalled.addListener(() => {
      this.setDefaultSettings();
      this.createAlarms();
    });
  }

  async setDefaultSettings() {
    const defaultSettings = {
      catHealth: 80,
      catHappiness: 70,
      currentScreenTime: 6, // hours
      desiredScreenTime: 4, // hours
      mutedUntil: null,
      totalProductiveTime: 0,
      totalUnproductiveTime: 0,
      popupLastShown: 0, // Track when popup was last shown
      websiteCategories: {
        productive: [
          'news.google.com', 'bbc.com', 'reuters.com', 'npr.org',
          'linkedin.com', 'indeed.com', 'glassdoor.com',
          'udemy.com', 'coursera.org', 'khanacademy.org',
          'docs.google.com', 'sheets.google.com', 'github.com',
          'stackoverflow.com', 'medium.com'
        ],
        unproductive: [
          'instagram.com', 'tiktok.com', 'youtube.com',
          'facebook.com', 'twitter.com', 'reddit.com',
          'twitch.tv', 'netflix.com', 'hulu.com'
        ]
      },
      dailyStats: {},
      weeklyProgress: []
    };

    await chrome.storage.local.set(defaultSettings);
  }

  setupEventListeners() {
    // Track tab changes
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.handleTabChange(activeInfo.tabId);
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.handleTabChange(tabId, tab.url);
      }
    });

    // Handle alarms
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'updateCatStatus') {
        this.updateCatStatus();
      } else if (alarm.name === 'checkThresholds') {
        this.checkPopupThresholds();
      }
    });

    // Handle messages from content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async response
    });
  }

  createAlarms() {
    // Update cat status every 5 minutes
    chrome.alarms.create('updateCatStatus', { periodInMinutes: 5 });
    
    // Check popup thresholds every 2 minutes
    chrome.alarms.create('checkThresholds', { periodInMinutes: 2 });
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

    const domain = this.extractDomain(url);
    const category = await this.categorizeWebsite(domain);
    
    // Update time tracking
    await this.updateTimeTracking(domain, category);
    
    // Send message to content script
    chrome.tabs.sendMessage(tabId, {
      type: 'SITE_CATEGORY_UPDATE',
      category: category,
      domain: domain
    }).catch(() => {}); // Ignore errors if content script not loaded
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
    const categories = data.websiteCategories;
    
    if (categories.productive.some(site => domain.includes(site))) {
      return 'productive';
    } else if (categories.unproductive.some(site => domain.includes(site))) {
      return 'unproductive';
    }
    return 'neutral';
  }

  async updateTimeTracking(domain, category) {
    const now = Date.now();
    const today = new Date().toDateString();
    
    const data = await chrome.storage.local.get([
      'dailyStats', 'lastActiveTime', 'lastActiveDomain', 'totalProductiveTime', 'totalUnproductiveTime'
    ]);
    
    // Initialize daily stats if needed
    if (!data.dailyStats[today]) {
      data.dailyStats[today] = {
        productive: 0,
        unproductive: 0,
        websites: {}
      };
    }

    // Calculate time spent on previous site
    if (data.lastActiveTime && data.lastActiveDomain) {
      const timeSpent = Math.min(now - data.lastActiveTime, 30 * 60 * 1000); // Cap at 30 minutes
      const prevCategory = await this.categorizeWebsite(data.lastActiveDomain);
      
      // Update daily stats
      if (prevCategory === 'productive') {
        data.dailyStats[today].productive += timeSpent;
        data.totalProductiveTime = (data.totalProductiveTime || 0) + timeSpent;
      } else if (prevCategory === 'unproductive') {
        data.dailyStats[today].unproductive += timeSpent;
        data.totalUnproductiveTime = (data.totalUnproductiveTime || 0) + timeSpent;
      }
      
      // Update website-specific stats
      if (!data.dailyStats[today].websites[data.lastActiveDomain]) {
        data.dailyStats[today].websites[data.lastActiveDomain] = 0;
      }
      data.dailyStats[today].websites[data.lastActiveDomain] += timeSpent;
    }

    // Update current tracking
    data.lastActiveTime = now;
    data.lastActiveDomain = domain;
    
    await chrome.storage.local.set(data);
  }

  async updateCatStatus() {
    const data = await chrome.storage.local.get([
      'catHealth', 'catHappiness', 'totalProductiveTime', 'totalUnproductiveTime',
      'currentScreenTime', 'desiredScreenTime'
    ]);

    const totalTime = (data.totalProductiveTime || 0) + (data.totalUnproductiveTime || 0);
    const productiveRatio = totalTime > 0 ? (data.totalProductiveTime || 0) / totalTime : 0.5;
    
    // Calculate new cat status based on productivity ratio and screen time goals
    const targetRatio = data.desiredScreenTime / data.currentScreenTime;
    const healthDelta = (productiveRatio - 0.5) * 10;
    const happinessDelta = (productiveRatio >= targetRatio ? 5 : -3);

    const newHealth = Math.max(0, Math.min(100, data.catHealth + healthDelta));
    const newHappiness = Math.max(0, Math.min(100, data.catHappiness + happinessDelta));

    await chrome.storage.local.set({
      catHealth: newHealth,
      catHappiness: newHappiness
    });

    // Check if we need to show popup after status update
    await this.checkPopupThresholds();
  }

  // NEW METHOD: Check if popup should be shown based on thresholds
  async checkPopupThresholds() {
    const data = await chrome.storage.local.get([
      'catHealth', 'catHappiness', 'dailyStats', 'popupLastShown', 'mutedUntil'
    ]);

    // Don't show if notifications are muted
    if (data.mutedUntil && Date.now() < data.mutedUntil) {
      return;
    }

    // Don't show if popup was shown recently (cooldown period)
    const now = Date.now();
    if (data.popupLastShown && (now - data.popupLastShown) < this.popupConfig.showCooldown) {
      return;
    }

    const today = new Date().toDateString();
    const todayStats = data.dailyStats[today] || { productive: 0, unproductive: 0 };
    
    // Calculate productivity score
    const totalTime = todayStats.productive + todayStats.unproductive;
    const productivityScore = totalTime > 0 ? 
      Math.round((todayStats.productive / totalTime) * 100) : 100;

    // Check thresholds
    const shouldShowPopup = (
      data.catHealth < this.popupConfig.healthThreshold ||
      data.catHappiness < this.popupConfig.happinessThreshold ||
      todayStats.unproductive > this.popupConfig.unproductiveTimeThreshold ||
      productivityScore < this.popupConfig.productivityScoreThreshold
    );

    if (shouldShowPopup) {
      await this.triggerPopupOnActiveTab();
      // Update last shown time
      await chrome.storage.local.set({ popupLastShown: now });
    }
  }

  // NEW METHOD: Show popup on the active tab
  async triggerPopupOnActiveTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        // Send message to content script to show popup
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SHOW_THRESHOLD_POPUP'
        }).catch(() => {
          // If content script not loaded, inject it first
          chrome.scripting.executeScript({
            target: { tabId: tabs[0].id },
            files: ['content-script.js']
          }).then(() => {
            // Try sending message again after injection
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

  // UPDATED METHOD: Remove old unproductive time checking
  async checkUnproductiveTime() {
    // This method is now replaced by checkPopupThresholds
    // Keep for backward compatibility but make it call the new method
    await this.checkPopupThresholds();
  }

  async handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'GET_CAT_STATUS':
        const catData = await chrome.storage.local.get(['catHealth', 'catHappiness']);
        sendResponse(catData);
        break;
        
      case 'MUTE_NOTIFICATIONS':
        const muteUntil = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
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

      // NEW: Handle popup threshold updates
      case 'UPDATE_POPUP_THRESHOLDS':
        this.popupConfig = { ...this.popupConfig, ...message.thresholds };
        sendResponse({ success: true });
        break;

      // NEW: Handle popup dismissal
      case 'POPUP_DISMISSED':
        await chrome.storage.local.set({ popupLastShown: Date.now() });
        sendResponse({ success: true });
        break;

      // NEW: Force check thresholds (for testing)
      case 'FORCE_CHECK_THRESHOLDS':
        await this.checkPopupThresholds();
        sendResponse({ success: true });
        break;
    }
  }

  // NEW METHOD: Update popup configuration
  updatePopupConfig(newConfig) {
    this.popupConfig = { ...this.popupConfig, ...newConfig };
  }
}

// Initialize the background script
new PurrductiveBackground();
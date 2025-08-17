class PurrductiveBackground {
  constructor() {
    this.init();
    this.setupEventListeners();
    this.broadcastTimeout = null;
    this.lastMidnightCheck = null;
    
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
      this.checkMidnightReset(); // Check if we need to reset for new day
    });
  }

  // FIXED: Check for midnight reset and preserve historical data
  async checkMidnightReset() {
    const now = new Date();
    const today = now.toDateString();
    const currentHour = now.getHours();
    
    const data = await chrome.storage.local.get([
      'dailyStats', 'lastResetDate', 'weeklyProgress', 'historicalData'
    ]);
    
    console.log('Checking midnight reset:', {
      today,
      lastResetDate: data.lastResetDate,
      currentHour
    });
    
    // If it's a new day, archive yesterday's data and reset
    if (data.lastResetDate !== today) {
      console.log('New day detected - archiving data and resetting');
      
      // Get yesterday's date
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = yesterday.toDateString();
      
      // Archive yesterday's data if it exists
      if (data.dailyStats && data.dailyStats[yesterdayKey]) {
        const historicalData = data.historicalData || {};
        historicalData[yesterdayKey] = {
          ...data.dailyStats[yesterdayKey],
          date: yesterdayKey,
          timestamp: yesterday.getTime()
        };
        
        // Keep only last 30 days of historical data
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        Object.keys(historicalData).forEach(dateKey => {
          const dataDate = new Date(dateKey);
          if (dataDate < thirtyDaysAgo) {
            delete historicalData[dateKey];
          }
        });
        
        await chrome.storage.local.set({ historicalData });
        console.log('Archived yesterday\'s data:', historicalData[yesterdayKey]);
      }
      
      // Reset daily stats but keep other data
      const newDailyStats = {};
      newDailyStats[today] = {
        productive: 0,
        unproductive: 0,
        neutral: 0,
        websites: {},
        sessions: []
      };
      
      await chrome.storage.local.set({
        dailyStats: newDailyStats,
        lastResetDate: today,
        catHealth: 100, // Reset health for new day
        catHappiness: 70,
        sessionStartTime: Date.now(),
        lastActiveTime: Date.now(),
        lastActiveDomain: null
      });
      
      console.log('Reset complete for new day:', today);
    }
    
    // Schedule next midnight check
    this.scheduleMidnightCheck();
  }

  // FIXED: Schedule automatic midnight reset
  scheduleMidnightCheck() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 1, 0, 0); // 12:01 AM tomorrow
    
    const timeUntilMidnight = tomorrow.getTime() - now.getTime();
    
    console.log('Scheduling midnight check in', Math.round(timeUntilMidnight / (1000 * 60 * 60)), 'hours');
    
    setTimeout(() => {
      this.checkMidnightReset();
    }, timeUntilMidnight);
  }

  async initializeSession() {
    const now = Date.now();
    const today = new Date().toDateString();
    
    // FIXED: Initialize today's stats if they don't exist, but preserve existing data
    const data = await chrome.storage.local.get(['dailyStats', 'lastResetDate', 'catHealth']);
    
    if (!data.dailyStats) {
      data.dailyStats = {};
    }
    
    if (!data.dailyStats[today]) {
      data.dailyStats[today] = {
        productive: 0,
        unproductive: 0,
        neutral: 0,
        websites: {},
        sessions: []
      };
    }
    
    // FIXED: Check if we're starting a new day - if so, reset health to 100
    let healthToSet = data.catHealth || 100;
    if (data.lastResetDate !== today) {
      console.log('New day detected during session init - resetting health to 100');
      healthToSet = 100;
    }
    
    await chrome.storage.local.set({
      sessionStartTime: now,
      lastActiveTime: now,
      lastActiveDomain: null,
      dailyStats: data.dailyStats,
      lastResetDate: today,
      catHealth: healthToSet
    });
    
    console.log('Session initialized for', today, 'with health:', healthToSet);
    
    // Check for midnight reset
    await this.checkMidnightReset();
  }

  async setDefaultSettings() {
    const today = new Date().toDateString();
    
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
      lastResetDate: today, // FIXED: Track when we last reset
      historicalData: {}, // FIXED: Store historical daily data
      dailyStats: {
        [today]: {
          productive: 0,
          unproductive: 0,
          neutral: 0,
          websites: {},
          sessions: []
        }
      },
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
      weeklyProgress: []
    };

    // Only set defaults for missing keys to preserve existing data
    const existingData = await chrome.storage.local.get(Object.keys(defaultSettings));
    const updates = {};
    
    Object.keys(defaultSettings).forEach(key => {
      if (existingData[key] === undefined) {
        updates[key] = defaultSettings[key];
      }
    });
    
    if (Object.keys(updates).length > 0) {
      await chrome.storage.local.set(updates);
      console.log('Set default settings:', Object.keys(updates));
    }
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
      } else if (alarm.name === 'midnightCheck') {
        this.checkMidnightReset(); // FIXED: Automatic midnight checking
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
    chrome.alarms.create('midnightCheck', { periodInMinutes: 60 }); // Check every hour for midnight
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

  // FIXED: More aggressive and responsive health calculation
// FIXED: More balanced and realistic health calculation
// FIXED: Time-based health calculation instead of percentage-based
// FIXED: Corrected health calculation with proper thresholds and debugging
async updateCatStatus() {
  const data = await chrome.storage.local.get([
    'catHealth', 'catHappiness', 'totalProductiveTime', 'totalUnproductiveTime',
    'currentScreenTime', 'desiredScreenTime', 'dailyStats'
  ]);

  const today = new Date().toDateString();
  const todayStats = data.dailyStats[today] || { productive: 0, unproductive: 0 };
  
  const productiveMinutes = todayStats.productive / (1000 * 60);
  const unproductiveMinutes = todayStats.unproductive / (1000 * 60);
  const totalMinutes = productiveMinutes + unproductiveMinutes;
  
  console.log('=== HEALTH CALCULATION DEBUG ===');
  console.log('Current data:', {
    productiveMinutes: Math.round(productiveMinutes * 10) / 10,
    unproductiveMinutes: Math.round(unproductiveMinutes * 10) / 10,
    totalMinutes: Math.round(totalMinutes * 10) / 10,
    currentHealth: data.catHealth
  });
  
  // FIXED: Don't calculate until meaningful activity (reduced to 3 minutes)
  if (totalMinutes < 3) {
    console.log('Not enough activity yet (', Math.round(totalMinutes * 10) / 10, 'min) - keeping current health');
    return;
  }
  
  // Start with perfect health
  let newHealth = 100;
  console.log('Starting with base health:', newHealth);
  
  // FIXED: Much more lenient unproductive time penalties
  let unproductivePenalty = 0;
  
  if (unproductiveMinutes <= 15) {
    // 0-15 minutes unproductive: NO penalty (everyone needs breaks and short distractions)
    unproductivePenalty = 0;
    console.log('Unproductive time ≤15min: No penalty');
  } else if (unproductiveMinutes <= 45) {
    // 16-45 minutes unproductive: very small penalty
    unproductivePenalty = (unproductiveMinutes - 15) * 0.5; // 0.5% per minute over 15
    console.log('Unproductive time 16-45min: Small penalty =', Math.round(unproductivePenalty));
  } else if (unproductiveMinutes <= 90) {
    // 46-90 minutes unproductive: moderate penalty
    unproductivePenalty = 15 + (unproductiveMinutes - 45) * 1; // Start at 15%, then 1% per minute
    console.log('Unproductive time 46-90min: Moderate penalty =', Math.round(unproductivePenalty));
  } else if (unproductiveMinutes <= 180) {
    // 91-180 minutes unproductive: heavy penalty
    unproductivePenalty = 60 + (unproductiveMinutes - 90) * 0.5; // Start at 60%, then 0.5% per minute
    console.log('Unproductive time 91-180min: Heavy penalty =', Math.round(unproductivePenalty));
  } else {
    // 180+ minutes unproductive: cat is dying
    unproductivePenalty = Math.min(95, 105 + (unproductiveMinutes - 180) * 0.1); // Cap at 95% penalty
    console.log('Unproductive time 180+min: Severe penalty =', Math.round(unproductivePenalty));
  }
  
  newHealth -= unproductivePenalty;
  console.log('Health after unproductive penalty:', newHealth);
  
  // FIXED: Productive time gives meaningful boosts
  let productiveBonus = 0;
  if (productiveMinutes >= 5) {
    // Give bonus for any productive time over 5 minutes
    productiveBonus = Math.min(productiveMinutes * 0.5, 25); // 0.5% per minute, max 25%
    console.log('Productive bonus for', Math.round(productiveMinutes), 'min:', Math.round(productiveBonus));
  }
  
  newHealth += productiveBonus;
  console.log('Health after productive bonus:', newHealth);
  
  // FIXED: Screen time penalty only for truly excessive use
  const totalHours = totalMinutes / 60;
  const screenTimeTarget = data.currentScreenTime || 6;
  let screenPenalty = 0;
  
  if (totalHours > screenTimeTarget + 1) { // Only penalize if more than 1 hour over target
    const excessHours = totalHours - (screenTimeTarget + 1);
    screenPenalty = Math.min(excessHours * 3, 10); // 3% per excess hour, max 10%
    console.log('Screen time penalty:', Math.round(screenPenalty), '% for', Math.round(excessHours * 10) / 10, 'excess hours');
  }
  
  newHealth -= screenPenalty;
  console.log('Health after screen time penalty:', newHealth);
  
  // Cap health between 0-100
  newHealth = Math.max(0, Math.min(100, Math.round(newHealth)));
  
  // FIXED: Even more gradual health changes - only move 2% per update max
  const currentHealth = data.catHealth || 100;
  const maxChangePerUpdate = 2; // Much more gradual
  const healthDifference = newHealth - currentHealth;
  
  let finalHealth;
  if (Math.abs(healthDifference) <= maxChangePerUpdate) {
    finalHealth = newHealth;
  } else {
    finalHealth = currentHealth + (healthDifference > 0 ? maxChangePerUpdate : -maxChangePerUpdate);
  }
  
  finalHealth = Math.max(0, Math.min(100, Math.round(finalHealth)));
  
  console.log('=== FINAL CALCULATION ===');
  console.log({
    calculatedHealth: newHealth,
    currentHealth: currentHealth,
    finalHealth: finalHealth,
    change: finalHealth - currentHealth,
    unproductiveMinutes: Math.round(unproductiveMinutes * 10) / 10,
    productiveMinutes: Math.round(productiveMinutes * 10) / 10,
    unproductivePenalty: Math.round(unproductivePenalty),
    productiveBonus: Math.round(productiveBonus)
  });
  console.log('===============================');
  
  // Happiness follows health but can be slightly higher
  const targetHappiness = Math.min(finalHealth + 10, 100);
  const currentHappiness = data.catHappiness || 70;
  const happinessDelta = (targetHappiness - currentHappiness) * 0.2;
  const newHappiness = Math.max(0, Math.min(100, Math.round(currentHappiness + happinessDelta)));

  await chrome.storage.local.set({
    catHealth: finalHealth,
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

  // FIXED: Method to get historical data for comparison
  async getHistoricalData(daysBack = 7) {
    const data = await chrome.storage.local.get(['historicalData', 'dailyStats']);
    const historicalData = data.historicalData || {};
    const currentStats = data.dailyStats || {};
    
    const results = [];
    const today = new Date();
    
    for (let i = 0; i < daysBack; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateKey = date.toDateString();
      
      if (i === 0 && currentStats[dateKey]) {
        // Today's data (in progress)
        results.push({
          date: dateKey,
          ...currentStats[dateKey],
          isToday: true
        });
      } else if (historicalData[dateKey]) {
        // Historical data
        results.push({
          date: dateKey,
          ...historicalData[dateKey],
          isToday: false
        });
      }
    }
    
    return results;
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

      case 'GET_HISTORICAL_DATA':
        const historicalData = await this.getHistoricalData(message.daysBack || 7);
        sendResponse(historicalData);
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

      case 'FORCE_MIDNIGHT_RESET':
        await this.checkMidnightReset();
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
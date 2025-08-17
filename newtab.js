// newtab.js - UPDATED: Proper productivity calculations and new navigation
class ProductivityDashboard {
  constructor() {
    this.init();
    this.setupEventListeners();
    this.loadInitialData();
  }

  async init() {
    console.log('Initializing ProductivityDashboard...');
    
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('Received message:', message.type, message);
      
      if (message.type === 'STATS_UPDATE') {
        this.updateDashboard(message.stats);
      }
    });
  }

  setupEventListeners() {
    document.addEventListener('DOMContentLoaded', () => {
      this.loadInitialData();
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.loadInitialData();
    });
  }

  async loadInitialData() {
    try {
      console.log('Loading initial dashboard data...');
      
      const stats = await chrome.runtime.sendMessage({ type: 'GET_ALL_STATS' });
      console.log('Received stats:', stats);
      
      if (stats) {
        this.updateDashboard(stats);
      } else {
        console.warn('No stats received from background script');
        this.showLoadingState();
      }
      
      chrome.runtime.sendMessage({ type: 'REQUEST_STATS_BROADCAST' });
    } catch (error) {
      console.error('Error loading initial data:', error);
      this.showLoadingState();
      
      setTimeout(() => {
        this.loadInitialData();
      }, 2000);
    }
  }

  updateDashboard(stats) {
    console.log('=== DASHBOARD UPDATE DEBUG ===');
    console.log('Raw stats received:', stats);
    
    this.currentStats = stats;
    
    // AGGRESSIVE FIX: Always recalculate from scratch
    let totalProductive = 0;
    let totalUnproductive = 0;
    
    console.log('\n📊 PRODUCTIVITY RECALCULATION:');
    
    if (stats.websites && stats.websites.length > 0) {
      console.log('Processing', stats.websites.length, 'websites...');
      
      stats.websites.forEach((site, index) => {
        const timeMs = parseInt(site.time) || 0;
        const category = site.category || 'unknown';
        
        console.log(`${index + 1}. ${site.domain}: ${timeMs}ms (${category})`);
        
        if (category === 'productive') {
          totalProductive += timeMs;
        } else if (category === 'unproductive' || category === 'distracting') {
          totalUnproductive += timeMs;
        } else if (category === 'neutral') {
          console.log(`   ℹ️ Neutral site detected: ${site.domain} - adding to unproductive`);
          totalUnproductive += timeMs;
        }
      });
      
      // Force override all productivity values
      stats.productiveTimeRaw = totalProductive;
      stats.unproductiveTimeRaw = totalUnproductive;
      stats.productiveTime = this.formatTime(totalProductive);
      stats.unproductiveTime = this.formatTime(totalUnproductive);
      
      console.log('\n🎯 FINAL CALCULATIONS:');
      console.log('Total Productive:', totalProductive, 'ms =', stats.productiveTime);
      console.log('Total Unproductive:', totalUnproductive, 'ms =', stats.unproductiveTime);
    } else {
      console.log('⚠️ No websites data - setting to 0');
      stats.productiveTime = '0m';
      stats.unproductiveTime = '0m';
      stats.productiveTimeRaw = 0;
      stats.unproductiveTimeRaw = 0;
    }
    
    console.log('🔄 Updating display with corrected values...');
    
    this.updateHealthBar(stats.catHealth);
    this.updateProductivityStats(stats);
    this.updateAppUsage(stats.websites);
    this.updateCatImage(stats);
    
    // Double-check the display was updated
    setTimeout(() => {
      const productiveElement = document.querySelector('.productive-time');
      const unproductiveElement = document.querySelector('.unproductive-time');
      console.log('✅ Display check - Productive shown:', productiveElement?.textContent);
      console.log('✅ Display check - Unproductive shown:', unproductiveElement?.textContent);
    }, 100);
    
    this.setupSearchFunctionality();
    console.log('================================\n');
  }

  formatTime(ms) {
    if (!ms || ms === 0) return '0m';
    
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  setupSearchFunctionality() {
    const searchInput = document.getElementById('searchInput');
    
    if (!searchInput) {
      console.error('Search input element not found!');
      return;
    }
    
    // Remove any existing event listeners
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);
    
    const handleSearch = (query) => {
      if (query.trim() === '') {
        return;
      }
      
      const trimmedQuery = query.trim();
      
      const isUrl = (str) => {
        const urlPatterns = [
          /^https?:\/\//i,
          /^[a-z0-9.-]+\.[a-z]{2,}$/i,
          /^www\.[a-z0-9.-]+\.[a-z]{2,}$/i,
          /^[a-z0-9.-]+\.(com|org|net|edu|gov|io|co|uk|de|fr|jp|cn|au|ca)$/i
        ];
        
        return urlPatterns.some(pattern => pattern.test(str));
      };
      
      if (isUrl(trimmedQuery)) {
        let url = trimmedQuery;
        
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        
        console.log('Navigating directly to:', url);
        window.location.href = url;
      } else {
        const encodedQuery = encodeURIComponent(trimmedQuery);
        const googleSearchUrl = `https://www.google.com/search?q=${encodedQuery}`;
        
        console.log('Searching Google for:', trimmedQuery);
        window.location.href = googleSearchUrl;
      }
    };
    
    newSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const query = e.target.value;
        console.log('Searching Google for:', query);
        handleSearch(query);
      }
    });
    
    const form = newSearchInput.closest('form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = newSearchInput.value;
        console.log('Form submitted - searching Google for:', query);
        handleSearch(query);
      });
    }
    
    console.log('Google search functionality setup complete!');
  }

  updateHealthBar(health) {
    const healthPercentage = document.querySelector('.health-percentage');
    const healthFill = document.querySelector('.health-fill');
    
    if (healthPercentage) healthPercentage.textContent = `${health}%`;
    if (healthFill) {
      healthFill.style.width = `${health}%`;
      
      healthFill.className = 'h-full transition-all duration-700 ease-out';
      
      if (health < 30) {
        healthFill.style.background = 'linear-gradient(to right, #ef4444, #f87171)';
        healthFill.style.borderRadius = 'inherit';
      } else if (health < 60) {
        healthFill.style.background = 'linear-gradient(to right, #eab308, #facc15)';
        healthFill.style.borderRadius = 'inherit';
      } else {
        healthFill.style.background = 'linear-gradient(to right, #10b981, #059669)';
        healthFill.style.borderRadius = 'inherit';
      }
    }
  }

  updateProductivityStats(stats) {
    const productiveTime = document.querySelector('.productive-time');
    const unproductiveTime = document.querySelector('.unproductive-time');
    const productiveChange = document.querySelector('.productive-change');
    const unproductiveChange = document.querySelector('.unproductive-change');
    
    if (productiveTime) productiveTime.textContent = stats.productiveTime;
    if (unproductiveTime) unproductiveTime.textContent = stats.unproductiveTime;
    
    // Hide change indicators to reduce clutter
    if (productiveChange) {
      productiveChange.textContent = '';
      productiveChange.className = 'mt-2 text-xs text-transparent';
    }
    if (unproductiveChange) {
      unproductiveChange.textContent = '';
      unproductiveChange.className = 'mt-2 text-xs text-transparent';
    }
  }

  updateAppUsage(websites) {
    const appUsageContainer = document.querySelector('.app-usage-container');
    if (!appUsageContainer) return;

    appUsageContainer.innerHTML = '';

    if (!websites || websites.length === 0) {
      const noDataElement = document.createElement('div');
      noDataElement.className = `bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4 
                                hover:bg-slate-700/30 transition-all duration-300 flex justify-between items-center group`;
      noDataElement.innerHTML = `
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
            <span class="text-blue-400 text-sm">📊</span>
          </div>
          <span class="text-slate-200 font-medium">Start browsing to see data</span>
        </div>
        <div class="text-right">
          <span class="text-blue-400 font-bold text-lg">--</span>
          <div class="text-xs text-blue-400/70">No data yet</div>
        </div>
      `;
      appUsageContainer.appendChild(noDataElement);
      return;
    }

    websites.slice(0, 8).forEach(website => {
      const appElement = this.createAppUsageElement(website);
      appUsageContainer.appendChild(appElement);
    });

    this.currentWebsites = websites;
  }

  createAppUsageElement(website) {
    const formatTime = (ms) => {
      const hours = Math.floor(ms / (1000 * 60 * 60));
      const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      }
      return `${minutes}m`;
    };

    const getAppIcon = (domain) => {
      const iconMap = {
        'youtube.com': '📺',
        'instagram.com': '📷',
        'facebook.com': '📘',
        'twitter.com': '🐦',
        'reddit.com': '🤖',
        'tiktok.com': '🎵',
        'netflix.com': '🎬',
        'twitch.tv': '🎮',
        'github.com': '👨‍💻',
        'stackoverflow.com': '💻',
        'docs.google.com': '📄',
        'notion.so': '📝',
        'figma.com': '🎨',
        'linkedin.com': '💼',
        'medium.com': '📖',
        'news.google.com': '📰',
        'claude.ai': '🤖',
        'chatgpt.com': '🤖',
        'default': '🌐'
      };
      
      for (const [key, icon] of Object.entries(iconMap)) {
        if (domain.includes(key)) return icon;
      }
      return iconMap.default;
    };

    const formatDomain = (domain) => {
      return domain.replace(/^www\./, '').split('.')[0];
    };

    const isProductive = website.category === 'productive';
    const bgColorClass = isProductive ? 'bg-green-500/20' : 'bg-red-500/20';
    const textColorClass = isProductive ? 'text-green-400' : 'text-red-400';
    const timeColorClass = isProductive ? 'text-green-400' : 'text-red-400';
    const categoryText = isProductive ? 'Productive' : 'Unproductive';

    const appElement = document.createElement('div');
    appElement.className = `bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-xl p-4 
                           hover:bg-slate-700/30 transition-all duration-300 flex justify-between items-center group`;
    
    appElement.innerHTML = `
      <div class="flex items-center space-x-3">
        <div class="w-8 h-8 ${bgColorClass} rounded-lg flex items-center justify-center">
          <span class="${textColorClass} text-sm">${getAppIcon(website.domain)}</span>
        </div>
        <span class="text-slate-200 font-medium">${formatDomain(website.domain)}</span>
      </div>
      <div class="text-right">
        <span class="${timeColorClass} font-bold text-lg">${formatTime(website.time)}</span>
        <div class="text-xs ${textColorClass}/70">${categoryText}</div>
      </div>
    `;

    return appElement;
  }

  updateCatImage(stats) {
    const catImage = document.getElementById('cat-image');
    if (!catImage) return;

    let imagePath = 'images/happy.png';
    let altText = 'Happy Cat';
    let cssClass = 'cat-healthy';
    
    if (stats.catHealth < 30) {
      imagePath = 'images/dead.png';
      altText = 'Dead Cat';
      cssClass = 'cat-dead';
    } else if (stats.catHealth < 60) {
      imagePath = 'images/sad.png';
      altText = 'Sad Cat';
      cssClass = 'cat-sad';
    } else {
      imagePath = 'images/happy.png';
      altText = 'Happy Cat';
      cssClass = 'cat-healthy';
    }
    
    // Remove existing health classes
    catImage.classList.remove('cat-healthy', 'cat-sad', 'cat-dead');
    
    catImage.src = imagePath;
    catImage.alt = altText;
    catImage.classList.add(cssClass);
    
    // Add a subtle transition effect when changing images
    catImage.style.opacity = '0.8';
    setTimeout(() => {
      catImage.style.opacity = '1';
    }, 150);
  }

  showLoadingState() {
    const healthPercentage = document.querySelector('.health-percentage');
    const productiveTime = document.querySelector('.productive-time');
    const unproductiveTime = document.querySelector('.unproductive-time');
    
    if (healthPercentage) healthPercentage.textContent = 'Loading...';
    if (productiveTime) productiveTime.textContent = 'Loading...';
    if (unproductiveTime) unproductiveTime.textContent = 'Loading...';
  }

  async refreshData() {
    await this.loadInitialData();
  }

  getFormattedStats(stats) {
    return {
      ...stats,
      healthColor: this.getHealthColor(stats.catHealth),
      productivityColor: this.getProductivityColor(stats.productivityScore)
    };
  }

  getHealthColor(health) {
    if (health < 30) return 'red';
    if (health < 60) return 'yellow';
    return 'green';
  }

  getProductivityColor(score) {
    if (score < 40) return 'red';
    if (score < 70) return 'yellow';
    return 'green';
  }
}

// Navigation functionality
function showPage(pageId) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  
  // Remove active class from all nav buttons
  document.querySelectorAll('.nav-button').forEach(btn => {
    btn.classList.remove('active');
  });
  
  // Show selected page
  document.getElementById(pageId + '-page').classList.add('active');
  
  // Add active class to clicked button
  document.querySelector(`[data-page="${pageId}"]`).classList.add('active');
  
  // Load page-specific content
  if (pageId === 'history') {
    loadHistoryData();
  } else if (pageId === 'settings') {
    loadSettings();
  }
}

// Settings functionality
let currentSettings = {};

async function loadSettings() {
  try {
    const settings = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    currentSettings = settings;
    
    // Populate screen time goal
    document.getElementById('screenTimeGoal').value = settings.dailyScreenTimeGoal || 6;
    
    // Populate website categories
    populateWebsiteList('productive', settings.websiteCategories?.productive || []);
    populateWebsiteList('unproductive', settings.websiteCategories?.unproductive || []);
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

function populateWebsiteList(type, websites) {
  const container = document.getElementById(type + '-websites');
  container.innerHTML = '';
  
  websites.forEach(website => {
    const tag = document.createElement('span');
    tag.className = `website-tag ${type === 'unproductive' ? 'unproductive' : ''}`;
    tag.textContent = website;
    tag.addEventListener('click', () => removeWebsite(type, website));
    tag.title = 'Click to remove';
    container.appendChild(tag);
  });
}

function addWebsite(type) {
  const input = document.getElementById('new-' + type + '-site');
  const website = input.value.trim().toLowerCase();
  
  if (!website) return;
  
  // Remove common prefixes
  const cleanWebsite = website.replace(/^(https?:\/\/)?(www\.)?/, '');
  
  if (!currentSettings.websiteCategories) {
    currentSettings.websiteCategories = { productive: [], unproductive: [] };
  }
  
  // Remove from other category if exists
  const otherType = type === 'productive' ? 'unproductive' : 'productive';
  currentSettings.websiteCategories[otherType] = currentSettings.websiteCategories[otherType].filter(site => site !== cleanWebsite);
  
  // Add to current category if not already there
  if (!currentSettings.websiteCategories[type].includes(cleanWebsite)) {
    currentSettings.websiteCategories[type].push(cleanWebsite);
  }
  
  // Update display
  populateWebsiteList('productive', currentSettings.websiteCategories.productive);
  populateWebsiteList('unproductive', currentSettings.websiteCategories.unproductive);
  
  input.value = '';
}

function removeWebsite(type, website) {
  if (!currentSettings.websiteCategories) return;
  
  currentSettings.websiteCategories[type] = currentSettings.websiteCategories[type].filter(site => site !== website);
  populateWebsiteList(type, currentSettings.websiteCategories[type]);
}

async function saveSettings() {
  try {
    const screenTimeGoal = parseFloat(document.getElementById('screenTimeGoal').value) || 6;
    
    await chrome.runtime.sendMessage({
      type: 'UPDATE_SETTINGS',
      settings: {
        dailyScreenTimeGoal: screenTimeGoal
      }
    });
    
    await chrome.runtime.sendMessage({
      type: 'UPDATE_WEBSITE_CATEGORIES',
      categories: currentSettings.websiteCategories
    });
    
    // Show success feedback
    const saveButton = document.getElementById('save-settings-btn');
    const originalText = saveButton.textContent;
    saveButton.textContent = 'Saved!';
    saveButton.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    
    setTimeout(() => {
      saveButton.textContent = originalText;
      saveButton.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
    }, 2000);
    
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// History functionality
async function loadHistoryData() {
  try {
    const historyData = await chrome.runtime.sendMessage({ type: 'GET_HISTORICAL_DATA' });
    displayHistoryChart(historyData);
    displayHistoryList(historyData);
  } catch (error) {
    console.error('Error loading history:', error);
  }
}

function displayHistoryChart(data) {
  const chartContainer = document.getElementById('history-chart');
  const historicalData = data.historicalData || {};
  
  // Get last 7 days
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toDateString();
    last7Days.push({
      date: dateStr,
      shortDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).replace(' ', ''), // "Aug15" format
      data: historicalData[dateStr] || { productive: 0, unproductive: 0, totalTime: 0, healthScore: 100 }
    });
  }
  
  // Side-by-side bar chart with more spacing
  let chartHTML = '<div class="flex items-end justify-between h-48 border-b border-slate-600 px-6" style="gap: 2rem;">';
  
  const maxTime = Math.max(...last7Days.map(day => Math.max(day.data.productive, day.data.unproductive))) || 1;
  
  last7Days.forEach(day => {
    const productiveHours = day.data.productive / (1000 * 60 * 60);
    const unproductiveHours = day.data.unproductive / (1000 * 60 * 60);
    const totalHours = day.data.totalTime / (1000 * 60 * 60);
    
    const productiveHeight = Math.max((productiveHours / (maxTime / (1000 * 60 * 60))) * 160, 2);
    const unproductiveHeight = Math.max((unproductiveHours / (maxTime / (1000 * 60 * 60))) * 160, 2);
    
    chartHTML += `
      <div class="flex flex-col items-center">
        <div class="flex items-end gap-2" style="height: 160px;">
          <div class="bg-green-500/60 rounded-t" style="height: ${productiveHeight}px; width: 12px;" title="Productive: ${Math.round(productiveHours)}h"></div>
          <div class="bg-red-500/60 rounded-t" style="height: ${unproductiveHeight}px; width: 12px;" title="Unproductive: ${Math.round(unproductiveHours)}h"></div>
        </div>
        <div class="text-xs text-slate-400 mt-3 text-center">
          <div class="font-medium">${day.shortDate}</div>
          <div class="mt-1">${Math.round(totalHours)}h</div>
        </div>
      </div>
    `;
  });
  
  chartHTML += '</div>';
  chartHTML += '<div class="flex justify-center gap-6 mt-6 text-sm">';
  chartHTML += '<div class="flex items-center gap-2"><div class="w-3 h-3 bg-green-500/60 rounded"></div><span class="text-slate-300">Productive</span></div>';
  chartHTML += '<div class="flex items-center gap-2"><div class="w-3 h-3 bg-red-500/60 rounded"></div><span class="text-slate-300">Unproductive</span></div>';
  chartHTML += '</div>';
  
  chartContainer.innerHTML = chartHTML;
}

function displayHistoryList(data) {
  const listContainer = document.getElementById('history-list');
  const historicalData = data.historicalData || {};
  
  const sortedDates = Object.keys(historicalData).sort((a, b) => new Date(b) - new Date(a));
  
  if (sortedDates.length === 0) {
    listContainer.innerHTML = `
      <div class="history-item">
        <div class="text-center text-slate-400">
          No historical data available yet. Start using the extension to see your screen time history!
        </div>
      </div>
    `;
    return;
  }
  
  listContainer.innerHTML = '';
  
  sortedDates.slice(0, 30).forEach(dateStr => {
    const dayData = historicalData[dateStr];
    const date = new Date(dateStr);
    const totalHours = Math.round(dayData.totalTime / (1000 * 60 * 60));
    const productiveHours = Math.round(dayData.productive / (1000 * 60 * 60));
    const unproductiveHours = Math.round(dayData.unproductive / (1000 * 60 * 60));
    const productivityScore = totalHours > 0 ? Math.round((dayData.productive / dayData.totalTime) * 100) : 100;
    
    // Format date as "Monday Aug15"
    const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
    const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).replace(' ', '');
    const formattedDate = `${weekday} ${monthDay}`;
    
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <div class="flex justify-between items-center mb-2">
        <div class="flex items-center gap-3">
          <div class="text-slate-200 font-medium">${formattedDate}</div>
          <div class="text-sm px-2 py-1 rounded ${dayData.healthScore >= 70 ? 'bg-green-500/20 text-green-400' : dayData.healthScore >= 40 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}">
            Health: ${dayData.healthScore}%
          </div>
        </div>
        <div class="text-slate-300 font-bold">${totalHours}h total</div>
      </div>
      <div class="grid grid-cols-3 gap-4 text-sm">
        <div class="text-center">
          <div class="text-green-400 font-bold">${productiveHours}h</div>
          <div class="text-slate-500">Productive</div>
        </div>
        <div class="text-center">
          <div class="text-red-400 font-bold">${unproductiveHours}h</div>
          <div class="text-slate-500">Unproductive</div>
        </div>
        <div class="text-center">
          <div class="text-blue-400 font-bold">${productivityScore}%</div>
          <div class="text-slate-500">Productivity</div>
        </div>
      </div>
    `;
    listContainer.appendChild(item);
  });
}

// Initialize dashboard when the script loads
const dashboard = new ProductivityDashboard();

// Make dashboard available globally for debugging
window.productivityDashboard = dashboard;

// Handle Enter key in website input fields and set up event listeners
document.addEventListener('DOMContentLoaded', function() {
  // Navigation event listeners
  document.querySelectorAll('.nav-button').forEach(button => {
    button.addEventListener('click', function() {
      const pageId = this.getAttribute('data-page');
      showPage(pageId);
    });
  });

  // Settings page event listeners
  const addProductiveBtn = document.getElementById('add-productive-btn');
  if (addProductiveBtn) {
    addProductiveBtn.addEventListener('click', () => addWebsite('productive'));
  }

  const addUnproductiveBtn = document.getElementById('add-unproductive-btn');
  if (addUnproductiveBtn) {
    addUnproductiveBtn.addEventListener('click', () => addWebsite('unproductive'));
  }

  const saveSettingsBtn = document.getElementById('save-settings-btn');
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', saveSettings);
  }

  // Enter key handlers for input fields
  const productiveSiteInput = document.getElementById('new-productive-site');
  if (productiveSiteInput) {
    productiveSiteInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        addWebsite('productive');
      }
    });
  }
  
  const unproductiveSiteInput = document.getElementById('new-unproductive-site');
  if (unproductiveSiteInput) {
    unproductiveSiteInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        addWebsite('unproductive');
      }
    });
  }
});
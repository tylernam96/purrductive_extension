// newtab.js - FIXED: Proper productivity calculations and display
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
      // Search setup is now handled in setupSearchFunctionality() after stats load
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

  // FIXED: Force correct productivity calculations regardless of background script
  updateDashboard(stats) {
    console.log('=== DASHBOARD UPDATE DEBUG ===');
    console.log('Raw stats received:', stats);
    
    // Store current stats for search functionality
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
          // For now, let's count neutral sites - you can decide which category they should go to
          console.log(`   ℹ️ Neutral site detected: ${site.domain} - adding to productive for now`);
          totalProductive += timeMs; // Change this line to totalUnproductive += timeMs; if you prefer
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
    
    // Force update the display immediately
    console.log('🔄 Updating display with corrected values...');
    
    this.updateHealthBar(stats.catHealth);
    this.updateProductivityStats(stats);
    this.updateAppUsage(stats.websites);
    this.updateCatEmoji(stats);
    
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

  // Helper method to format time consistently
  formatTime(ms) {
    if (!ms || ms === 0) return '0m';
    
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  // FIXED: Google search functionality instead of filtering dashboard data
  setupSearchFunctionality() {
    const searchInput = document.getElementById('searchInput');
    
    if (!searchInput) {
      console.error('Search input element not found!');
      return;
    }
    
    // Remove any existing event listeners
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);
    
    // Function to handle search or direct navigation
    const handleSearch = (query) => {
      if (query.trim() === '') {
        return; // Don't search for empty queries
      }
      
      const trimmedQuery = query.trim();
      
      // Check if it looks like a URL or domain
      const isUrl = (str) => {
        // Check for common URL patterns
        const urlPatterns = [
          /^https?:\/\//i,                    // starts with http:// or https://
          /^[a-z0-9.-]+\.[a-z]{2,}$/i,       // domain.com format
          /^www\.[a-z0-9.-]+\.[a-z]{2,}$/i,  // www.domain.com format
          /^[a-z0-9.-]+\.(com|org|net|edu|gov|io|co|uk|de|fr|jp|cn|au|ca)$/i // common TLDs
        ];
        
        return urlPatterns.some(pattern => pattern.test(str));
      };
      
      if (isUrl(trimmedQuery)) {
        // It's a URL or domain - navigate directly
        let url = trimmedQuery;
        
        // Add https:// if no protocol specified
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        
        console.log('Navigating directly to:', url);
        window.location.href = url;
      } else {
        // It's a search query - use Google
        const encodedQuery = encodeURIComponent(trimmedQuery);
        const googleSearchUrl = `https://www.google.com/search?q=${encodedQuery}`;
        
        console.log('Searching Google for:', trimmedQuery);
        window.location.href = googleSearchUrl;
      }
    };
    
    // Handle Enter key press
    newSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const query = e.target.value;
        console.log('Searching Google for:', query);
        handleSearch(query);
      }
    });
    
    // Optional: Handle form submission if the input is in a form
    const form = newSearchInput.closest('form');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const query = newSearchInput.value;
        console.log('Form submitted - searching Google for:', query);
        handleSearch(query);
      });
    }
    
    // Set placeholder text to match Chrome's address bar
    newSearchInput.placeholder = 'Search Google or type a URL';
    
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

  // FIXED: Simplified productivity stats without change calculations
  updateProductivityStats(stats) {
    const productiveTime = document.querySelector('.productive-time');
    const unproductiveTime = document.querySelector('.unproductive-time');
    const productiveChange = document.querySelector('.productive-change');
    const unproductiveChange = document.querySelector('.unproductive-change');
    
    if (productiveTime) productiveTime.textContent = stats.productiveTime;
    if (unproductiveTime) unproductiveTime.textContent = stats.unproductiveTime;
    
    // FIXED: Hide change indicators to reduce clutter
    if (productiveChange) {
      productiveChange.textContent = '';
      productiveChange.className = 'mt-2 text-xs text-transparent';
    }
    if (unproductiveChange) {
      unproductiveChange.textContent = '';
      unproductiveChange.className = 'mt-2 text-xs text-transparent';
    }
  }

  // FIXED: Proper change calculation method
  async calculateAndDisplayChanges(stats, productiveChangeEl, unproductiveChangeEl) {
    try {
      // Get yesterday's data for comparison
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = yesterday.toDateString();
      
      const dailyStatsData = await chrome.runtime.sendMessage({ type: 'GET_DAILY_STATS' });
      const yesterdayStats = dailyStatsData?.dailyStats?.[yesterdayKey];
      
      if (yesterdayStats && productiveChangeEl && unproductiveChangeEl) {
        // Calculate percentage changes
        const todayProductive = stats.productiveTimeRaw || 0;
        const todayUnproductive = stats.unproductiveTimeRaw || 0;
        const yesterdayProductive = yesterdayStats.productive || 0;
        const yesterdayUnproductive = yesterdayStats.unproductive || 0;
        
        // FIXED: Whole number percentage calculations
        const productiveChange = yesterdayProductive > 0 ? 
          Math.round(((todayProductive - yesterdayProductive) / yesterdayProductive) * 100) : 
          (todayProductive > 0 ? 100 : 0);
          
        const unproductiveChange = yesterdayUnproductive > 0 ? 
          Math.round(((todayUnproductive - yesterdayUnproductive) / yesterdayUnproductive) * 100) : 
          (todayUnproductive > 0 ? 100 : 0);
        
        // Update productive change display
        if (productiveChange > 0) {
          productiveChangeEl.textContent = `↗ +${productiveChange}% vs yesterday`;
          productiveChangeEl.className = 'mt-2 text-xs text-green-500';
        } else if (productiveChange < 0) {
          productiveChangeEl.textContent = `↘ ${productiveChange}% vs yesterday`;
          productiveChangeEl.className = 'mt-2 text-xs text-red-500';
        } else {
          productiveChangeEl.textContent = `→ No change vs yesterday`;
          productiveChangeEl.className = 'mt-2 text-xs text-gray-500';
        }
        
        // Update unproductive change display (reverse colors - less unproductive is good)
        if (unproductiveChange > 0) {
          unproductiveChangeEl.textContent = `↗ +${unproductiveChange}% vs yesterday`;
          unproductiveChangeEl.className = 'mt-2 text-xs text-red-500';
        } else if (unproductiveChange < 0) {
          unproductiveChangeEl.textContent = `↘ ${unproductiveChange}% vs yesterday`;
          unproductiveChangeEl.className = 'mt-2 text-xs text-green-500';
        } else {
          unproductiveChangeEl.textContent = `→ No change vs yesterday`;
          unproductiveChangeEl.className = 'mt-2 text-xs text-gray-500';
        }
      } else {
        // No yesterday data available - hide the change indicators
        if (productiveChangeEl) {
          productiveChangeEl.textContent = ``;
          productiveChangeEl.className = 'mt-2 text-xs text-transparent';
        }
        if (unproductiveChangeEl) {
          unproductiveChangeEl.textContent = ``;
          unproductiveChangeEl.className = 'mt-2 text-xs text-transparent';
        }
      }
    } catch (error) {
      console.error('Error calculating changes:', error);
      // Fallback display - hide change indicators on error
      if (productiveChangeEl) {
        productiveChangeEl.textContent = ``;
        productiveChangeEl.className = 'mt-2 text-xs text-transparent';
      }
      if (unproductiveChangeEl) {
        unproductiveChangeEl.textContent = ``;
        unproductiveChangeEl.className = 'mt-2 text-xs text-transparent';
      }
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

  updateCatEmoji(stats) {
    const catEmoji = document.querySelector('.cat-emoji');
    if (!catEmoji) return;

    let emoji = '😸';
    
    if (stats.catHealth < 30) {
      emoji = '😿';
    } else if (stats.catHealth < 50) {
      emoji = '😾';
    } else if (stats.productivityScore > 80) {
      emoji = '😻';
    } else if (stats.productivityScore > 60) {
      emoji = '😸';
    } else {
      emoji = '🙀';
    }
    
    catEmoji.textContent = emoji;
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

// Initialize dashboard when the script loads
const dashboard = new ProductivityDashboard();

// Make dashboard available globally for debugging
window.productivityDashboard = dashboard;
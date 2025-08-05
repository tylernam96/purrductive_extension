class NewTabPage {
    constructor() {
        this.popularSites = [
            'youtube.com',
            'facebook.com',
            'twitter.com',
            'instagram.com',
            'reddit.com',
            'wikipedia.org',
            'amazon.com',
            'netflix.com'
        ];
        
        this.init();
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    setup() {
        this.updateTime();
        this.loadCatStatus();
        this.loadDailyStats();
        this.setupSearch();
        this.setGreeting();
        
        // Update time every second
        setInterval(() => this.updateTime(), 1000);
        
        // Update cat status every 30 seconds
        setInterval(() => this.loadCatStatus(), 30000);
    }

    updateTime() {
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        const dateString = now.toLocaleDateString([], { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });

        const timeDisplay = document.getElementById('time-display');
        const dateDisplay = document.getElementById('date-display');
        
        if (timeDisplay) timeDisplay.textContent = timeString;
        if (dateDisplay) dateDisplay.textContent = dateString;
    }

    setGreeting() {
        const hour = new Date().getHours();
        let greeting;

        if (hour < 12) {
            greeting = 'Good morning!';
        } else if (hour < 17) {
            greeting = 'Good afternoon!';
        } else {
            greeting = 'Good evening!';
        }

        const greetingElement = document.getElementById('greeting');
        if (greetingElement) greetingElement.textContent = greeting;
    }

    async loadCatStatus() {
        try {
            // Try to get cat status from chrome extension
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                const response = await chrome.runtime.sendMessage({ type: 'GET_CAT_STATUS' });
                if (response) {
                    this.updateCatDisplay(response.catHealth || 80, response.catHappiness || 70);
                    return;
                }
            }
        } catch (error) {
            console.log('Chrome extension not available, using default values');
        }
        
        // Fallback to default values
        this.updateCatDisplay(80, 70);
    }

    updateCatDisplay(health, happiness) {
        const catDisplay = document.getElementById('cat-display');
        const catStatus = document.getElementById('cat-status');
        const healthProgress = document.getElementById('health-progress');
        const happinessProgress = document.getElementById('happiness-progress');

        // Update progress bars
        if (healthProgress) healthProgress.style.width = `${health}%`;
        if (happinessProgress) happinessProgress.style.width = `${happiness}%`;

        // Update cat emoji and status message
        let catEmoji = '😺';
        let statusMessage = 'Your cat is doing well!';

        if (happiness > 90 && health > 90) {
            catEmoji = '😸';
            statusMessage = 'Your cat is absolutely thriving! Keep up the great work!';
        } else if (happiness > 70 && health > 70) {
            catEmoji = '😺';
            statusMessage = 'Your cat is happy and healthy!';
        } else if (happiness > 50 && health > 50) {
            catEmoji = '🐱';
            statusMessage = 'Your cat is doing okay, but could use some productive time.';
        } else if (happiness > 30 || health > 30) {
            catEmoji = '😿';
            statusMessage = 'Your cat is feeling sad. Try focusing on productive activities!';
        } else {
            catEmoji = '💀';
            statusMessage = 'Your cat needs immediate attention! Time to be productive!';
        }

        if (catDisplay) catDisplay.textContent = catEmoji;
        if (catStatus) catStatus.textContent = statusMessage;
    }

    async loadDailyStats() {
        try {
            // Try to get stats from chrome extension
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                const response = await chrome.runtime.sendMessage({ type: 'GET_DAILY_STATS' });
                if (response && response.dailyStats) {
                    const today = new Date().toDateString();
                    const todayStats = response.dailyStats[today] || { productive: 0, unproductive: 0 };
                    this.updateStatsDisplay(todayStats);
                    return;
                }
            }
        } catch (error) {
            console.log('Chrome extension not available, using default values');
        }
        
        // Fallback to default values
        this.updateStatsDisplay({ productive: 0, unproductive: 0 });
    }

    updateStatsDisplay(stats) {
        const productiveHours = Math.floor(stats.productive / (1000 * 60 * 60));
        const productiveMinutes = Math.floor((stats.productive % (1000 * 60 * 60)) / (1000 * 60));
        
        const unproductiveHours = Math.floor(stats.unproductive / (1000 * 60 * 60));
        const unproductiveMinutes = Math.floor((stats.unproductive % (1000 * 60 * 60)) / (1000 * 60));

        const productiveTimeElement = document.getElementById('productive-time');
        const unproductiveTimeElement = document.getElementById('unproductive-time');
        const productivityScoreElement = document.getElementById('productivity-score');

        if (productiveTimeElement) {
            productiveTimeElement.textContent = `${productiveHours}h ${productiveMinutes}m`;
        }
        if (unproductiveTimeElement) {
            unproductiveTimeElement.textContent = `${unproductiveHours}h ${unproductiveMinutes}m`;
        }

        // Calculate productivity score
        const totalTime = stats.productive + stats.unproductive;
        const productivityScore = totalTime > 0 ? 
            Math.round((stats.productive / totalTime) * 100) : 85;
        
        if (productivityScoreElement) {
            productivityScoreElement.textContent = `${productivityScore}%`;
        }
    }

    setupSearch() {
        const searchForm = document.getElementById('search-form');
        const searchInput = document.getElementById('search-input');
        const searchSuggestions = document.getElementById('search-suggestions');
        
        if (!searchForm || !searchInput) return;

        // Handle form submission
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const query = searchInput.value.trim();
            if (query) {
                this.handleSearch(query);
            }
        });

        // Input suggestions
        searchInput.addEventListener('input', (e) => {
            this.showSuggestions(e.target.value);
        });

        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                if (searchSuggestions) searchSuggestions.style.display = 'none';
            }
        });

        // Focus search input on page load
        setTimeout(() => {
            searchInput.focus();
        }, 100);

        // Focus search input when pressing '/' key
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && e.target !== searchInput) {
                e.preventDefault();
                searchInput.focus();
            }
        });
    }

    handleSearch(query) {
        console.log('Searching for:', query);
        
        // Hide suggestions
        const searchSuggestions = document.getElementById('search-suggestions');
        if (searchSuggestions) searchSuggestions.style.display = 'none';
        
        // Check if it's a URL
        if (this.isURL(query)) {
            const url = query.startsWith('http') ? query : 'https://' + query;
            console.log('Navigating to URL:', url);
            window.location.href = url;
        } else {
            // Search with Google
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
            console.log('Searching with Google:', searchUrl);
            window.location.href = searchUrl;
        }
    }

    isURL(str) {
        // Check for common URL patterns
        const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
        
        // Also check if it contains a dot and no spaces (simple domain check)
        const simpleDomainCheck = str.includes('.') && !str.includes(' ') && str.length > 3;
        
        return urlPattern.test(str) || simpleDomainCheck;
    }

    showSuggestions(query) {
        const searchSuggestions = document.getElementById('search-suggestions');
        
        if (!searchSuggestions || !query.trim()) {
            if (searchSuggestions) searchSuggestions.style.display = 'none';
            return;
        }

        const suggestions = this.popularSites.filter(site => 
            site.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 5);

        if (suggestions.length > 0) {
            searchSuggestions.innerHTML = suggestions.map(site => 
                `<div class="search-suggestion" data-site="${site}">${site}</div>`
            ).join('');
            
            // Add event listeners to each suggestion
            searchSuggestions.querySelectorAll('.search-suggestion').forEach(suggestion => {
                suggestion.addEventListener('click', (e) => {
                    const site = e.target.getAttribute('data-site');
                    const searchInput = document.getElementById('search-input');
                    if (searchInput) {
                        searchInput.value = site;
                        this.handleSearch(site);
                    }
                });
            });
            
            searchSuggestions.style.display = 'block';
        } else {
            searchSuggestions.style.display = 'none';
        }
    }
}

// Initialize the new tab page
new NewTabPage();
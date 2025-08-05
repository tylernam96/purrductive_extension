// content-script.js - This runs on every webpage
class CatPopupManager {
    constructor() {
        this.popup = null;
        this.isVisible = false;
        this.checkInterval = null;
        
        // Thresholds are now managed by background script
        this.init();
    }

    init() {
        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'SHOW_THRESHOLD_POPUP') {
                this.showPopupFromBackground();
            } else if (message.type === 'UPDATE_THRESHOLDS') {
                // Thresholds are managed by background script
                sendResponse({ success: true });
            }
        });
    }

    async checkThresholds() {
        // This method is now handled by the background script
        // Content script only shows popup when explicitly told to
    }

    // NEW METHOD: Show popup when triggered by background script
    async showPopupFromBackground() {
        if (this.isVisible) return;
        
        try {
            // Get current data from background script
            const catStatus = await chrome.runtime.sendMessage({ type: 'GET_CAT_STATUS' });
            const dailyStats = await chrome.runtime.sendMessage({ type: 'GET_DAILY_STATS' });
            
            if (!catStatus || !dailyStats) return;
            
            const today = new Date().toDateString();
            const todayStats = dailyStats.dailyStats?.[today] || { productive: 0, unproductive: 0 };
            
            // Calculate productivity score
            const totalTime = todayStats.productive + todayStats.unproductive;
            const productivityScore = totalTime > 0 ? 
                Math.round((todayStats.productive / totalTime) * 100) : 100;
            
            this.showPopup(catStatus, todayStats, productivityScore);
            
        } catch (error) {
            console.log('Could not show popup from background:', error);
        }
    }

    showPopup(catStatus, stats, productivityScore) {
        if (this.isVisible) return;
        
        this.createPopup(catStatus, stats, productivityScore);
        this.isVisible = true;
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (this.isVisible) {
                this.hidePopup();
            }
        }, 10000);
    }

    createPopup(catStatus, stats, productivityScore) {
        // Remove existing popup if any
        if (this.popup) {
            this.popup.remove();
        }

        const health = catStatus.catHealth || 100;
        const happiness = catStatus.catHappiness || 100;
        
        // Determine cat emoji and message based on status
        let catEmoji = '😿';
        let message = 'Your productivity cat needs attention!';
        let urgency = 'warning';
        
        if (health < 20 || happiness < 20) {
            catEmoji = '💀';
            message = 'URGENT: Your cat is in critical condition!';
            urgency = 'critical';
        } else if (productivityScore < 25) {
            catEmoji = '😾';
            message = 'Your cat is very unhappy with your productivity!';
            urgency = 'critical';
        }

        this.popup = document.createElement('div');
        this.popup.innerHTML = `
            <div class="purrductive-popup purrductive-${urgency}">
                <div class="purrductive-popup-content">
                    <button class="purrductive-close">&times;</button>
                    <div class="purrductive-cat">${catEmoji}</div>
                    <div class="purrductive-message">${message}</div>
                    <div class="purrductive-stats">
                        <div class="purrductive-stat">
                            <span>Health:</span> 
                            <div class="purrductive-bar">
                                <div class="purrductive-fill" style="width: ${health}%"></div>
                            </div>
                            <span>${health}%</span>
                        </div>
                        <div class="purrductive-stat">
                            <span>Happiness:</span> 
                            <div class="purrductive-bar">
                                <div class="purrductive-fill" style="width: ${happiness}%"></div>
                            </div>
                            <span>${happiness}%</span>
                        </div>
                        <div class="purrductive-stat">
                            <span>Productivity:</span> 
                            <div class="purrductive-bar">
                                <div class="purrductive-fill" style="width: ${productivityScore}%"></div>
                            </div>
                            <span>${productivityScore}%</span>
                        </div>
                    </div>
                    <div class="purrductive-actions">
                        <button class="purrductive-btn purrductive-productive">Do Something Productive</button>
                        <button class="purrductive-btn purrductive-dismiss">Dismiss</button>
                    </div>
                </div>
            </div>
        `;

        // Add styles
        this.addStyles();
        
        // Append to body
        document.body.appendChild(this.popup);
        
        // Add event listeners
        this.popup.querySelector('.purrductive-close').addEventListener('click', () => this.hidePopup());
        this.popup.querySelector('.purrductive-dismiss').addEventListener('click', () => this.hidePopup());
        this.popup.querySelector('.purrductive-productive').addEventListener('click', () => this.openProductiveLink());
        
        // Animate in
        requestAnimationFrame(() => {
            this.popup.querySelector('.purrductive-popup').classList.add('purrductive-show');
        });
    }

    addStyles() {
        if (document.getElementById('purrductive-popup-styles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'purrductive-popup-styles';
        styles.textContent = `
            .purrductive-popup {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 999999;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                transform: translateX(100%);
                transition: transform 0.3s ease;
            }
            
            .purrductive-popup.purrductive-show {
                transform: translateX(0);
            }
            
            .purrductive-popup-content {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 20px;
                border-radius: 15px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                width: 320px;
                position: relative;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255,255,255,0.2);
            }
            
            .purrductive-popup.purrductive-critical .purrductive-popup-content {
                background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
                animation: purrductive-pulse 2s infinite;
            }
            
            @keyframes purrductive-pulse {
                0%, 100% { box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
                50% { box-shadow: 0 10px 30px rgba(255,107,107,0.5); }
            }
            
            .purrductive-close {
                position: absolute;
                top: 10px;
                right: 15px;
                background: none;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
                opacity: 0.7;
                transition: opacity 0.2s;
            }
            
            .purrductive-close:hover {
                opacity: 1;
            }
            
            .purrductive-cat {
                font-size: 48px;
                text-align: center;
                margin-bottom: 10px;
                animation: purrductive-float 3s ease-in-out infinite;
            }
            
            @keyframes purrductive-float {
                0%, 100% { transform: translateY(0px); }
                50% { transform: translateY(-5px); }
            }
            
            .purrductive-message {
                text-align: center;
                font-size: 16px;
                font-weight: 500;
                margin-bottom: 15px;
                line-height: 1.4;
            }
            
            .purrductive-stats {
                margin-bottom: 15px;
            }
            
            .purrductive-stat {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 8px;
                font-size: 14px;
            }
            
            .purrductive-stat span:first-child {
                width: 80px;
                font-weight: 500;
            }
            
            .purrductive-stat span:last-child {
                width: 35px;
                text-align: right;
                font-weight: bold;
            }
            
            .purrductive-bar {
                flex: 1;
                height: 8px;
                background: rgba(255,255,255,0.2);
                border-radius: 4px;
                overflow: hidden;
            }
            
            .purrductive-fill {
                height: 100%;
                background: linear-gradient(90deg, #4ecdc4, #7ed6cc);
                border-radius: 4px;
                transition: width 0.5s ease;
            }
            
            .purrductive-actions {
                display: flex;
                gap: 10px;
            }
            
            .purrductive-btn {
                flex: 1;
                padding: 10px;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .purrductive-productive {
                background: rgba(255,255,255,0.9);
                color: #333;
            }
            
            .purrductive-productive:hover {
                background: white;
                transform: translateY(-1px);
            }
            
            .purrductive-dismiss {
                background: rgba(255,255,255,0.1);
                color: white;
                border: 1px solid rgba(255,255,255,0.3);
            }
            
            .purrductive-dismiss:hover {
                background: rgba(255,255,255,0.2);
            }
        `;
        
        document.head.appendChild(styles);
    }

    hidePopup() {
        if (!this.popup || !this.isVisible) return;
        
        this.popup.querySelector('.purrductive-popup').classList.remove('purrductive-show');
        
        setTimeout(() => {
            if (this.popup) {
                this.popup.remove();
                this.popup = null;
            }
        }, 300);
        
        this.isVisible = false;
        
        // Notify background script that popup was dismissed
        chrome.runtime.sendMessage({ type: 'POPUP_DISMISSED' }).catch(() => {});
    }

    openProductiveLink() {
        // Open a productive website
        const productiveLinks = [
            'https://docs.google.com',
            'https://calendar.google.com',
            'https://github.com',
            'https://linkedin.com/learning'
        ];
        
        const randomLink = productiveLinks[Math.floor(Math.random() * productiveLinks.length)];
        window.open(randomLink, '_blank');
        
        this.hidePopup();
    }

    // Method to update thresholds (now handled by background script)
    updateThresholds(newThresholds) {
        chrome.runtime.sendMessage({ 
            type: 'UPDATE_POPUP_THRESHOLDS', 
            thresholds: newThresholds 
        }).catch(() => {});
    }

    destroy() {
        // Clean up intervals and popup
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        this.hidePopup();
    }
}

// Initialize the popup manager
const catPopupManager = new CatPopupManager();

// Listen for threshold updates from popup/options
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'UPDATE_THRESHOLDS') {
        catPopupManager.updateThresholds(message.thresholds);
        sendResponse({ success: true });
    }
});
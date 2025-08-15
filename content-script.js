// content-script.js - FIXED: Simplified popup with only health and dismiss
class CatPopupManager {
    constructor() {
        this.popup = null;
        this.isVisible = false;
        this.init();
    }

    init() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'SHOW_THRESHOLD_POPUP') {
                this.showPopupFromBackground();
            } else if (message.type === 'UPDATE_THRESHOLDS') {
                sendResponse({ success: true });
            }
        });
    }

    async showPopupFromBackground() {
        if (this.isVisible) return;
        
        try {
            const catStatus = await chrome.runtime.sendMessage({ type: 'GET_CAT_STATUS' });
            
            if (!catStatus) return;
            
            this.showPopup(catStatus);
            
        } catch (error) {
            console.log('Could not show popup from background:', error);
        }
    }

    showPopup(catStatus) {
        if (this.isVisible) return;
        
        this.createPopup(catStatus);
        this.isVisible = true;
        
        // FIXED: Longer auto-hide time since popups are less frequent
        setTimeout(() => {
            if (this.isVisible) {
                this.hidePopup();
            }
        }, 15000); // Increased from 10 seconds
    }

    // FIXED: Simplified popup - only health and dismiss button
    createPopup(catStatus) {
        if (this.popup) {
            this.popup.remove();
        }

        // FIXED: All percentages are whole numbers
        const health = Math.round(catStatus.catHealth || 100);
        
        // Determine cat emoji and message based on health only
        let catEmoji = '😿';
        let message = 'Your productivity cat needs attention!';
        let urgency = 'warning';
        
        if (health < 15) {
            catEmoji = '💀';
            message = 'URGENT: Your cat is in critical condition!';
            urgency = 'critical';
        } else if (health < 25) {
            catEmoji = '😾';
            message = 'Your cat is feeling quite unwell!';
            urgency = 'critical';
        }

        this.popup = document.createElement('div');
        // FIXED: Simplified popup content - only health bar and dismiss button
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
                    </div>
                    <div class="purrductive-actions">
                        <button class="purrductive-btn purrductive-dismiss">Dismiss</button>
                    </div>
                </div>
            </div>
        `;

        this.addStyles();
        document.body.appendChild(this.popup);
        
        // FIXED: Only dismiss button event listener
        this.popup.querySelector('.purrductive-close').addEventListener('click', () => this.hidePopup());
        this.popup.querySelector('.purrductive-dismiss').addEventListener('click', () => this.hidePopup());
        
        requestAnimationFrame(() => {
            this.popup.querySelector('.purrductive-popup').classList.add('purrductive-show');
        });
    }

    // FIXED: Updated styles for simplified popup
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
                width: 280px;
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
                width: 60px;
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
                justify-content: center;
            }
            
            .purrductive-btn {
                padding: 12px 24px;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .purrductive-dismiss {
                background: rgba(255,255,255,0.9);
                color: #333;
            }
            
            .purrductive-dismiss:hover {
                background: white;
                transform: translateY(-1px);
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
        
        chrome.runtime.sendMessage({ type: 'POPUP_DISMISSED' }).catch(() => {});
    }

    updateThresholds(newThresholds) {
        chrome.runtime.sendMessage({ 
            type: 'UPDATE_POPUP_THRESHOLDS', 
            thresholds: newThresholds 
        }).catch(() => {});
    }

    destroy() {
        this.hidePopup();
    }
}

// Initialize the popup manager
const catPopupManager = new CatPopupManager();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'UPDATE_THRESHOLDS') {
        catPopupManager.updateThresholds(message.thresholds);
        sendResponse({ success: true });
    }
});
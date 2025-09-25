/**
 * Shopify Cart Validation Integration
 * 
 * This JavaScript code integrates with your custom validation API
 * to add CAPTCHA and user validation before checkout.
 * 
 * IMPLEMENTATION INSTRUCTIONS:
 * 
 * 1. Replace YOUR_VALIDATION_API_URL with your actual API URL
 * 2. Add this script to your cart.liquid file
 * 3. Configure the validation thresholds as needed
 * 4. Test thoroughly before deploying to production
 */

(function() {
    'use strict';
    
    // Configuration
    const CONFIG = {
        API_BASE_URL: window.location.origin + '/api/validation', // Use current domain
        MINIMUM_CART_VALUE: 10000, // $100.00 in cents (your existing validation)
        ENABLE_GEOLOCATION: true,
        ENABLE_CAPTCHA: true,
        DEBUG_MODE: true // Set to true for testing
    };
    
    // Validation state
    let validationState = {
        sessionId: null,
        validationId: null,
        isValidated: false,
        requiresCaptcha: false,
        isBlocked: false,
        userLocation: null
    };
    
    // Generate unique session ID
    function generateSessionId() {
        return 'shopify-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    }
    
    // Get cart data from Shopify
    function getCartData() {
        // Read from your existing cart validation elements
        const cartTotal = document.getElementById('cart-validation-token');
        const cartValue = cartTotal ? cartTotal.value.split('-')[1] : '0';
        const cartItems = document.querySelectorAll('.cart__row[data-variant-id]').length;
        
        return {
            cartValue: parseInt(cartValue) || 0,
            cartItems: cartItems,
            userAgent: navigator.userAgent
        };
    }
    
    // Create validation UI elements
    function createValidationUI() {
        const validationContainer = document.createElement('div');
        validationContainer.id = 'cart-validation-container';
        validationContainer.innerHTML = `
            <div id="validation-status" class="validation-status" style="display: none;">
                <div class="validation-content">
                    <div id="validation-message" class="validation-message"></div>
                    <div id="validation-details" class="validation-details"></div>
                    <div id="captcha-container" class="captcha-container" style="display: none;">
                        <div class="captcha-header">
                            <strong>🤖 Security Verification Required</strong>
                            <p>Please complete the verification to proceed to checkout:</p>
                        </div>
                        <div id="captcha-challenge" class="captcha-challenge">
                            <!-- CAPTCHA will be loaded here -->
                            <div class="mock-captcha">
                                <input type="checkbox" id="mock-captcha-checkbox" />
                                <label for="mock-captcha-checkbox">I'm not a robot</label>
                            </div>
                        </div>
                        <div class="captcha-actions">
                            <button id="captcha-submit" class="btn btn-primary" disabled>Verify & Continue</button>
                            <button id="captcha-cancel" class="btn btn-secondary">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Insert before the proceed to checkout button
        const checkoutButton = document.querySelector('button[name="add"], .btn[href*="checkout"], .checkout-button');
        if (checkoutButton && checkoutButton.parentNode) {
            checkoutButton.parentNode.insertBefore(validationContainer, checkoutButton);
        }
        
        return validationContainer;
    }
    
    // Add validation styles
    function addValidationStyles() {
        const styles = `
            <style>
            .validation-status {
                margin: 20px 0;
                padding: 20px;
                border-radius: 8px;
                font-family: Arial, sans-serif;
            }
            .validation-status.success {
                background: #e8f5e8;
                border: 2px solid #4caf50;
                color: #2e7d32;
            }
            .validation-status.warning {
                background: #fff8e1;
                border: 2px solid #ff9800;
                color: #f57c00;
            }
            .validation-status.error {
                background: #ffebee;
                border: 2px solid #f44336;
                color: #c62828;
            }
            .validation-status.loading {
                background: #e3f2fd;
                border: 2px solid #2196f3;
                color: #1565c0;
            }
            .validation-content {
                text-align: center;
            }
            .validation-message {
                font-size: 16px;
                font-weight: bold;
                margin-bottom: 10px;
            }
            .validation-details {
                font-size: 14px;
                margin-bottom: 15px;
            }
            .captcha-container {
                background: #f9f9f9;
                border: 1px solid #ddd;
                border-radius: 6px;
                padding: 20px;
                margin: 15px 0;
            }
            .captcha-header {
                margin-bottom: 15px;
            }
            .captcha-header strong {
                display: block;
                margin-bottom: 5px;
                color: #333;
            }
            .mock-captcha {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                margin: 20px 0;
                padding: 15px;
                border: 1px solid #ccc;
                border-radius: 4px;
                background: white;
            }
            .mock-captcha input[type="checkbox"] {
                transform: scale(1.2);
            }
            .captcha-actions {
                display: flex;
                gap: 10px;
                justify-content: center;
                margin-top: 15px;
            }
            .captcha-actions .btn {
                padding: 10px 20px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
            }
            .captcha-actions .btn-primary {
                background: #4caf50;
                color: white;
            }
            .captcha-actions .btn-primary:disabled {
                background: #ccc;
                cursor: not-allowed;
            }
            .captcha-actions .btn-secondary {
                background: #6c757d;
                color: white;
            }
            .cart-blocked {
                pointer-events: none;
                opacity: 0.5;
            }
            .validation-loader {
                display: inline-block;
                width: 20px;
                height: 20px;
                border: 3px solid #f3f3f3;
                border-top: 3px solid #3498db;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            </style>
        `;
        document.head.insertAdjacentHTML('beforeend', styles);
    }
    
    // Show validation status
    function showValidationStatus(type, message, details = '') {
        const statusEl = document.getElementById('validation-status');
        const messageEl = document.getElementById('validation-message');
        const detailsEl = document.getElementById('validation-details');
        
        if (!statusEl) return;
        
        statusEl.className = `validation-status ${type}`;
        statusEl.style.display = 'block';
        messageEl.textContent = message;
        detailsEl.textContent = details;
        
        if (CONFIG.DEBUG_MODE) {
            console.log('[Cart Validation]', type, message, details);
        }
    }
    
    // Hide validation status
    function hideValidationStatus() {
        const statusEl = document.getElementById('validation-status');
        if (statusEl) {
            statusEl.style.display = 'none';
        }
    }
    
    // Validate user with API
    async function validateUser() {
        const cartData = getCartData();
        
        // Check minimum cart value first (your existing validation)
        if (cartData.cartValue < CONFIG.MINIMUM_CART_VALUE) {
            showValidationStatus('warning', 
                '⚠️ Minimum Order Value Required', 
                `Please add $${((CONFIG.MINIMUM_CART_VALUE - cartData.cartValue) / 100).toFixed(2)} more to your cart to proceed.`
            );
            return false;
        }
        
        showValidationStatus('loading', 
            '🔍 Validating your request...', 
            'Checking for security and location verification.'
        );
        
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/validate-user`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sessionId: validationState.sessionId,
                    cartValue: cartData.cartValue,
                    cartItems: cartData.cartItems,
                    userAgent: cartData.userAgent
                })
            });
            
            if (!response.ok) {
                throw new Error('Validation service unavailable');
            }
            
            const result = await response.json();
            
            // Store validation results
            validationState.validationId = result.validationId;
            validationState.requiresCaptcha = result.requiresCaptcha;
            validationState.isBlocked = result.blocked;
            validationState.userLocation = result.location;
            
            if (result.blocked) {
                showValidationStatus('error', 
                    '🚫 Access Denied', 
                    'Your request has been blocked due to security concerns. Please contact support if you believe this is an error.'
                );
                blockCheckout();
                return false;
            } else if (result.requiresCaptcha) {
                showValidationStatus('warning', 
                    '🛡️ Security Verification Required', 
                    `Location: ${result.location?.city || 'Unknown'}, ${result.location?.country || 'Unknown'} | Risk Score: ${result.riskScore}`
                );
                showCaptcha();
                return false;
            } else if (result.isValid) {
                showValidationStatus('success', 
                    '✅ Validation Successful', 
                    `Verified from ${result.location?.city || 'Unknown'}, ${result.location?.country || 'Unknown'}. You may proceed to checkout.`
                );
                validationState.isValidated = true;
                unblockCheckout();
                
                // Auto-hide success message after 3 seconds
                setTimeout(hideValidationStatus, 3000);
                return true;
            }
            
        } catch (error) {
            console.error('Validation error:', error);
            showValidationStatus('warning', 
                '⚠️ Validation Service Unavailable', 
                'Proceeding with basic validation only. Advanced security features are temporarily unavailable.'
            );
            // Allow checkout with basic validation only
            return cartData.cartValue >= CONFIG.MINIMUM_CART_VALUE;
        }
        
        return false;
    }
    
    // Show CAPTCHA challenge
    function showCaptcha() {
        const captchaContainer = document.getElementById('captcha-container');
        const checkboxEl = document.getElementById('mock-captcha-checkbox');
        const submitBtn = document.getElementById('captcha-submit');
        
        if (!captchaContainer) return;
        
        captchaContainer.style.display = 'block';
        
        // Mock CAPTCHA interaction
        checkboxEl.addEventListener('change', function() {
            submitBtn.disabled = !this.checked;
        });
        
        // CAPTCHA submit
        submitBtn.addEventListener('click', async function() {
            try {
                showValidationStatus('loading', 
                    '🔐 Verifying CAPTCHA...', 
                    'Please wait while we verify your response.'
                );
                
                const response = await fetch(`${CONFIG.API_BASE_URL}/captcha`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        validationId: validationState.validationId,
                        captchaResponse: 'mock-captcha-response-' + Date.now(),
                        captchaType: 'mock'
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    showValidationStatus('success', 
                        '✅ Verification Complete', 
                        'CAPTCHA verified successfully. You may now proceed to checkout.'
                    );
                    validationState.isValidated = true;
                    captchaContainer.style.display = 'none';
                    unblockCheckout();
                    
                    // Auto-hide success message after 3 seconds
                    setTimeout(hideValidationStatus, 3000);
                } else {
                    showValidationStatus('error', 
                        '❌ Verification Failed', 
                        'CAPTCHA verification failed. Please try again.'
                    );
                    checkboxEl.checked = false;
                    submitBtn.disabled = true;
                }
                
            } catch (error) {
                console.error('CAPTCHA verification error:', error);
                showValidationStatus('error', 
                    '⚠️ Verification Error', 
                    'Unable to verify CAPTCHA. Please try again or contact support.'
                );
            }
        });
        
        // CAPTCHA cancel
        document.getElementById('captcha-cancel').addEventListener('click', function() {
            hideValidationStatus();
            captchaContainer.style.display = 'none';
        });
    }
    
    // Block checkout
    function blockCheckout() {
        const checkoutButtons = document.querySelectorAll('button[name="add"], .btn[href*="checkout"], .checkout-button');
        checkoutButtons.forEach(btn => {
            btn.classList.add('cart-blocked');
            btn.disabled = true;
        });
    }
    
    // Unblock checkout
    function unblockCheckout() {
        const checkoutButtons = document.querySelectorAll('button[name="add"], .btn[href*="checkout"], .checkout-button');
        checkoutButtons.forEach(btn => {
            btn.classList.remove('cart-blocked');
            btn.disabled = false;
        });
    }
    
    // Track checkout proceed
    async function trackCheckoutProceed() {
        if (!validationState.validationId) return;
        
        try {
            await fetch(`${CONFIG.API_BASE_URL}/proceed-checkout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    validationId: validationState.validationId,
                    sessionId: validationState.sessionId
                })
            });
        } catch (error) {
            console.error('Failed to track checkout proceed:', error);
        }
    }
    
    // Initialize validation system
    function initializeValidation() {
        // Generate session ID
        validationState.sessionId = generateSessionId();
        
        // Add styles
        addValidationStyles();
        
        // Create UI
        const validationUI = createValidationUI();
        
        // Find and hook into checkout buttons
        const checkoutButtons = document.querySelectorAll('button[name="add"], .btn[href*="checkout"], .checkout-button');
        
        checkoutButtons.forEach(button => {
            button.addEventListener('click', async function(e) {
                // Only validate if not already validated
                if (!validationState.isValidated && !validationState.isBlocked) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const isValid = await validateUser();
                    if (isValid) {
                        // Track the proceed action
                        await trackCheckoutProceed();
                        
                        // Allow the original action to proceed
                        if (button.href) {
                            window.location.href = button.href;
                        } else if (button.form) {
                            button.form.submit();
                        }
                    }
                } else if (validationState.isValidated) {
                    // Track the proceed action
                    await trackCheckoutProceed();
                }
            });
        });
        
        if (CONFIG.DEBUG_MODE) {
            console.log('[Cart Validation] Initialized with session:', validationState.sessionId);
        }
    }
    
    // Start validation when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeValidation);
    } else {
        initializeValidation();
    }
    
})();
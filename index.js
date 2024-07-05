// Salesforce Marketing Cloud SDK Initialization
var SDK = function (config, whitelistOverride, sslOverride) {
    if (Array.isArray(config)) {
        whitelistOverride = config;
        sslOverride = whitelistOverride;
        config = undefined;
    }

    if (config && config.onEditClose) {
        this.handlers = {
            onEditClose: config.onEditClose
        };
        config.onEditClose = true;
    }

    this._whitelistOverride = whitelistOverride;
    this._sslOverride = sslOverride;
    this._messageId = 1;
    this._messages = {
        0: function () {}
    };
    this._readyToPost = false;
    this._pendingMessages = [];
    this._receiveMessage = this._receiveMessage.bind(this);

    window.addEventListener('message', this._receiveMessage, false);

    try {
        window.parent.postMessage({
            method: 'handShake',
            origin: window.location.origin,
            payload: config
        }, '*');
    } catch (err) {
        console.error('Error sending handshake message:', err);
    }
};

SDK.prototype.execute = function execute(method, options) {
    options = options || {};

    var self = this;
    var payload = options.data;
    var callback = options.success;

    if (!this._readyToPost) {
        this._pendingMessages.push({
            method: method,
            payload: payload,
            callback: callback
        });
    } else {
        this._post({
            method: method,
            payload: payload
        }, callback);
    }
};

SDK.prototype.getCentralData = function (cb) {
    this.execute('getCentralData', {
        success: cb,
        error: function(err) {
            console.error('Error retrieving central data:', err);
        }
    });
};

SDK.prototype.getContent = function (cb) {
    this.execute('getContent', {
        success: function(content) {
            try {
                cb(content);
            } catch (err) {
                console.error('Error in getContent callback:', err);
            }
        },
        error: function(err) {
            console.error('Error retrieving content:', err);
        }
    });
};

SDK.prototype.setData = function (dataObj, cb) {
    this.execute('setData', {
        data: dataObj,
        success: cb,
        error: function(err) {
            console.error('Error setting data:', err);
        }
    });
};

SDK.prototype.setSuperContent = function (content, cb) {
    this.execute('setSuperContent', {
        data: content,
        success: cb,
        error: function(err) {
            console.error('Error setting super content:', err);
        }
    });
};

SDK.prototype.triggerAuth = function (appID) {
    this.getUserData(function (userData) {
        var stack = userData.stack;
        if (stack.indexOf('qa') === 0) {
            stack = stack.substring(3,5) + '.' + stack.substring(0,3);
        }
        var iframe = document.createElement('IFRAME');
        iframe.src = 'https://mc.' + stack + '.exacttarget.com/cloud/tools/SSO.aspx?appId=' + appID + '&restToken=1&hub=1';
        iframe.style.width= '1px';
        iframe.style.height = '1px';
        iframe.style.position = 'absolute';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.visibility = 'hidden';
        iframe.className = 'authframe';
        document.body.appendChild(iframe);
    });
};

/* Internal Methods */

SDK.prototype._executePendingMessages = function _executePendingMessages () {
    var self = this;

    this._pendingMessages.forEach(function (thisMessage) {
        self.execute(thisMessage.method, {
            data: thisMessage.payload,
            success: thisMessage.callback
        });
    });

    this._pendingMessages = [];
};

SDK.prototype._post = function _post (payload, callback) {
    this._messages[this._messageId] = callback;
    payload.id = this._messageId;
    // the actual postMessage always uses the validated origin
    window.parent.postMessage(payload, this._parentOrigin);
    this._messageId += 1;
};

SDK.prototype._receiveMessage = function _receiveMessage (message) {
    message = message || {};
    var data = message.data || {};

    if (data.method === 'handShake') {
        if (this._validateOrigin(data.origin)) {
            this._parentOrigin = data.origin;
            this._readyToPost = true;
            this._executePendingMessages();
            return;
        }
    } else if (data.method === 'closeBlock') {
        if (this._validateOrigin(data.origin)) {
            // here execute the method before closing the block editing
            if (this.handlers && this.handlers.onEditClose) {
                this.handlers.onEditClose();
            }
            this.execute('blockReadyToClose');
            return;
        }
    }

    // if the message is not from the validated origin it gets ignored
    if (!this._parentOrigin || this._parentOrigin !== message.origin) {
        return;
    }
    // when the message has been received, we execute its callback
    (this._messages[data.id || 0] || function () {})(data.payload);
    delete this._messages[data.id];
};

// the custom block should verify it is being called from the marketing cloud
SDK.prototype._validateOrigin = function _validateOrigin (origin) {
    // Make sure to escape periods since these strings are used in a regular expression
    var allowedDomains = this._whitelistOverride || ['exacttarget\\.com', 'marketingcloudapps\\.com', 'blocktester\\.herokuapp\\.com'];

    for (var i = 0; i < allowedDomains.length; i++) {
        // Makes the s optional in https
        var optionalSsl = this._sslOverride ? '?' : '';
        var mcSubdomain = allowedDomains[i] === 'exacttarget\\.com' ? 'mc\\.' : '';
        var whitelistRegex = new RegExp('^https' + optionalSsl + '://' + mcSubdomain + '([a-zA-Z0-9-]+\\.)*' + allowedDomains[i] + '(:[0-9]+)?$', 'i');

        if (whitelistRegex.test(origin)) {
            return true;
        }
    }

    return false;
};

if (typeof(window) === 'object') {
    window.sfdc = window.sfdc || {};
    window.sfdc.BlockSDK = SDK;

    // Example usage with additional functions

    // SDK initialization
    var sdk = new window.sfdc.BlockSDK({
        blockEditorWidth: 600,
        tabs: [
            'htmlblock',
            'stylingblock',
            'richTextField'
        ],
        onEditClose: function() {
            // Save content before closing the block
            updateContent();
        }
    });

    // Enable Edit Mode for Rich Text Editor
    function enableEditMode() {
        const richTextField = document.getElementById("richTextField").contentWindow.document;
        richTextField.designMode = "on";

        // Load the initial content from Salesforce Marketing Cloud
        sdk.getContent(function(content) {
            try {
                richTextField.open();
                richTextField.write(content || '');
                richTextField.close();

                // Set the initial content as the super content for preview
                sdk.setSuperContent(content, function(newSuperContent) {
                    console.log('Super Content set:', newSuperContent);
                });
            } catch (err) {
                console.error('Error loading content:', err);
            }
        });

        // Update live preview on rich text editor input events
        richTextField.addEventListener('input', function() {
            updateContent();
        });
    }

    // Update Content in Salesforce Marketing Cloud
    function updateContent() {
        const richTextField = document.getElementById("richTextField").contentWindow.document;
        var content = richTextField.body.innerHTML;
        sdk.setContent(content, function(updatedContent) {
            console.log('Updated Content:', updatedContent);
            sdk.setSuperContent(updatedContent, function(newSuperContent) {
                console.log('Super Content set:', newSuperContent);
            });
        });
    }

    // Initialize the editor when the document is ready
    document.addEventListener('DOMContentLoaded', function() {
        enableEditMode();
    });
}

if (typeof(module) === 'object') {
    module.exports = SDK;
}

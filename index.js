// Salesforce Marketing Cloud SDK Initialization
var SDK = function(config, whitelistOverride, sslOverride) {
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
        0: function() {}
    };
    this._readyToPost = false;
    this._pendingMessages = [];
    this._receiveMessage = this._receiveMessage.bind(this);

    window.addEventListener('message', this._receiveMessage, false);

    window.parent.postMessage({
        method: 'handShake',
        origin: window.location.origin,
        payload: config
    }, '*');
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

SDK.prototype.getCentralData = function(cb) {
    this.execute('getCentralData', {
        success: cb
    });
};

SDK.prototype.getContent = function(cb) {
    this.execute('getContent', {
        success: cb
    });
};

SDK.prototype.getData = function(cb) {
    this.execute('getData', {
        success: cb
    });
};

SDK.prototype.getUserData = function(cb) {
    this.execute('getUserData', {
        success: cb
    });
};

SDK.prototype.getView = function(cb) {
    this.execute('getView', {
        success: cb
    });
};

SDK.prototype.setBlockEditorWidth = function(value, cb) {
    this.execute('setBlockEditorWidth', {
        data: value,
        success: cb
    });
};

SDK.prototype.setCentralData = function(dataObj, cb) {
    this.execute('setCentralData', {
        data: dataObj,
        success: cb
    });
};

SDK.prototype.setContent = function(content, cb) {
    this.execute('setContent', {
        data: content,
        success: function(newContent) {
            if (cb) cb(newContent);
        },
        error: function(error) {
            console.error('Error setting content:', error);
        }
    });
};

SDK.prototype.setData = function(dataObj, cb) {
    this.execute('setData', {
        data: dataObj,
        success: cb
    });
};

SDK.prototype.setSuperContent = function(content, cb) {
    this.execute('setSuperContent', {
        data: content,
        success: function(newSuperContent) {
            if (cb) cb(newSuperContent);
        },
        error: function(error) {
            console.error('Error setting super content:', error);
        }
    });
};

SDK.prototype.triggerAuth = function(appID) {
    this.getUserData(function(userData) {
        var stack = userData.stack;
        if (stack.indexOf('qa') === 0) {
            stack = stack.substring(3, 5) + '.' + stack.substring(0, 3);
        }
        var iframe = document.createElement('IFRAME');
        iframe.src = 'https://mc.' + stack + '.exacttarget.com/cloud/tools/SSO.aspx?appId=' + appID + '&restToken=1&hub=1';
        iframe.style.width = '1px';
        iframe.style.height = '1px';
        iframe.style.position = 'absolute';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.visibility = 'hidden';
        iframe.className = 'authframe';
        document.body.appendChild(iframe);
    });
};

SDK.prototype.triggerAuth2 = function(authInfo) {
    var iframe = document.createElement('IFRAME');
    var scope = '';
    var state = '';
    if (Array.isArray(authInfo.scope)) {
        scope = '&scope=' + authInfo.scope.join('%20');
    }
    if (authInfo.state) {
        state = '&state=' + authInfo.state;
    }
    iframe.src = authInfo.authURL + (authInfo.authURL.endsWith('/') ? '' : '/') + 'v2/authorize?response_type=code&client_id=' + authInfo.clientId + '&redirect_uri=' + encodeURIComponent(authInfo.redirectURL) + scope + state;
    iframe.style.width = '1px';
    iframe.style.height = '1px';
    iframe.style.position = 'absolute';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.visibility = 'hidden';
    iframe.className = 'authframe';
    document.body.appendChild(iframe);
};

/* Internal Methods */

SDK.prototype._executePendingMessages = function() {
    var self = this;

    this._pendingMessages.forEach(function(thisMessage) {
        self.execute(thisMessage.method, {
            data: thisMessage.payload,
            success: thisMessage.callback
        });
    });

    this._pendingMessages = [];
};

SDK.prototype._post = function(payload, callback) {
    this._messages[this._messageId] = callback;
    payload.id = this._messageId;
    this._messageId += 1;
    // the actual postMessage always uses the validated origin
    window.parent.postMessage(payload, this._parentOrigin);
};

SDK.prototype._receiveMessage = function(message) {
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
    (this._messages[data.id || 0] || function() {})(data.payload);
    delete this._messages[data.id];
};

// the custom block should verify it is being called from the marketing cloud
SDK.prototype._validateOrigin = function(origin) {
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
        key: 'richTextField',
        tabs: [
            'htmlblock',
            'stylingblock'
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
            richTextField.open();
            richTextField.write(content || '');
            richTextField.close();

            // Set the initial content in Salesforce Marketing Cloud
            sdk.setContent(content, function(newContent) {
                console.log('Content set:', newContent);
                // Set the initial content as the super content for live preview
                sdk.setSuperContent(newContent, function(newSuperContent) {
                    console.log('Super Content set:', newSuperContent);
                    // After setting super content, update the preview area
                    updatePreview(newSuperContent);
                });
            });
        });
    }

    // Execute Rich Text Commands
    function execCommand(command) {
        const richTextField = document.getElementById("richTextField").contentWindow.document;
        richTextField.execCommand(command, false, null);

        // Update the content in Salesforce Marketing Cloud
        updateContent();
    }

    function execCommandWithValue(command, value) {
        const richTextField = document.getElementById("richTextField").contentWindow.document;
        richTextField.execCommand(command, false, value);

        // Update the content in Salesforce Marketing Cloud
        updateContent();
    }

    // Update Content in Salesforce Marketing Cloud
    function updateContent() {
        const richTextField = document.getElementById("richTextField").contentWindow.document;
        var content = richTextField.body.innerHTML;
        sdk.setContent(content, function(updatedContent) {
            console.log('Updated Content:', updatedContent);
            sdk.setSuperContent(updatedContent, function(newSuperContent) {
                console.log('Super Content set:', newSuperContent);
                // Update the preview area with new super content
                updatePreview(newSuperContent);
            });
        });
    }

    // Update live preview area with new content
    function updatePreview(content) {
        const previewArea = document.getElementById('livePreviewArea');
        previewArea.innerHTML = content;
    }

    // Initialize the editor when the document is ready
    document.addEventListener('DOMContentLoaded', function() {
        enableEditMode();
    });
}

if (typeof(module) === 'object') {
    module.exports = SDK;
}

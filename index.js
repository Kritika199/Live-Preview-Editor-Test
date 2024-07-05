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

SDK.prototype.execute = function(method, options) {
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

SDK.prototype.getContent = function(cb) {
    this.execute('getContent', {
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
            // execute method before closing block editing
            if (this.handlers && this.handlers.onEditClose) {
                this.handlers.onEditClose();
            }
            this.execute('blockReadyToClose');
            return;
        }
    }

    // ignore message if not from validated origin
    if (!this._parentOrigin || this._parentOrigin !== message.origin) {
        return;
    }
    // execute callback when message received
    (this._messages[data.id || 0] || function() {})(data.payload);
    delete this._messages[data.id];
};

SDK.prototype._validateOrigin = function(origin) {
    var allowedDomains = this._whitelistOverride || ['exacttarget\\.com', 'marketingcloudapps\\.com', 'blocktester\\.herokuapp\\.com'];

    for (var i = 0; i < allowedDomains.length; i++) {
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
            'richtextblock' // assuming 'richtextblock' is the ID of the rich text editor block
        ],
        onEditClose: function() {
            // Save content before closing the block
            updateContent();
        }
    });

    // Enable Edit Mode for Rich Text Editor
    function enableEditMode() {
        const richTextField = document.getElementById("richtextblock").contentWindow.document;
        richTextField.designMode = "on";

        // Load initial content from Salesforce Marketing Cloud
        sdk.getContent(function(content) {
            richTextField.open();
            richTextField.write(content || '');
            richTextField.close();

            // Set initial content and super content for live preview
            sdk.setContent(content, function(newContent) {
                console.log('Content set:', newContent);
                sdk.setSuperContent(newContent, function(newSuperContent) {
                    console.log('Super Content set:', newSuperContent);
                    // Update preview area with new super content
                    updatePreview(newSuperContent);
                });
            });
        });
    }

    // Execute Rich Text Commands
    function execCommand(command) {
        const richTextField = document.getElementById("richtextblock").contentWindow.document;
        richTextField.execCommand(command, false, null);

        // Update content and super content in Salesforce Marketing Cloud
        updateContent();
    }

    function execCommandWithValue(command, value) {
        const richTextField = document.getElementById("richtextblock").contentWindow.document;
        richTextField.execCommand(command, false, value);

        // Update content and super content in Salesforce Marketing Cloud
        updateContent();
    }

    // Update Content in Salesforce Marketing Cloud
    function updateContent() {
        const richTextField = document.getElementById("richtextblock").contentWindow.document;
        var content = richTextField.body.innerHTML;
        sdk.setContent(content, function(updatedContent) {
            console.log('Updated Content:', updatedContent);
            sdk.setSuperContent(updatedContent, function(newSuperContent) {
                console.log('Super Content set:', newSuperContent);
                // Update preview area with new super content
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

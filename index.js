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

SDK.prototype.getCentralData = function (cb) {
    this.execute('getCentralData', {
        success: cb
    });
};

// Separate methods for handling different block types

SDK.prototype.getHtmlBlockContent = function (cb) {
    this.execute('getHtmlBlockContent', {
        success: cb
    });
};

SDK.prototype.getStylingBlockContent = function (cb) {
    this.execute('getStylingBlockContent', {
        success: cb
    });
};

SDK.prototype.getRichTextEditorContent = function (cb) {
    this.execute('getRichTextEditorContent', {
        success: cb
    });
};

SDK.prototype.setHtmlBlockContent = function (content, cb) {
    this.execute('setHtmlBlockContent', {
        data: content,
        success: cb
    });
};

SDK.prototype.setStylingBlockContent = function (content, cb) {
    this.execute('setStylingBlockContent', {
        data: content,
        success: cb
    });
};

SDK.prototype.setRichTextEditorContent = function (content, cb) {
    this.execute('setRichTextEditorContent', {
        data: content,
        success: cb
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

SDK.prototype.triggerAuth2 = function (authInfo) {
    var iframe = document.createElement('IFRAME');
    var scope = '';
    var state = '';
    if(Array.isArray(authInfo.scope)) {
        scope = '&scope=' + authInfo.scope.join('%20');
    }
    if(authInfo.state) {
        state = '&state=' + authInfo.state;
    }
    iframe.src = authInfo.authURL + (authInfo.authURL.endsWith('/') ? '':'/') + 'v2/authorize?response_type=code&client_id=' + authInfo.clientId + '&redirect_uri=' + encodeURIComponent(authInfo.redirectURL) + scope + state;
    iframe.style.width= '1px';
    iframe.style.height = '1px';
    iframe.style.position = 'absolute';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.visibility = 'hidden';
    iframe.className = 'authframe';
    document.body.appendChild(iframe);
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
    this._messageId += 1;
    // the actual postMessage always uses the validated origin
    window.parent.postMessage(payload, this._parentOrigin);
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
        onEditClose: function() {
            // Save content before closing the block
            updateContent();
        }
    });

    // Enable Edit Mode for each type of block

    function enableHtmlBlockEditMode() {
        sdk.getHtmlBlockContent(function(content) {
            // Handle loading HTML block content
            console.log('HTML Block Content:', content);
            // Example: Load content into HTML block editor
        });
    }

    function enableStylingBlockEditMode() {
        sdk.getStylingBlockContent(function(content) {
            // Handle loading styling block content
            console.log('Styling Block Content:', content);
            // Example: Load content into styling block editor
        });
    }

    function enableRichTextEditorEditMode() {
        sdk.getRichTextEditorContent(function(content) {
            // Handle loading rich text editor content
            console.log('Rich Text Editor Content:', content);
            // Example: Load content into rich text editor
            const richTextField = document.getElementById("richTextField").contentWindow.document;
            richTextField.designMode = "on";
            richTextField.open();
            richTextField.write(content || '');
            richTextField.close();

            // Set the initial content as the super content for preview
            sdk.setSuperContent(content, function(newSuperContent) {
                console.log('Super Content set:', newSuperContent);
            });
        });
    }

    // Initialize the editors when the document is ready
    document.addEventListener('DOMContentLoaded', function() {
        enableHtmlBlockEditMode();
        enableStylingBlockEditMode();
        enableRichTextEditorEditMode();
    });
}

if (typeof(module) === 'object') {
    module.exports = SDK;
}

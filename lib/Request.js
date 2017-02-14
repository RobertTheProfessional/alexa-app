"use strict";
var Session_1 = require("./Session");
var Request = (function () {
    function Request(request_json) {
        this.data = request_json;
        this.sessionObject = new Session_1.Session(request_json.session);
        if (this.data.context) {
            this.userId = this.data.context.System.user.userId;
            this.applicationId = this.data.context.System.application.applicationId;
            this.context = this.data.context;
        }
        this.isSessionNew = this.hasSession() ? this.getSession().isNew() : false;
        this.sessionAttributes = this.getSession().attributes;
        this.sessionDetails = this.getSession().details;
        this.sessionId = this.getSession().sessionId;
    }
    Request.prototype.getSession = function () {
        return this.sessionObject;
    };
    Request.prototype.hasSession = function () {
        return this.sessionObject.isAvailable();
    };
    ;
    /**
     * Returns true if the type of the request is an AudioPlayer
     *
     * @returns {boolean}
     */
    Request.prototype.isAudioPlayer = function () {
        var requestType = this.type();
        return (requestType && 0 === requestType.indexOf("AudioPlayer."));
    };
    /**
     * Return the value passed in for a given slot name
     *
     * @param {string} slotName The key of the slot variable to retrieve
     * @param {any} [defaultValue] The default value to return if a value wasn't set for the key
     * @returns {any} The value of the slot variable
     *
     * @memberOf Request
     */
    Request.prototype.slot = function (slotName, defaultValue) {
        try {
            return this.data.request.intent.slots[slotName].value;
        }
        catch (e) {
            console.error("missing intent in request: " + slotName, e);
            return defaultValue;
        }
    };
    /**
     * Return the type of request received
     *
     * @returns {string} The request type
     *
     * @memberOf Request
     */
    Request.prototype.type = function () {
        if (!(this.data && this.data.request && this.data.request.type)) {
            console.error("missing request type:", this.data);
            return;
        }
        return this.data.request.type;
    };
    ///// Legacy Code Below /////
    /**
     * Return the value of a session variable
     *
     * @param {string} key The key of the session variable to retrieve
     * @returns {any} The value of the session variable
     *
     * @memberOf Request
     */
    Request.prototype.session = function (key) {
        return this.getSession().get(key);
    };
    return Request;
}());
exports.Request = Request;
//# sourceMappingURL=Request.js.map
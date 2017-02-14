"use strict";
var Session = (function () {
    function Session(session) {
        if (typeof session == 'undefined') {
            this.isNew = this.get = this.set = this.clear = function () {
                throw "NO_SESSION";
            };
            this.attributes = {};
            this.details = {};
            this.sessionId = null;
            return;
        }
        this._isAvailable = (typeof session != "undefined");
        this.details = {
            "accessToken": session.user.accessToken || null,
            "attributes": session.attributes,
            "application": session.application,
            "new": session.new,
            "sessionId": session.sessionId,
            "userId": session.user.userId
        };
        // persist all the session attributes across requests
        // the Alexa API doesn't think session variables should persist for the entire
        // duration of the session, but I do
        this.attributes = session.attributes || {};
        this.sessionId = session.sessionId;
    }
    Session.prototype.clear = function (key) {
        if (typeof key == "string" && typeof this.attributes[key] != "undefined") {
            delete this.attributes[key];
        }
        else {
            this.attributes = {};
        }
    };
    Session.prototype.get = function (key) {
        // getAttributes deep clones the attributes object, so updates to objects
        // will not affect the session until `set` is called explicitly
        return this.getAttributes()[key];
    };
    Session.prototype.getAttributes = function () {
        // deep clone attributes so direct updates to objects are not set in the
        // session unless `.set` is called explicitly
        return JSON.parse(JSON.stringify(this.attributes));
    };
    Session.prototype.isAvailable = function () {
        return this._isAvailable;
    };
    Session.prototype.isNew = function () {
        return (true === this.details.new);
    };
    Session.prototype.set = function (key, value) {
        this.attributes[key] = value;
    };
    return Session;
}());
exports.Session = Session;
//# sourceMappingURL=Session.js.map
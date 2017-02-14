var lib = require("./lib");

var alexa = {
    apps: {},
    app: function(name) {
        if (!(this instanceof alexa.app)) {
            throw new Error("Function must be called with the new keyword");
        }

        var application = new lib.Application(name);

        if (name) {
            alexa.apps[name] = application;
        }

        return application;
    },
    request: function (json) {
        return new lib.Request(json);
    },
    response: function(session) {
        return new lib.Response(session);
    },
    session: function(session) {
        return new lib.Session(session);
    }
};

module.exports = alexa;

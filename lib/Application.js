"use strict";
var AlexaUtterances = require("alexa-utterances");
var VerifierMiddleware = require("alexa-verifier-middleware");
var Promise = require("bluebird");
var BodyParser = require("body-parser");
var Defaults = require("lodash.defaults");
var Request_1 = require("./Request");
var Response_1 = require("./Response");
var Application = (function () {
    function Application(name) {
        var _this = this;
        /**
         * Several intents may use the same list of possible values, so you want to define
         * them in one place, not in each intent schema.
         *
         * @memberOf Application
         */
        this.dictionary = {};
        /**
         * Handler functions should not throw exceptions. Ideally, you should catch errors in
         * your handlers using try/catch and respond with an appropriate output to the user.
         *
         * If exceptions do leak out of handlers, they will be thrown by default. Any exceptions
         * can be handled by a generic error handler which you can define for your app. Error
         * handlers cannot be asynchronous.
         *
         * If you do want exceptions to bubble out to the caller (and potentially cause Express
         * to crash, for example), you can throw the exception.
         *
         * @memberOf Application
         */
        this.error = null;
        /**
         * If set to true, use the full cartesian product of utterances
         * else use a minimal set of utterances.
         *
         * @type {boolean}
         * @memberOf Application
         */
        this.exhaustiveUtterances = false;
        /**
         * Default error messages
         */
        this.messages = {
            // when an intent was passed in that the application was not configured to handle
            "NO_INTENT_FOUND": "Sorry, the application didn't know what to do with that intent",
            // when an AudioPlayer event was passed in that the application was not configured to handle
            "NO_AUDIO_PLAYER_EVENT_HANDLER_FOUND": "Sorry, the application didn't know what to do with that AudioPlayer event",
            // when the app was used with 'open' or 'launch' but no launch handler was defined
            "NO_LAUNCH_FUNCTION": "Try telling the application what to do instead of opening it",
            // when a request type was not recognized
            "INVALID_REQUEST_TYPE": "Error: not a valid request",
            // when a request and response don't contain session object
            // https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/alexa-skills-kit-interface-reference#request-body-parameters
            "NO_SESSION": "This request doesn't support session attributes",
            // if some other exception happens
            "GENERIC_ERROR": "Sorry, the application encountered an error"
        };
        /**
         * By default, alexa-app will persist every request session attribute into the response.
         * This way, any session attributes you set will be sent on every subsequent request,
         * as is typical in most web programming environments. If you wish to disable this
         * feature, you can do so.
         *
         * @type {boolean}
         * @memberOf Application
         */
        this.persistentSession = true;
        /**
         * The last thing executed for every request. It is even called if there is an
         * exception or if a response has already been sent.
         *
         * The post() function can change anything about the response. It can even turn a
         * response.fail() into a respond.send() with entirely new content.
         *
         * If post() is called after an exception is thrown, the exception itself will
         * be the last argument.
         *
         * @memberOf Application
         */
        this.post = function () { };
        /**
         * A function which is executed before any event handlers. This is useful to setup
         * new sessions, validate the applicationId, or do any other kind of validations.
         *
         * Note: The post() method still gets called, even if the pre() function calls
         * send() or fail(). The post method can always override anything done before it.
         *
         * @memberOf Application
         */
        this.pre = function () { };
        this.audioPlayerEventHandlers = {};
        this.intents = {};
        this.launchFunc = null;
        this.sessionEndedFunc = null;
        this.express = function (options) {
            if (!options.expressApp) {
                throw new Error("You must specify an express instance to attach to.");
            }
            if (!options.router) {
                throw new Error("You must specify an express router to attach.");
            }
            var defaultOptions = { endpoint: _this.name, checkCert: true, debug: false };
            options = Defaults(options, defaultOptions);
            var endpoint = "/" + options.endpoint;
            var router = options.router;
            options.expressApp.use(endpoint, router);
            if (options.debug) {
                options.router.get("/", function (req, res) {
                    if (typeof req.query["schema"] != "undefined") {
                        res.set("Content-Type", "text/plain").send(_this.schema());
                    }
                    else if (typeof req.query["utterances"] != "undefined") {
                        res.set("Content-Type", "text/plain").send(_this.utterances());
                    }
                    else {
                        res.render("test", {
                            "app": _this,
                            "schema": _this.schema(),
                            "utterances": _this.utterances()
                        });
                    }
                });
            }
            if (options.checkCert) {
                options.router.use(VerifierMiddleware({ strictHeaderCheck: true }));
            }
            else {
                options.router.use(BodyParser.json());
            }
            // expose POST /<endpoint> route
            router.post("/", function (req, res) {
                var json = req.body, response_json;
                // preRequest and postRequest may return altered request JSON, or undefined, or a Promise
                Promise.resolve(typeof options.preRequest == "function" ? options.preRequest(json, req, res) : json)
                    .then(function (json_new) {
                    if (json_new) {
                        json = json_new;
                    }
                    return json;
                })
                    .then(_this.request)
                    .then(function (app_response_json) {
                    response_json = app_response_json;
                    return Promise.resolve(typeof options.postRequest == "function" ? options.postRequest(app_response_json, req, res) : app_response_json);
                })
                    .then(function (response_json_new) {
                    response_json = response_json_new || response_json;
                    res.json(response_json).send();
                })
                    .catch(function (err) {
                    console.error(err);
                    res.status(500).send("Server Error");
                });
            });
        };
        /**
         * A built-in handler for AWS Lambda
         *
         * @param {any} event
         * @param {any} context
         *
         * @memberOf Application
         */
        this.handler = function (event, context) {
            _this.request(event)
                .then(function (response) {
                context.succeed(response);
            })
                .catch(function (response) {
                context.fail(response);
            });
        };
        /**
         * A backwards compatible handler for AWS Lambda
         *
         * @returns {(event:any, context:any) => any} AWS Lambda Handler
         *
         * @memberOf Application
         */
        this.lambda = function () {
            return _this.handler;
        };
        /**
         * Handle an Alexa request by accepting a JSON response and returning a Promise
         * containing the response JSON. Your calling environment should then insert
         * that into its response, whatever form it may take.
         *
         * @param {Object} request_json The raw Alexa request json
         * @returns {Promise<any>} A Promise containing the JSON response object
         *
         * @memberOf Application
         */
        this.request = function (request_json) {
            return new Promise(function (resolve, reject) {
                var request = new Request_1.Request(request_json);
                var response = new Response_1.Response(request.getSession());
                var requestType = request.type();
                // error handling when a request fails in any way
                var handleError = function (e) {
                    if (typeof _this.error == "function") {
                        _this.error(e, request, response);
                    }
                    else if (typeof e == "string" && _this.messages[e]) {
                        if (!request.isAudioPlayer()) {
                            response.say(_this.messages[e]);
                            response.send(e);
                        }
                        else {
                            response.fail(_this.messages[e]);
                        }
                    }
                    if (!response.resolved) {
                        if (e.message) {
                            response.fail("Unhandled exception: " + e.message + ".", e);
                        }
                        else {
                            response.fail("Unhandled exception.", e);
                        }
                    }
                };
                // prevent callback handler (request resolution) from being called multiple times
                var callbackHandlerCalled = false;
                // sends the request or handles an error if an error is passed into the callback
                var callbackHandler = function (e) {
                    if (callbackHandlerCalled) {
                        console.warn("Response has already been sent");
                        return;
                    }
                    callbackHandlerCalled = true;
                    if (e) {
                        handleError(e);
                    }
                    else {
                        response.send();
                    }
                };
                var postExecuted = false;
                // attach Promise resolve/reject functions to the response object
                response.send = function (exception) {
                    response.prepare();
                    // execute the post function if it hasn't been triggered yet
                    if (typeof _this.post == "function" && !postExecuted) {
                        postExecuted = true;
                        _this.post(request, response, requestType, exception);
                    }
                    // resolve the process
                    if (!response.resolved) {
                        response.resolved = true;
                        resolve(response.response);
                    }
                };
                response.fail = function (msg, exception) {
                    response.prepare();
                    // execute the post function if it hasn't been triggered yet
                    if (typeof _this.post == "function" && !postExecuted) {
                        postExecuted = true;
                        _this.post(request, response, requestType, exception);
                    }
                    if (!response.resolved) {
                        response.resolved = true;
                        reject(msg);
                    }
                };
                try {
                    // Trigger the pre-function handler
                    if (typeof _this.pre == "function") {
                        _this.pre(request, response, requestType);
                    }
                    if (!response.resolved) {
                        if ("IntentRequest" === requestType) {
                            var intent = request_json.request.intent.name;
                            if (typeof _this.intents[intent] != "undefined" && typeof _this.intents[intent]["function"] == "function") {
                                var intentResult = _this.intents[intent]["function"](request, response, callbackHandler);
                                if (intentResult && intentResult.then) {
                                    Promise.resolve(intentResult).asCallback(callbackHandler);
                                }
                                else if (false !== intentResult) {
                                    callbackHandler();
                                }
                                else {
                                    console.trace("NOTE: using `return false` for async intent requests is deprecated and will not work after the next major version");
                                }
                            }
                            else {
                                throw "NO_INTENT_FOUND";
                            }
                        }
                        else if ("LaunchRequest" === requestType) {
                            if (typeof _this.launchFunc == "function") {
                                var launchResult = _this.launchFunc(request, response, callbackHandler);
                                if (launchResult && launchResult.then) {
                                    Promise.resolve(launchResult).asCallback(callbackHandler);
                                }
                                else if (false !== launchResult) {
                                    callbackHandler();
                                }
                                else {
                                    console.trace("NOTE: using `return false` for async launch requests is deprecated and will not work after the next major version");
                                }
                            }
                            else {
                                throw "NO_LAUNCH_FUNCTION";
                            }
                        }
                        else if ("SessionEndedRequest" === requestType) {
                            if (typeof _this.sessionEndedFunc == "function") {
                                var sessionEndedResult = _this.sessionEndedFunc(request, response, callbackHandler);
                                if (sessionEndedResult && sessionEndedResult.then) {
                                    Promise.resolve(sessionEndedResult).asCallback(callbackHandler);
                                }
                                else if (false !== sessionEndedResult) {
                                    callbackHandler();
                                }
                                else {
                                    console.trace("NOTE: using `return false` for async session ended requests is deprecated and will not work after the next major version");
                                }
                            }
                            else {
                                response.send();
                            }
                        }
                        else if (request.isAudioPlayer()) {
                            var event_1 = requestType.slice(12);
                            var eventHandlerObject = _this.audioPlayerEventHandlers[event_1];
                            if (typeof eventHandlerObject != "undefined" && typeof eventHandlerObject["function"] == "function") {
                                var eventHandlerResult = eventHandlerObject["function"](request, response, callbackHandler);
                                if (eventHandlerObject && eventHandlerObject.then) {
                                    Promise.resolve(eventHandlerResult).asCallback(callbackHandler);
                                }
                                else if (false !== eventHandlerResult) {
                                    callbackHandler();
                                }
                                else {
                                    console.trace("NOTE: using `return false` for async audio player requests is deprecated and will not work after the next major version");
                                }
                            }
                            else {
                                response.send();
                            }
                        }
                        else {
                            throw "INVALID_REQUEST_TYPE";
                        }
                    }
                }
                catch (e) {
                    handleError(e);
                }
            });
        };
        /**
         * Return the complete generated intent schema.
         *
         * @returns {string} String representation of the intent schema's JSON object
         *
         * @memberOf Application
         */
        this.schema = function () {
            var schema = { "intents": [] };
            var intentName, intent, key;
            for (intentName in _this.intents) {
                intent = _this.intents[intentName];
                var intentSchema = { "intent": intent.name };
                if (intent.schema && intent.schema.slots && Object.keys(intent.schema.slots).length > 0) {
                    intentSchema["slots"] = [];
                    for (key in intent.schema.slots) {
                        intentSchema.slots.push({
                            "name": key,
                            "type": intent.schema.slots[key]
                        });
                    }
                }
                schema.intents.push(intentSchema);
            }
            return JSON.stringify(schema, null, 3);
        };
        this.name = name;
    }
    /**
     *
     * @param {string} eventName The audio player event to handle
     * @param {Function} func The function to trigger
     */
    Application.prototype.audioPlayer = function (eventName, func) {
        this.audioPlayerEventHandlers[eventName] = {
            "name": eventName,
            "function": func
        };
    };
    /**
     * Bind a function as the launch handler
     *
     * @param func Function to bind
     *
     * @memberOf Application
     */
    Application.prototype.launch = function (func) {
        this.launchFunc = func;
    };
    /**
     * Triggered when the user invokes the skill with the invocation name with
     * a command that maps to an intent. The object sent to the service includes
     * the specific intent intent and any defined slot values.
     *
     * Define the handler for multiple intents using multiple calls to intent().
     * Intent schema and sample utterances can also be passed to intent(), which is detailed below.
     *
     * Intent handlers that don't return an immediate response (because they
     * do some asynchronous operation) must return false. See example further below.
     *
     * @param {string} intentName The name of the intent to handle
     * @param {Object} schema The intent schema and sample utterances definitions for content generation
     * @param {Function} func The function that handles the intent
     *
     * @memberOf Application
     */
    Application.prototype.intent = function (intentName, schema, func) {
        if (schema === void 0) { schema = null; }
        if (typeof schema == "function") {
            func = schema;
            schema = null;
        }
        this.intents[intentName] = {
            "name": intentName,
            "function": func
        };
        if (schema) {
            this.intents[intentName].schema = schema;
        }
    };
    /**
     * Bind a function as the session ended handler
     *
     * @param func Function to bind
     *
     * @memberOf Application
     */
    Application.prototype.sessionEnded = function (func) {
        this.sessionEndedFunc = func;
    };
    /**
     * Return the complete generate sample utterances.
     *
     * @returns {string} String representation of the sample utterances
     *
     * @memberOf Application
     */
    Application.prototype.utterances = function () {
        var _this = this;
        var intentName, intent, out = "";
        for (intentName in this.intents) {
            intent = this.intents[intentName];
            if (intent.schema && intent.schema.utterances) {
                intent.schema.utterances.forEach(function (sample) {
                    var list = AlexaUtterances(sample, intent.schema.slots, _this.dictionary, _this.exhaustiveUtterances);
                    list.forEach(function (utterance) {
                        out += intent.name + "\t" + (utterance.replace(/\s+/g, " ")).trim() + "\n";
                    });
                });
            }
        }
        return out;
    };
    return Application;
}());
exports.Application = Application;
//# sourceMappingURL=Application.js.map
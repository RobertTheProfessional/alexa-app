import AlexaUtterances = require("alexa-utterances");
import VerifierMiddleware = require("alexa-verifier-middleware");
import Promise = require("bluebird");
import BodyParser = require("body-parser");
import Defaults = require("lodash.defaults");
import { Request } from "./Request";
import { Response } from "./Response";

export class Application {
	/**
	 * Several intents may use the same list of possible values, so you want to define
	 * them in one place, not in each intent schema.
	 *
	 * @memberOf Application
	 */
	public dictionary = {};

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
	public error: Function = null;

	/**
	 * If set to true, use the full cartesian product of utterances
	 * else use a minimal set of utterances.
	 *
	 * @type {boolean}
	 * @memberOf Application
	 */
	public exhaustiveUtterances: boolean = false;

	/**
	 * Default error messages
	 */
	public messages = {
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
	public persistentSession: boolean = true;

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
	public post: Function = () => {};

	/**
	 * A function which is executed before any event handlers. This is useful to setup
	 * new sessions, validate the applicationId, or do any other kind of validations.
	 *
	 * Note: The post() method still gets called, even if the pre() function calls
	 * send() or fail(). The post method can always override anything done before it.
	 *
	 * @memberOf Application
	 */
	public pre: Function = () => {};

	private audioPlayerEventHandlers = {};

	private intents = {};

	private launchFunc: Function = null;

	private name: string;

	private sessionEndedFunc: Function = null;

	constructor(name: string) {
		this.name = name;
	}

	/**
	 *
	 * @param {string} eventName The audio player event to handle
	 * @param {Function} func The function to trigger
	 */
	public audioPlayer(eventName: string, func: Function) {
		this.audioPlayerEventHandlers[eventName] = {
			"name": eventName,
			"function": func
		};
	}

	public express = (options) => {
		if (!options.expressApp) {
			throw new Error("You must specify an express instance to attach to.");
		}

		if (!options.router) {
			throw new Error("You must specify an express router to attach.");
		}

		const defaultOptions = { endpoint: this.name, checkCert: true, debug: false };

		options = Defaults(options, defaultOptions);

		let endpoint = `/${options.endpoint}`;
		let router = options.router;

		options.expressApp.use(endpoint, router);

		if (options.debug) {
			options.router.get("/", (req, res) => {
				if (typeof req.query["schema"] != "undefined") {
					res.set("Content-Type", "text/plain").send(this.schema());
				} else if (typeof req.query["utterances"] != "undefined") {
					res.set("Content-Type", "text/plain").send(this.utterances());
				} else {
					res.render("test", {
						"app": this,
						"schema": this.schema(),
						"utterances": this.utterances()
					});
				}
			});
		}

		if (options.checkCert) {
			options.router.use(VerifierMiddleware({ strictHeaderCheck: true }));
		} else {
			options.router.use(BodyParser.json());
		}

		// expose POST /<endpoint> route
		router.post("/", (req, res) => {
			let json = req.body,
				response_json;

			// preRequest and postRequest may return altered request JSON, or undefined, or a Promise
			Promise.resolve(typeof options.preRequest == "function" ? options.preRequest(json, req, res) : json)
				.then(json_new => {
					if (json_new) {
						json = json_new;
					}

					return json;
				})
				.then(this.request)
				.then(app_response_json => {
					response_json = app_response_json;

					return Promise.resolve(typeof options.postRequest == "function" ? options.postRequest(app_response_json, req, res) : app_response_json);
				})
				.then(response_json_new => {
					response_json = response_json_new || response_json;

					res.json(response_json).send();
				})
				.catch(err => {
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
	public handler = (event, context) => {
		this.request(event)
			.then(response => {
				context.succeed(response);
			})
			.catch(response => {
				context.fail(response);
			})
	};

	/**
	 * A backwards compatible handler for AWS Lambda
	 *
	 * @returns {(event:any, context:any) => any} AWS Lambda Handler
	 *
	 * @memberOf Application
	 */
	public lambda = () => {
		return this.handler;
	};

	/**
	 * Bind a function as the launch handler
	 *
	 * @param func Function to bind
	 *
	 * @memberOf Application
	 */
	public launch(func) {
		this.launchFunc = func;
	}

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
	public intent(intentName: string, schema = null, func?: Function) {
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
	}

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
	public request = (request_json): Promise<any> => {
		return new Promise((resolve: (response: Object) => void, reject: (reason: any) => void) => {
			const request = new Request(request_json);
			const response = new Response(request.getSession());
			const requestType = request.type();


			// error handling when a request fails in any way
			const handleError = (e) => {
				if (typeof this.error == "function") {
					this.error(e, request, response);
				} else if (typeof e == "string" && this.messages[e]) {
					if (!request.isAudioPlayer()) {
						response.say(this.messages[e]);
						response.send(e);
					} else {
						response.fail(this.messages[e]);
					}
				}

				if (!response.resolved) {
					if (e.message) {
						response.fail(`Unhandled exception: ${e.message}.`, e);
					} else {
						response.fail(`Unhandled exception.`, e);
					}
				}
			};

			// prevent callback handler (request resolution) from being called multiple times
			let callbackHandlerCalled = false;

			// sends the request or handles an error if an error is passed into the callback
			const callbackHandler = (e?) => {
				if (callbackHandlerCalled) {
					console.warn("Response has already been sent");
					return;
				}
				callbackHandlerCalled = true;

				if (e) {
					handleError(e);
				} else {
					response.send();
				}
			};

			let postExecuted = false;

			// attach Promise resolve/reject functions to the response object
			response.send = (exception) => {
				response.prepare();

				// execute the post function if it hasn't been triggered yet
				if (typeof this.post == "function" && !postExecuted) {
					postExecuted = true;
					this.post(request, response, requestType, exception);
				}

				// resolve the process
				if (!response.resolved) {
					response.resolved = true;
					resolve(response.response);
				}
			};
			response.fail = (msg, exception) => {
				response.prepare();

				// execute the post function if it hasn't been triggered yet
				if (typeof this.post == "function" && !postExecuted) {
					postExecuted = true;
					this.post(request, response, requestType, exception);
				}

				if (!response.resolved) {
					response.resolved = true;
					reject(msg);
				}
			};

			try {
				// Trigger the pre-function handler
				if (typeof this.pre == "function") {
					this.pre(request, response, requestType);
				}

				if (!response.resolved) {
					if ("IntentRequest" === requestType) {
						const intent = request_json.request.intent.name;

						if (typeof this.intents[intent] != "undefined" && typeof this.intents[intent]["function"] == "function") {
							const intentResult = this.intents[intent]["function"](request, response, callbackHandler);

							if (intentResult && intentResult.then) {
								Promise.resolve(intentResult).asCallback(callbackHandler);
							} else if (false !== intentResult) {
								callbackHandler();
							} else {
								console.trace("NOTE: using `return false` for async intent requests is deprecated and will not work after the next major version");
							}
						} else {
							throw "NO_INTENT_FOUND";
						}
					} else if ("LaunchRequest" === requestType) {
						if (typeof this.launchFunc == "function") {
							const launchResult = this.launchFunc(request, response, callbackHandler);

							if (launchResult && launchResult.then) {
								Promise.resolve(launchResult).asCallback(callbackHandler);
							} else if (false !== launchResult) {
								callbackHandler();
							} else {
								console.trace("NOTE: using `return false` for async launch requests is deprecated and will not work after the next major version");
							}
						} else {
							throw "NO_LAUNCH_FUNCTION";
						}
					} else if ("SessionEndedRequest" === requestType) {
						if (typeof this.sessionEndedFunc == "function") {
							const sessionEndedResult = this.sessionEndedFunc(request, response, callbackHandler);

							if (sessionEndedResult && sessionEndedResult.then) {
								Promise.resolve(sessionEndedResult).asCallback(callbackHandler);
							} else if (false !== sessionEndedResult) {
								callbackHandler();
							} else {
								console.trace("NOTE: using `return false` for async session ended requests is deprecated and will not work after the next major version");
							}
						} else {
							response.send();
						}
					} else if (request.isAudioPlayer()) {
						const event = requestType.slice(12);
						const eventHandlerObject = this.audioPlayerEventHandlers[event];

						if (typeof eventHandlerObject != "undefined" && typeof eventHandlerObject["function"] == "function") {
							const eventHandlerResult = eventHandlerObject["function"](request, response, callbackHandler);

							if (eventHandlerObject && eventHandlerObject.then) {
								Promise.resolve(eventHandlerResult).asCallback(callbackHandler);
							} else if (false !== eventHandlerResult) {
								callbackHandler();
							} else {
								console.trace("NOTE: using `return false` for async audio player requests is deprecated and will not work after the next major version");
							}
						} else {
							response.send();
						}
					} else {
						throw "INVALID_REQUEST_TYPE";
					}
				}
			} catch (e) {
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

	public schema = (): string => {
		const schema = { "intents": [] };

		let intentName, intent, key;

		for (intentName in this.intents) {
			intent = this.intents[intentName];

			let intentSchema: any = { "intent": intent.name };

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

	/**
	 * Bind a function as the session ended handler
	 *
	 * @param func Function to bind
	 *
	 * @memberOf Application
	 */
	public sessionEnded(func) {
		this.sessionEndedFunc = func;
	}

	/**
	 * Return the complete generate sample utterances.
	 *
	 * @returns {string} String representation of the sample utterances
	 *
	 * @memberOf Application
	 */
	public utterances(): string {
		let intentName, intent, out = "";

		for (intentName in this.intents) {
			intent = this.intents[intentName];

			if (intent.schema && intent.schema.utterances) {
				intent.schema.utterances.forEach(sample => {
					let list = AlexaUtterances(
						sample,
						intent.schema.slots,
						this.dictionary,
						this.exhaustiveUtterances
					);

					list.forEach(utterance => {
						out += intent.name + "\t" + (utterance.replace(/\s+/g, " ")).trim() + "\n";
					})
				})
			}
		}

		return out;
	}
}

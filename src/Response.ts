import { Session } from "./Session";
import { SSML } from "./to-ssml";

export class Response {
	/**
	 * Trigger a response failure
	 * The internal promise containing the response will be rejected, and should be handled by
	 * the calling environment. Instead of the Alexa response being returned, the failure
	 * message will be passed.
	 *
	 * @param {string} message The message to pass to the calling environment
	 *
	 * @memberOf Response
	 */
	public fail: (message: String, exception?: Object | any) => void = null;

	/**
	 * Indicates whether or not the callback or Promise has been completed successfully.
	 *
	 * @type {boolean}
	 * @memberOf Response
	 */
	public resolved: Boolean = false;

	/**
	 * The response to be sent to back to the agent
	 *
	 * @type {any}
	 * @memberOf Response
	 */
	public response: any = {
		"version": "1.0",
		"response": {
			"directives": [],
			"shouldEndSession": true
		}
	};

	/**
	 * Send the response as success
	 * You don't usually need to call this. This is only required if your handler is
	 * asynchronous - for example, if it makes an http request and needs to wait for
	 * the response, then send it back to Alexa when finished.
	 *
	 * @memberOf Response
	 */
	public send: (exception?: Object) => void = null;

	/**
	 * The session object
	 *
	 * @type {Session}
	 * @memberOf Response
	 */
	public sessionObject: Session;

	constructor(session: Session) {
		this.sessionObject = session;
	}

	public audioPlayerClearQueue(clearBehavior): Response {
		const audioPlayerDirective = {
			"type": "AudioPlayer.ClearQueue",
			"clearBehavior": clearBehavior || "CLEAR_ALL"
		};

		this.response["response"]["directives"].push(audioPlayerDirective);

		return this;
	}

	public audioPlayerPlay(playBehavior, audioItem): Response {
		const audioPlayerDirective = {
			"type": "AudioPlayer.Play",
			"playBehavior": playBehavior,
			"audioItem": audioItem
		};

		this.response["response"]["directives"].push(audioPlayerDirective);

		return this;
	}

	public audioPlayerPlayStream(playBehavior, stream): Response {
		const audioItem = {
			"stream": stream
		};

		return this.audioPlayerPlay(playBehavior, audioItem);
	}

	public audioPlayerStop(): Response {
		const audioPlayerDirective = {
			"type": "AudioPlayer.Stop"
		};

		this.response["response"]["directives"].push(audioPlayerDirective);

		return this;
	}

	/**
	 * Return a card to the user's Echo app
	 * For Object definition @see https://developer.amazon.com/public/solutions/alexa/alexa-skills-kit/docs/alexa-skills-kit-interface-reference#card-object
	 * Skill supports card(String title, String content) for backwards compat of type "Simple"
	 *
	 * @param {Object} card The card details to send to the user
	 * @returns {Response}
	 *
	 * @memberOf Response
	 */
	public card(card: any): Response {
		// Backwards Compatible
		if (2 == arguments.length) {
			card = {
				type: 'Simple',
				title: arguments[0],
				content: arguments[1]
			};
		}

		const requiredAttrs = [];
		const cleanseAttrs = [];

		switch (card['type']) {
			case 'Simple':
				requiredAttrs.push('content');
				cleanseAttrs.push('content');
				break;
			case 'Standard':
				requiredAttrs.push('text');
				cleanseAttrs.push('text');
				if (('image' in card) && ( !('smallImageUrl' in card['image']) && !('largeImageUrl' in card['image']) )) {
					console.error('If card.image is defined, must specify at least smallImageUrl or largeImageUrl');
					return this;
				}
				break;
			default:
				break;
		}

		const hasAllReq = requiredAttrs.every(idx => {
			if ( !(idx in card ) ) {
				console.error(`Card object is missing required attr "${idx}"`);
				return false;
			}

			return true;
		});

		if (!hasAllReq) {
			return this;
		}

		// Remove all SSML to keep the card clean
		cleanseAttrs.forEach(idx => {
			card[idx] = SSML.cleanse(card[idx]);
		});

		this.response['response']['card'] = card;
		return this;
	}

	/**
	 * Clear the output speech
	 *
	 * @returns {Response}
	 *
	 * @memberOf Response
	 */
	public clear(): Response {
		this.response['response']['outputSpeech'] = {
			"type": "SSML",
			"ssml": SSML.fromStr("")
		};

		return this;
	}

	/**
	 * Return a card instructing the user how to link their account to the skill.
	 * This internally sets the card response.
	 *
	 * @returns {Response}
	 *
	 * @memberOf Response
	 */
	public linkAccount(): Response {
		this.response['response']['card'] = {
			"type": "LinkAccount"
		};

		return this;
	}

	/**
	 * Prepare the response object
	 *
	 * @memberOf Response
	 */
	public prepare() {
		this.setSessionAttributes(this.sessionObject.getAttributes());
	}

	/**
	 * Tell Alexa to re-prompt the user for a response, if it didn't hear anything valid
	 *
	 * @param {String} str The phrase to speak back to the user
	 * @returns {Response}
	 *
	 * @memberOf Response
	 */
	public reprompt(str: string): Response {
		if (this.response['response']['reprompt'] == null) {
			this.response['response']['reprompt'] = {
				"outputSpeech": {
					"type": "SSML",
					"ssml": SSML.fromStr(str)
				}
			};
		} else {
			// append str to the current outputSpeech, stripping the out speak tag
			this.response['response']['reprompt']['outputSpeech']['ssml'] = SSML.fromStr(str, this.response['response']['reprompt']['outputSpeech']['text']);
		}

		return this;
	}

	/**
	 * Tell Alexa to say something. Multiple calls to say() will be appended to each other.
	 * All text output is treated as SSML
	 *
	 * @param {string} str The phrase to speak back to the user
	 * @returns {Response}
	 *
	 * @memberOf Response
	 */
	public say(str: string): Response {
		if (this.response['response']['outputSpeech'] == null) {
			this.response['response']['outputSpeech'] = {
				"type": "SSML",
				"ssml": SSML.fromStr(str)
			};
		} else {
			// append str to the current outputSpeech, stripping the out speak tag
			this.response['response']['outputSpeech']['ssml'] = SSML.fromStr(str, this.response['response']['outputSpeech']['ssml']);
		}

		return this;
	}

	/**
	 * Overwrite the session attributes with the object passed into this function.
	 *
	 * @param {any} attributes The new session attribute set
	 * @memberOf Response
	 */
	public setSessionAttributes(attributes) {
		this.response['sessionAttributes'] = attributes;
	}

	/**
	 * Tell Alexa whether the user's session is over. By default, sessions end.
	 * You can optionally pass a reprompt message
	 *
	 * @param {boolean} end Control whether or not sessions are over after this response is sent
	 * @param {string} [reprompt] The prompt to send to the user
	 * @returns {Response}
	 *
	 * @memberOf Response
	 */
	public shouldEndSession(end: boolean, reprompt?: string): Response {
		this.response['response']['shouldEndSession'] = end;
		if (reprompt) {
			this.reprompt(reprompt);
		}

		return this;
	}

	///// Legacy Code Below /////

	/**
	 * Set a session variable
	 * By default, Alexa only persists session variables to the next request. The alexa-app module
	 * makes session variables persist across multiple requests.
	 * @deprecated
	 *
	 * @param {string} attributeName The string to set as the key of the session variable
	 * @param {string} attributeValue The string to set as the value of the session variable
	 * @returns {Response}
	 *
	 * @memberOf Response
	 */
	public session(attributeName: string, attributeValue: any): Response {
		if (typeof attributeValue == "undefined") {
			return this.sessionObject.get(attributeName);
		} else {
			this.sessionObject.set(attributeName, attributeValue);
		}

		return this;
	}

	/**
	 * Pass a key to clear the key/value from the session store. If the function
	 * is called without any parameters ALL keys will be cleared!
	 * @deprecated
	 *
	 * @param {String} [attributeName] The key to clear from the session
	 * @returns {Response}
	 *
	 * @memberOf Response
	 */
	public clearSession(attributeName: string): Response {
		this.sessionObject.clear(attributeName);

		return this;
	}
}
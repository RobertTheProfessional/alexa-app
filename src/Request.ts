import { Session } from "./Session";

export class Request {
	private applicationId: string;

	private context;

	private data;

	private sessionObject: Session;

	private userId: string;

	constructor(request_json) {
		this.data = request_json;

		this.sessionObject = new Session(request_json.session);

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

	public getSession() {
		return this.sessionObject;
	}

	public hasSession() {
		return this.sessionObject.isAvailable();
	};

	/**
	 * Returns true if the type of the request is an AudioPlayer
	 *
	 * @returns {boolean}
	 */
	public isAudioPlayer(): boolean {
		let requestType = this.type();

		return (requestType && 0 === requestType.indexOf("AudioPlayer."));
	}

	/**
	 * Return the value passed in for a given slot name
	 *
	 * @param {string} slotName The key of the slot variable to retrieve
	 * @param {any} [defaultValue] The default value to return if a value wasn't set for the key
	 * @returns {any} The value of the slot variable
	 *
	 * @memberOf Request
	 */
	public slot(slotName: string, defaultValue?: any) {
		try {
			return this.data.request.intent.slots[slotName].value;
		} catch (e) {
			console.error(`missing intent in request: ${slotName}`, e);
			return defaultValue;
		}
	}

	/**
	 * Return the type of request received
	 *
	 * @returns {string} The request type
	 *
	 * @memberOf Request
	 */
	public type(): string {
		if (!(this.data && this.data.request && this.data.request.type)) {
			console.error("missing request type:", this.data);
			return;
		}

		return this.data.request.type;
	}

	///// Legacy Code Below /////

	/**
	 * Return the value of a session variable
	 *
	 * @param {string} key The key of the session variable to retrieve
	 * @returns {any} The value of the session variable
	 *
	 * @memberOf Request
	 */
	public session(key: string | any) {
		return this.getSession().get(key);
	}

	/**
	 * Indicates whether or not this is a user's first session
	 * @deprecated
	 *
	 * @type {Boolean}
	 * @memberOf Request
	 */
	public isSessionNew: boolean;

	/**
	 * Attributes and variables persisted throughout an agent's session.
	 * @deprecated
	 *
	 * @type {Object}
	 * @memberOf Request
	 */
	public sessionAttributes;

	/**
	 * Session details, as passed by Amazon in the request.
	 * @deprecated
	 *
	 * @type {Object}
	 * @memberOf Request
	 */
	public sessionDetails;

	/**
	 * The session ID
	 * @deprecated
	 *
	 * @type {String}
	 * @memberOf Request
	 */
	public sessionId: string;
}
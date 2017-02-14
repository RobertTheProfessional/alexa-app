/**
 Copyright 2015 Rick Wargo. All Rights Reserved.

 Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance with the License. A copy of the License is located at

 http://aws.amazon.com/apache2.0/

 or in the "license" file accompanying this file. This file is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */

// Util functions for generating valid SSML from plain text
// ========================================================
export class SSML {
	public static fromStr(str: String, current_ssml?: String): String {
		// remove any <speak> tags from the input string, if they exist. There can only be one set of <speak> tags.
		str = str || "";
		str = str.replace(/<speak>/gi, " ").replace(/<\/speak>/gi, " ").trim();

		// and remove them from the concatenated string, if exists
		current_ssml = current_ssml || "";
		current_ssml = current_ssml.replace(/<speak>/gi, " ").replace(/<\/speak>/gi, " ").trim();

		// TODO: Need a library with how to easily construct these statements with appropriate spacing, etc.
		// TODO: make sure all attribute values are surrounded by "..."
		var ssml_str = "<speak>" + current_ssml + (current_ssml === "" ? "" : " ") + str + "</speak>";

		return ssml_str.replace(/  +/, " ");
	}

	public static cleanse(str): String {
		return str.replace(/<\/?(speak|break|phoneme|audio|say-as|s\b|w\b)[^>]*>/gi, " ")
			.replace(/\s*\n\s*/g, "\n")
			.replace(/  +/g, " ")
			.replace(/ ([.,!?;:])/g, "$1")
			.trim();
	}
}

export const change_code = 1;
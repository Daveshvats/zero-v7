import crypto from "node:crypto";
import { createOpenApiFetchClient } from "feature-fetch";
const baseUrl = process.env.SR_ITSROSE_API_URL;
const apiKey = process.env.SR_ITSROSE_API_KEY;

if (!baseUrl || !apiKey) {
        throw new Error("SR_ITSROSE_API_URL and SR_ITSROSE_API_KEY environment variables are required");
}

const fetchClient = createOpenApiFetchClient({
  prefixUrl: baseUrl,
  headers: {
    authorization: "Bearer " + apiKey
  }
});
// NOTE: Monkey-patching FormData.prototype for `feature-fetch` library compatibility.
// _generateBoundary and getBoundary are not standard on Node's native FormData.
// Potential side effects: may conflict with other libraries that also patch FormData.prototype.
FormData.prototype._generateBoundary = function() {
  this._boundary = "-".repeat(26) + crypto.randomBytes(12).toString("hex");
};
FormData.prototype.getBoundary = function() {
  if (!this._boundary) {
    this._generateBoundary();
  }
  return this._boundary;
};

export {
  fetchClient
};
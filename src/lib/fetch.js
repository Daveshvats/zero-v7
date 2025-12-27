import crypto from "node:crypto";
import { createOpenApiFetchClient } from "feature-fetch";
const baseUrl =process.env.SR_ITSROSE_API_URL 
const apiKey = process.env.SR_ITSROSE_API_KEY 
const fetchClient = createOpenApiFetchClient({
  prefixUrl: baseUrl,
  headers: {
    authorization: "Bearer " + apiKey
  }
});
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
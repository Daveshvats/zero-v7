// lib/legal.js
// Terms of Service and Privacy Notice for the WhatsApp bot.
// Update the placeholders (owner info, contact email) before deploying.

export const TERMS_OF_SERVICE = `
*TERMS OF SERVICE*

1. *User Responsibility:* You are solely responsible for the content you generate, upload, or share using this bot.

2. *Prohibited Uses:* You agree NOT to use this bot for:
   - Child Sexual Abuse Material (CSAM) (Zero Tolerance).
   - Non-consensual intimate images ("Revenge Porn").
   - Violence, hate speech, or illegal acts.
   - Copyright infringement.

3. *Age Restriction:* You must be 18+ to use this service.

4. *Indemnification:* You agree to indemnify the bot owner against legal claims arising from your use.

5. *Right to Ban:* We reserve the right to ban users without warning for violating these terms.

Type *I agree* to accept these terms and proceed.
`.trim();

export const PRIVACY_NOTICE = `
*PRIVACY NOTICE (AVISO DE PRIVACIDAD)*

1. *Responsible:* [Your Name/Entity], Server Location: Mexico.
2. *Data Collected:* WhatsApp number and message content for processing requests.
3. *Third-Party Services:* Requests are sent to external AI APIs. We do not control their data practices.
4. *Data Retention:* We do not store conversations long-term. Logs are deleted automatically.
5. *Your Rights (ARCO):* You have the right to Access, Rectify, Cancel, or Oppose your data. Contact: [Your Email].
`.trim();

/**
 * Admin number for receiving reports.
 * Replace with the actual owner JID (e.g., "1234567890@s.whatsapp.net").
 */
// NOTE: Available for future admin notification features
export const ADMIN_NUMBER = process.env.ADMIN_NUMBER || "0@s.whatsapp.net";

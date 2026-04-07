import { TERMS_OF_SERVICE } from "#lib/legal";

export default {
	name: "terms",
	description: "View the Terms of Service",
	command: ["terms"],
	permissions: "all",
	hidden: false,
	failed: "Failed to show %command: %error",
	category: "info",
	cooldown: 5,
	usage: "$prefix$command",
	react: true,
	wait: null,

	execute: async (m) => {
		await m.reply(TERMS_OF_SERVICE);
	},
};

import { PRIVACY_NOTICE } from "#lib/legal";

export default {
	name: "privacy",
	description: "View the Privacy Notice",
	command: ["privacy"],
	permissions: "all",
	hidden: false,
	failed: "Failed to show %command: %error",
	category: "info",
	cooldown: 5,
	usage: "$prefix$command",
	react: true,
	wait: null,

	execute: async (m) => {
		await m.reply(PRIVACY_NOTICE);
	},
};

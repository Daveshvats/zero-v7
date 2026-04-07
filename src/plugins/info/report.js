import { ADMIN_NUMBER } from "#lib/legal";

export default {
	name: "report",
	description: "Report an issue to the bot admin",
	command: ["report"],
	permissions: "all",
	hidden: false,
	failed: "Failed to send %command: %error",
	category: "info",
	cooldown: 30,
	usage: "$prefix$command <reason>",
	react: true,
	wait: null,

	execute: async (m, { sock }) => {
		if (!m.text) {
			await m.reply("Please provide a reason for your report.\n\nUsage: .report <reason>");
			return;
		}

		const senderNumber = m.sender.split("@")[0];
		const timestamp = new Date().toLocaleString();

		const reportMessage =
			`*📋 USER REPORT*\n\n` +
			`📌 *From:* @${senderNumber}\n` +
			`🕐 *Time:* ${timestamp}\n` +
			`💬 *Reason:* ${m.text}\n` +
			`📛 *Chat:* ${m.isGroup ? "Group" : "Private"} ${m.from}`;

		try {
			await sock.sendMessage(ADMIN_NUMBER, {
				text: reportMessage,
				contextInfo: {
					mentionedJid: [m.sender],
				},
			});
			await m.reply("Your report has been sent to the admin. Thank you!");
		} catch (error) {
			await m.reply("Failed to send report. Please try again later.");
		}
	},
};

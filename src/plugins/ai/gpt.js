export default {
	name: "gpt",
	description: "Chat with AI.",
	command: ["ai", "gpt"],
	permissions: "all",
	hidden: false,
	failed: "Failed to execute %command: %error",
	wait: null,
	category: "ai",
	cooldown: 5,
	limit: false,
	usage: "$prefix$command <text>",
	react: true,
	botAdmin: false,
	group: false,
	private: false,
	owner: false,

	/**
	 * @param {import('baileys').WASocket} sock - The Baileys socket object.
	 * @param {object} m - The serialized message object.
	 */
	execute: async (m, { api }) => {
		let query = m.text;
		if (m.quoted?.text.length > 0 && query.length > 0) {
			query += "\n\n" + m.quoted.text;
		} else if (query.length == 0 && m.quoted?.text.length > 0) {
			query = m.quoted.text;
		}

		const { data } = await api.Gratis.post("/gpt/chat", {
			model: "gpt-4o-mini",
			messages: [
				{ role: "developer", content: "You are a helpful assistant." },
				{ role: "user", content: query },
			],
		});

		const { status, message, result } = data;

		if (!status) {
			return m.reply(message);
		}

		await m.reply(result.choices[0].message.content);
	},
};

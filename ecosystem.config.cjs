module.exports = {
	apps: [
		{
			script: "src/main.js",
			name: "Katsumi",
			node_args: "--env-file .env --max-old-space-size=256",
			max_memory_restart: "300M",
			exp_backoff_restart_delay: 1000,
			min_uptime: 5000,
			max_restarts: 10,
			watch: false,
			instances: 1,
			exec_mode: "fork",
			log_date_format: "YYYY-MM-DD HH:mm:ss Z",
			error_file: "logs/pm2-error.log",
			out_file: "logs/pm2-out.log",
			combine_logs: true,
			merge_logs: true,
			log_type: "json",
			time: true,
			kill_timeout: 30000,
			wait_ready: true,
			listen_timeout: 10000,
			env: {
				NODE_ENV: "production",
				LOG_LEVEL: "INFO",
			},
			env_development: {
				NODE_ENV: "development",
				LOG_LEVEL: "DEBUG",
			},
		},
	],
	deploy: {
		production: {
			"post-deploy": "npm install && pm2 reload ecosystem.config.cjs --env production",
		},
	},
};

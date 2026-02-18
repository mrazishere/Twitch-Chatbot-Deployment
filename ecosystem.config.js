require('dotenv').config();

module.exports = {
  apps: [
    {
      name: "Twitch-Bot-Enrollment",
      script: "bot-deployment.js",
      cwd: __dirname,
      watch: ["bot-deployment.js"],
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      max_memory_restart: '200M'
    },
    {
      name: "CountD Overlay",
      script: "countd.js",
      cwd: __dirname,
      watch: ["countd.js"],
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      max_memory_restart: '200M'
    },
    {
      name: "OAuth Token Manager",
      script: "oauth-service.js",
      cwd: __dirname,
      watch: ["oauth-service.js"],
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      max_memory_restart: '200M'
    },
    {
      name: "EventSub Manager",
      script: "eventsub-service.js",
      cwd: __dirname,
      watch: ["eventsub-service.js"],
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      max_memory_restart: '200M',
      env: {
        BOT_FULL_PATH: __dirname
      }
    }
  ]
}
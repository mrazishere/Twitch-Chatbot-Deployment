require('dotenv').config();

module.exports = {
  apps: [
    {
      name: "Bot-Deployment-Manager",
      watch: [`${process.env.BOT_FULL_PATH}/bot-deployment.js`],
      script: `${process.env.BOT_FULL_PATH}/bot-deployment.js`,
      log_date_format: "YYYY-MM-DD",
      max_memory_restart: '200M'
    },
    {
      name: "CountD Overlay",
      watch: [`${process.env.BOT_FULL_PATH}/countd.js`],
      script: `${process.env.BOT_FULL_PATH}/countd.js`,
      log_date_format: "YYYY-MM-DD",
      max_memory_restart: '200M'
    },
    {
      name: "OAuth Token Manager",
      watch: [`${process.env.BOT_FULL_PATH}/oauth-service.js`],
      script: `${process.env.BOT_FULL_PATH}/oauth-service.js`,
      log_date_format: "YYYY-MM-DD",
      max_memory_restart: '200M'
    }
  ]
}
require('dotenv').config();

module.exports = {
  apps: [
    {
      name: "Bot-Deployment-Manager",
      watch: [`${process.env.BOT_FULL_PATH}/bot-deployment.js`],
      script: `${process.env.BOT_FULL_PATH}/bot-deployment.js`,
      log_date_format: "YYYY-MM-DD",
      max_memory_restart: '200M'
    }
  ]
}
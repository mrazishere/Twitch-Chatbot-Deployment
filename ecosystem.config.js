require('dotenv').config();

module.exports = {
  apps: [
    {
      name: "Enrolment-Manager",
      watch: [`${process.env.BOT_FULL_PATH}/bot-deployment.js`],
      script: `${process.env.BOT_FULL_PATH}/bot-deployment.js`,
      log_date_format: "YYYY-MM-DD",
      max_memory_restart: '200M'
    },
    {
      name: "Bot-Owner",
      watch: [`${process.env.BOT_FULL_PATH}/channels/${process.env.TWITCH_USERNAME}.js`],
      script: `${process.env.BOT_FULL_PATH}/channels/${process.env.TWITCH_USERNAME}.js`,
      log_date_format: "YYYY-MM-DD",
      max_memory_restart: '200M'
    }
  ]
}
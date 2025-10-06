/**
 * Telegram Notification Helper
 * Sends DM notifications via existing Telegram bot
 */

const axios = require('axios');

class TelegramNotifier {
    constructor() {
        this.botToken = process.env.TELEGRAM_BOT_TOKEN;
        this.chatId = process.env.TELEGRAM_CHAT_ID;
        this.enabled = !!(this.botToken && this.chatId);

        if (!this.enabled) {
            console.log('ℹ️  Telegram notifications disabled (no TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)');
        } else {
            console.log('✅ Telegram notifications enabled - will send DMs to user ID:', this.chatId);
        }
    }

    async sendMessage(message, options = {}) {
        if (!this.enabled) {
            return false;
        }

        try {
            const response = await axios.post(
                `https://api.telegram.org/bot${this.botToken}/sendMessage`,
                {
                    chat_id: this.chatId,
                    text: message,
                    parse_mode: options.parseMode || 'HTML',
                    disable_notification: options.silent || false
                },
                { timeout: 5000 }
            );

            console.log('✅ Telegram DM sent successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to send Telegram DM:', error.message);
            return false;
        }
    }

    // Bot token expiry notification
    async notifyBotTokenExpiry(daysLeft, hoursLeft = 0) {
        if (!this.enabled) return false;

        let emoji = '⚠️';
        let urgency = 'Warning';

        if (daysLeft <= 0) {
            emoji = '🚨';
            urgency = 'CRITICAL';
        } else if (daysLeft <= 2) {
            emoji = '🔴';
            urgency = 'URGENT';
        } else if (daysLeft <= 7) {
            emoji = '🟠';
            urgency = 'Alert';
        }

        const timeRemaining = daysLeft > 0
            ? `${daysLeft} days`
            : hoursLeft > 0
                ? `${hoursLeft} hours`
                : 'EXPIRED';

        const message = `
${emoji} <b>Twitch Bot Token Expiry ${urgency}</b>

<b>Time Remaining:</b> ${timeRemaining}
<b>Bot Account:</b> ${process.env.TWITCH_USERNAME || 'Unknown'}

<b>Action Required:</b>
${daysLeft <= 0
    ? '🚨 <b>Token has EXPIRED!</b> All Twitch bots are offline!\n\nRenew IMMEDIATELY at:'
    : daysLeft <= 2
        ? '⚠️ <b>Renew immediately!</b> Bots will stop working in less than 48 hours!\n\nRenewal URL:'
        : daysLeft <= 7
            ? 'Please renew the bot token soon.\n\nRenewal URL:'
            : 'Bot token renewal recommended.\n\nRenewal URL:'}
https://mr-ai.dev/auth/bot-token

<i>Tip: Make sure you're logged into Twitch as @${process.env.TWITCH_USERNAME} before generating</i>
        `.trim();

        return await this.sendMessage(message, {
            silent: daysLeft > 7 // Only make noise for urgent notifications
        });
    }

    // Test notification
    async sendTestNotification() {
        if (!this.enabled) {
            return { success: false, message: 'Telegram not configured' };
        }

        const testMessage = `
🔔 <b>Telegram Notification Test</b>

✅ Notifications are working correctly!

<b>Bot:</b> ${process.env.TWITCH_USERNAME || 'Unknown'}
<b>Server:</b> ${require('os').hostname()}
<b>Time:</b> ${new Date().toLocaleString()}
        `.trim();

        const sent = await this.sendMessage(testMessage);
        return {
            success: sent,
            message: sent ? 'Test notification sent!' : 'Failed to send notification'
        };
    }
}

module.exports = TelegramNotifier;

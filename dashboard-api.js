// dashboard-api.js
// Web config for the per-channel bots: everything `!config`, `!acomm` and
// `!addme` do in chat, as a JSON API under /twitch/api/bot. Mounted by
// oauth-service.js, which owns the Twitch login session.
//
// A streamer manages only their own channel; the bot owner manages any.

const fs = require('fs').promises;
const path = require('path');
const { execFile } = require('child_process');
const axios = require('axios');
const ct = require('countries-and-timezones');
const cityTimezones = require('city-timezones');

// Same bounds the channel bots enforce (new-template-hybrid-conduit.js).
const USERNAME_RE = /^[a-z0-9_]{4,25}$/;
// channel-configs/ also holds oauth.json; a channel of that name must not reach it.
const RESERVED_NAMES = new Set(['oauth']);
const MAX_TIMEOUT_SECONDS = 1209600; // 14 days, Twitch's limit
const MAX_PROMPT_LENGTH = 2000;
const LOG_TAIL_BYTES = 64 * 1024;
const LOG_TAIL_LINES = 200;

// What each module in bot-commands/ answers to, for the command toggles.
// A module missing here still gets a toggle, labelled with its file name.
const COMMAND_INFO = {
    advice: ['!advice', 'Random advice'],
    anime: ['!anime', 'Anime quotes'],
    catfacts: ['!catfacts', 'Cat facts'],
    claude: ['!claude, !research', 'Claude AI chat and web research'],
    clock: ['!clock', 'Local time at the channel location'],
    countd: ['!countd', 'Named countdown timers and the overlay'],
    customC: ['!acomm, !ecomm, !dcomm, !lcomm', 'Custom commands'],
    dad: ['!dad', 'Dad jokes'],
    dictionary: ['!define', 'Word definitions'],
    dogfacts: ['!dogfacts', 'Dog facts'],
    forex: ['!forex', 'Currency conversion'],
    jokes: ['!jokes', 'Jokes'],
    moderation: ['!timeout, !ban, !unban', 'Moderation commands'],
    numfacts: ['!numfacts', 'Number facts'],
    partyMatchmaking: ['!mm', 'Viewer team matchmaking'],
    ping: ['!ping', 'Bot status and uptime'],
    pokecatch: ['!catch', 'Catch a random Pokemon'],
    snipecd: ['!snipecd, !cancelcd', 'Snipe game countdown'],
    translate: ['!<language code>', 'Translation'],
    weather: ['!weather', 'Weather at the channel location'],
    wordle: ['!wordle', 'Wordle in chat']
};

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function mount(app, deps) {
    const baseDir = deps.baseDir || __dirname;
    const pm2Bin = deps.pm2Bin || 'pm2';
    const eventSubPort = deps.eventSubPort || 3003;
    const maxChannels = parseInt(process.env.MAX_CHANNELS, 10) || 30;

    const configDir = path.join(baseDir, 'channel-configs');
    const channelsDir = path.join(baseDir, 'channels');
    const customDir = path.join(baseDir, 'bot-commands', 'custom');
    const ecosystemPath = path.join(channelsDir, 'ecosystem.config.js');

    // ---------- helpers ----------

    const admins = () => [process.env.TWITCH_OWNER, process.env.TWITCH_USERNAME]
        .filter(Boolean).map(name => name.toLowerCase());

    function isAdmin(req) {
        return admins().includes(req.session.user.login.toLowerCase());
    }

    function validChannel(name) {
        return typeof name === 'string' && USERNAME_RE.test(name) && !RESERVED_NAMES.has(name);
    }

    function requireSession(req, res, next) {
        if (!req.session || !req.session.user) {
            return res.status(401).json({ error: 'Not signed in' });
        }
        next();
    }

    // Resolves :channel and checks the signed-in user may manage it.
    function requireChannel(req, res, next) {
        const channel = String(req.params.channel || '').toLowerCase();
        if (!validChannel(channel)) {
            return res.status(400).json({ error: 'Invalid channel name' });
        }
        if (channel !== req.session.user.login.toLowerCase() && !isAdmin(req)) {
            return res.status(403).json({ error: 'You can only manage your own channel' });
        }
        req.channel = channel;
        next();
    }

    // The session cookie alone must not be enough to change anything: a custom
    // header cannot be sent cross-site without a CORS preflight, which we never grant.
    function requireSameSite(req, res, next) {
        if (req.get('x-requested-with') !== 'twitch-dashboard') {
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    }

    const handle = fn => (req, res) => {
        Promise.resolve(fn(req, res)).catch(error => {
            if (error instanceof HttpError) {
                return res.status(error.status).json({ error: error.message });
            }
            console.error(`Dashboard API ${req.method} ${req.path} failed:`, error.message);
            res.status(500).json({ error: 'Something went wrong. Check the service log.' });
        });
    };

    async function readJson(file, fallback) {
        try {
            return JSON.parse(await fs.readFile(file, 'utf8'));
        } catch (error) {
            if (error.code === 'ENOENT') return fallback;
            throw error;
        }
    }

    function defaultConfig(channel) {
        return {
            channelName: channel,
            chatOnly: false,
            moderationEnabled: true,
            clientId: process.env.TWITCH_CLIENTID,
            moderatorUsername: process.env.TWITCH_USERNAME,
            lastUpdated: null,
            redemptionEnabled: false,
            redemptionRewardId: null,
            redemptionTimeoutDuration: 60,
            testMode: false,
            specialUsers: [],
            timeoutUsers: [],
            excludedCommands: []
        };
    }

    const configPath = channel => path.join(configDir, `${channel}.json`);
    const customPath = channel => path.join(customDir, `${channel}.json`);

    // One write at a time per channel, each starting from the file as it is now,
    // so two saves from the page (or a save racing `!config` in chat) cannot
    // overwrite each other with a stale copy.
    const writeQueues = new Map();
    function updateConfig(channel, mutate) {
        const run = async () => {
            const config = { ...defaultConfig(channel), ...(await readJson(configPath(channel), {})) };
            await mutate(config);
            config.lastUpdated = new Date().toISOString();
            await fs.mkdir(configDir, { recursive: true });
            await fs.writeFile(configPath(channel), JSON.stringify(config, null, 2));
            return config;
        };
        const next = (writeQueues.get(channel) || Promise.resolve()).then(run, run);
        writeQueues.set(channel, next.catch(() => {}));
        return next;
    }

    // ---------- pm2 ----------

    function pm2(args) {
        return new Promise((resolve, reject) => {
            execFile(pm2Bin, args, { maxBuffer: 16 * 1024 * 1024, timeout: 30000 }, (error, stdout) => {
                if (error) return reject(new Error(`pm2 ${args[0]} failed: ${error.message}`));
                resolve(stdout);
            });
        });
    }

    async function pm2List() {
        const out = await pm2(['jlist']);
        // pm2 can print notices before the JSON.
        return JSON.parse(out.slice(out.indexOf('[')));
    }

    async function botProcess(channel) {
        const proc = (await pm2List()).find(p => p.name === `twitch-${channel}`);
        if (!proc) return null;
        const env = proc.pm2_env || {};
        return {
            status: env.status,
            watching: Array.isArray(env.watch) ? env.watch.length > 0 : !!env.watch,
            uptime: env.status === 'online' ? env.pm_uptime : null,
            restarts: env.restart_time || 0,
            memory: proc.monit ? proc.monit.memory : null
        };
    }

    // The bot reads its config once at start. Most bots are restarted by pm2's
    // watch on the config file; one started without the watch needs it done here.
    async function applyConfigChange(channel) {
        const proc = await botProcess(channel);
        if (!proc || proc.status !== 'online') return false;
        if (!proc.watching) await pm2(['restart', `twitch-${channel}`]);
        return true;
    }

    async function notifyEventSub(channel) {
        try {
            await axios.post(`http://localhost:${eventSubPort}/reconnect`, { channels: [channel] }, { timeout: 10000 });
        } catch (error) {
            console.error(`Dashboard: EventSub reconnect for ${channel} failed:`, error.message);
        }
    }

    // ---------- settings ----------

    function parseUserList(value, label) {
        if (!Array.isArray(value)) throw new HttpError(400, `${label} must be a list`);
        const names = [...new Set(value.map(name => String(name).trim().toLowerCase().replace(/^@/, '')).filter(Boolean))];
        const bad = names.find(name => !USERNAME_RE.test(name));
        if (bad) throw new HttpError(400, `${label}: "${bad}" is not a valid Twitch username`);
        if (names.length > 100) throw new HttpError(400, `${label}: at most 100 users`);
        return names;
    }

    // Country, then state/province, then city: the same order and matching as
    // `!config location set` in the channel bot, so both give the same answer.
    function resolveLocation(raw) {
        const location = String(raw).toLowerCase().trim();
        if (!/^[a-zA-Z\s\-']{2,50}$/.test(location)) {
            throw new HttpError(400, 'Location: use only letters, spaces and hyphens');
        }

        for (const country of Object.values(ct.getAllCountries())) {
            const name = country.name.toLowerCase();
            if ((name === location || name.includes(location) || location.includes(name)) && country.timezones && country.timezones.length) {
                return { location: name, timezone: country.timezones[0], type: 'country' };
            }
        }

        const byPopulation = (a, b) => (b.pop || 0) - (a.pop || 0);
        const cities = cityTimezones.cityMapping;

        const inProvince = cities.filter(city => city.province && city.province.toLowerCase().includes(location)).sort(byPopulation);
        if (inProvince.length && inProvince[0].timezone) {
            return { location: inProvince[0].province.toLowerCase(), timezone: inProvince[0].timezone, type: 'state/province' };
        }

        const named = cities.filter(city =>
            (city.city && city.city.toLowerCase().includes(location)) ||
            (city.city_ascii && city.city_ascii.toLowerCase().includes(location))
        ).sort(byPopulation);
        if (named.length && named[0].timezone) {
            return { location: (named[0].city_ascii || named[0].city).toLowerCase(), timezone: named[0].timezone, type: 'city' };
        }

        throw new HttpError(400, `Location "${location}" not found. Try a country, state or city name.`);
    }

    // ---------- commands ----------

    async function commandModules() {
        const files = await fs.readdir(path.join(baseDir, 'bot-commands'));
        return files.filter(file => file.endsWith('.js')).map(file => file.slice(0, -3)).sort((a, b) => a.localeCompare(b));
    }

    function customCommandList(commands) {
        return Object.entries(commands || {})
            .filter(([, data]) => Array.isArray(data))
            .map(([name, data]) => ({ name, access: data[0], response: data[1], counter: Number(data[2]) || 0 }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    // ---------- token ----------

    async function tokenStatus(channel) {
        const oauth = await deps.getChannelOAuth(channel);
        if (!oauth || !oauth.access_token) return { present: false };
        try {
            const response = await axios.get('https://id.twitch.tv/oauth2/validate', {
                headers: { Authorization: `Bearer ${oauth.access_token}` },
                timeout: 8000
            });
            return {
                present: true,
                valid: true,
                expiresInSeconds: response.data.expires_in,
                scopes: response.data.scopes || [],
                updatedAt: oauth.updated_at || null
            };
        } catch (error) {
            if (error.response && error.response.status === 401) {
                return { present: true, valid: false, updatedAt: oauth.updated_at || null };
            }
            // Twitch unreachable: say so instead of calling a good token expired.
            return { present: true, valid: null, updatedAt: oauth.updated_at || null };
        }
    }

    // ---------- routes ----------

    const api = '/twitch/api/bot';
    const read = [requireSession, requireChannel];
    const write = [requireSession, requireSameSite, requireChannel];

    app.get(`${api}/me`, requireSession, handle(async (req, res) => {
        const user = req.session.user;
        const admin = isAdmin(req);
        let channels = [user.login.toLowerCase()];
        if (admin) {
            const files = await fs.readdir(channelsDir).catch(() => []);
            const deployed = files
                .filter(file => file.endsWith('.js'))
                .map(file => file.slice(0, -3))
                .filter(validChannel);
            channels = [...new Set([...channels, ...deployed])].sort();
        }
        res.json({ login: user.login.toLowerCase(), displayName: user.display_name, isAdmin: admin, channels });
    }));

    app.get(`${api}/:channel`, read, handle(async (req, res) => {
        const channel = req.channel;
        const stored = await readJson(configPath(channel), null);
        const config = { ...defaultConfig(channel), ...(stored || {}) };
        const [proc, modules, custom, token, countdowns, wordle] = await Promise.all([
            botProcess(channel),
            commandModules(),
            readJson(customPath(channel), {}),
            tokenStatus(channel),
            readJson(path.join(baseDir, 'countd.json'), {}),
            readJson(path.join(baseDir, 'wordle-data', `${channel}-stats.json`), null)
        ]);

        const excluded = Array.isArray(config.excludedCommands) ? config.excludedCommands : [];
        res.json({
            channel,
            botName: process.env.TWITCH_USERNAME,
            process: proc,
            token,
            settings: {
                moderationEnabled: !!config.moderationEnabled,
                redemptionEnabled: !!config.redemptionEnabled,
                redemptionRewardId: config.redemptionRewardId || '',
                redemptionTimeoutDuration: config.redemptionTimeoutDuration || 60,
                testMode: !!config.testMode,
                timeoutUsers: config.timeoutUsers || [],
                specialUsers: config.specialUsers || [],
                location: config['irl-location'] || '',
                timezone: config.timezone || '',
                claudeSystemPrompt: config.claudeSystemPrompt || '',
                lastUpdated: config.lastUpdated
            },
            commands: modules.map(name => ({
                name,
                triggers: COMMAND_INFO[name] ? COMMAND_INFO[name][0] : `!${name}`,
                description: COMMAND_INFO[name] ? COMMAND_INFO[name][1] : '',
                enabled: !excluded.includes(name)
            })),
            // Entries that match no module: chat stored names lowercased, and a
            // typed command word (e.g. "define") blocks that word on its own.
            otherExcluded: excluded.filter(name => !modules.includes(name)),
            customCommands: customCommandList(custom),
            countdowns: Object.values(countdowns || {})
                .filter(item => item && typeof item.channel === 'string' && item.channel.replace(/^#/, '') === channel)
                .map(item => ({ title: item.title, endsAt: item.startTime + item.duration * 1000 })),
            wordle
        });
    }));

    app.post(`${api}/:channel/settings`, write, handle(async (req, res) => {
        const channel = req.channel;
        const body = req.body || {};
        let redemptionChanged = false;
        let resolved = null;

        if (typeof body.location === 'string' && body.location.trim()) {
            resolved = resolveLocation(body.location);
        }
        const users = {};
        for (const key of ['specialUsers', 'timeoutUsers']) {
            if (body[key] !== undefined) users[key] = parseUserList(body[key], key === 'specialUsers' ? 'Special users' : 'Timeout users');
        }
        if (body.redemptionTimeoutDuration !== undefined) {
            const seconds = Number(body.redemptionTimeoutDuration);
            if (!Number.isInteger(seconds) || seconds < 1 || seconds > MAX_TIMEOUT_SECONDS) {
                throw new HttpError(400, `Timeout duration must be 1 to ${MAX_TIMEOUT_SECONDS} seconds`);
            }
        }
        if (body.redemptionRewardId !== undefined && body.redemptionRewardId !== '' && body.redemptionRewardId !== null) {
            if (!/^[0-9a-fA-F-]{8,64}$/.test(String(body.redemptionRewardId))) {
                throw new HttpError(400, 'Reward ID is not a valid Twitch reward ID');
            }
        }
        if (body.claudeSystemPrompt !== undefined) {
            if (typeof body.claudeSystemPrompt !== 'string' || body.claudeSystemPrompt.length > MAX_PROMPT_LENGTH) {
                throw new HttpError(400, `System prompt must be at most ${MAX_PROMPT_LENGTH} characters`);
            }
        }

        await updateConfig(channel, config => {
            if (typeof body.moderationEnabled === 'boolean') {
                // As `!config enable` / `!config disable`: chat-only is the absence of moderation.
                config.moderationEnabled = body.moderationEnabled;
                config.chatOnly = !body.moderationEnabled;
                if (body.moderationEnabled) config.moderatorUsername = process.env.TWITCH_USERNAME;
            }
            if (typeof body.redemptionEnabled === 'boolean' && body.redemptionEnabled !== !!config.redemptionEnabled) {
                config.redemptionEnabled = body.redemptionEnabled;
                redemptionChanged = true;
            }
            if (body.redemptionRewardId !== undefined) {
                const id = body.redemptionRewardId ? String(body.redemptionRewardId) : null;
                if (id !== (config.redemptionRewardId || null)) redemptionChanged = true;
                config.redemptionRewardId = id;
            }
            if (body.redemptionTimeoutDuration !== undefined) {
                config.redemptionTimeoutDuration = Number(body.redemptionTimeoutDuration);
            }
            if (typeof body.testMode === 'boolean') config.testMode = body.testMode;
            Object.assign(config, users);
            if (resolved) {
                config['irl-location'] = resolved.location;
                config.timezone = resolved.timezone;
            } else if (body.location === '') {
                delete config['irl-location'];
                delete config.timezone;
            }
            if (body.claudeSystemPrompt !== undefined) {
                const prompt = body.claudeSystemPrompt.trim();
                if (prompt) config.claudeSystemPrompt = prompt;
                else delete config.claudeSystemPrompt;
            }
        });

        if (redemptionChanged) await notifyEventSub(channel);
        const restarting = await applyConfigChange(channel);
        res.json({ ok: true, restarting, location: resolved });
    }));

    app.post(`${api}/:channel/commands`, write, handle(async (req, res) => {
        const channel = req.channel;
        const body = req.body || {};
        if (!Array.isArray(body.disabled) || !Array.isArray(body.otherExcluded || [])) {
            throw new HttpError(400, 'Expected a list of disabled commands');
        }
        const modules = await commandModules();
        const disabled = body.disabled.map(String);
        const unknown = disabled.find(name => !modules.includes(name));
        if (unknown) throw new HttpError(400, `Unknown command module: ${unknown}`);

        const other = [...new Set((body.otherExcluded || []).map(name => String(name).trim().toLowerCase().replace(/^!/, '')).filter(Boolean))];
        const bad = other.find(name => !/^[a-z0-9_-]{1,30}$/.test(name));
        if (bad) throw new HttpError(400, `"${bad}" is not a valid command word`);

        await updateConfig(channel, config => {
            config.excludedCommands = [...new Set([...disabled, ...other])];
        });
        const restarting = await applyConfigChange(channel);
        res.json({ ok: true, restarting });
    }));

    // Custom commands live in their own file, which the bot reads on every
    // message: changes apply at once, with no restart.
    app.post(`${api}/:channel/custom-commands`, write, handle(async (req, res) => {
        const channel = req.channel;
        const body = req.body || {};
        // Same rules as !acomm in bot-commands/customC.js.
        const name = String(body.name || '').replace(/^!/, '').toLowerCase();
        if (!/^[a-z0-9]{3,25}$/.test(name)) throw new HttpError(400, 'Command name must be 3-25 letters or numbers');
        const response = String(body.response || '').replace(/[<>]/g, '').trim();
        if (!response || response.length > 500) throw new HttpError(400, 'Response must be 1-500 characters');
        if (!['n', 'v', 'y'].includes(body.access)) throw new HttpError(400, 'Choose who can use the command');

        const commands = await readJson(customPath(channel), {});
        const exists = Object.prototype.hasOwnProperty.call(commands, name);
        if (body.create && exists) throw new HttpError(409, `!${name} already exists`);
        if (!body.create && !exists) throw new HttpError(404, `!${name} does not exist`);

        let counter = exists ? Number(commands[name][2]) || 0 : 0;
        if (body.counter !== undefined) {
            counter = Number(body.counter);
            if (!Number.isInteger(counter) || counter < 0) throw new HttpError(400, 'Counter must be zero or a positive whole number');
        }
        commands[name] = [body.access, response, counter];
        await fs.mkdir(customDir, { recursive: true });
        await fs.writeFile(customPath(channel), JSON.stringify(commands, null, 2));
        res.json({ ok: true, customCommands: customCommandList(commands) });
    }));

    app.delete(`${api}/:channel/custom-commands/:name`, write, handle(async (req, res) => {
        const channel = req.channel;
        const name = String(req.params.name).toLowerCase();
        const commands = await readJson(customPath(channel), {});
        if (!Object.prototype.hasOwnProperty.call(commands, name)) throw new HttpError(404, `!${name} does not exist`);
        delete commands[name];
        await fs.writeFile(customPath(channel), JSON.stringify(commands, null, 2));
        res.json({ ok: true, customCommands: customCommandList(commands) });
    }));

    // The broadcaster's channel-point rewards, to pick the timeout reward from.
    app.get(`${api}/:channel/rewards`, read, handle(async (req, res) => {
        const oauth = await deps.getChannelOAuth(req.channel);
        if (!oauth || !oauth.access_token || !oauth.user_id) {
            return res.json({ rewards: [], reason: 'Connect your Twitch account first.' });
        }
        try {
            const response = await axios.get('https://api.twitch.tv/helix/channel_points/custom_rewards', {
                params: { broadcaster_id: oauth.user_id },
                headers: { Authorization: `Bearer ${oauth.access_token}`, 'Client-Id': process.env.TWITCH_CLIENTID },
                timeout: 8000
            });
            res.json({ rewards: (response.data.data || []).map(reward => ({ id: reward.id, title: reward.title, cost: reward.cost })) });
        } catch (error) {
            const status = error.response && error.response.status;
            const reason = status === 401 ? 'Your Twitch connection has expired. Refresh it on the Access tab.'
                : status === 403 ? 'Channel points need Twitch Affiliate or Partner.'
                    : 'Could not load rewards from Twitch.';
            res.json({ rewards: [], reason });
        }
    }));

    app.post(`${api}/:channel/control`, write, handle(async (req, res) => {
        const channel = req.channel;
        const action = (req.body || {}).action;
        const name = `twitch-${channel}`;
        const procs = await pm2List();
        const exists = procs.some(p => p.name === name);

        if (action === 'restart' || (action === 'start' && exists)) {
            if (!exists) throw new HttpError(409, 'The bot is not in this channel yet');
            await pm2(['restart', name]);
        } else if (action === 'stop') {
            if (!exists) throw new HttpError(409, 'The bot is not in this channel');
            await pm2(['stop', name]);
        } else if (action === 'start') {
            // As `!addme`: config, a copy of the bot template, an ecosystem entry, a process.
            const online = procs.filter(p => p.name.startsWith('twitch-') && p.pm2_env && p.pm2_env.status === 'online').length;
            if (online >= maxChannels) {
                throw new HttpError(409, `The bot is at capacity (${maxChannels} channels). Ask ${process.env.TWITCH_OWNER} for an exception.`);
            }
            if ((await readJson(configPath(channel), null)) === null) {
                await updateConfig(channel, () => {});
            }
            const template = await fs.readFile(path.join(channelsDir, 'new-template-hybrid-conduit.js'), 'utf8');
            const script = path.join(channelsDir, `${channel}.js`);
            await fs.writeFile(script, template.replace(/\$\$UPDATEHERE\$\$/g, channel));

            delete require.cache[require.resolve(ecosystemPath)];
            const ecosystem = require(ecosystemPath);
            if (!ecosystem.apps.some(appEntry => appEntry.name === name)) {
                ecosystem.apps.push({
                    name,
                    script,
                    cwd: baseDir,
                    node_args: '--expose-gc',
                    log_date_format: 'YYYY-MM-DD HH:mm:ss',
                    max_memory_restart: '150M',
                    out_file: path.join(baseDir, 'logs', `${name}-out.log`),
                    error_file: path.join(baseDir, 'logs', `${name}-err.log`),
                    watch: [configPath(channel), path.join(configDir, 'shared-conduits.json')],
                    watch_delay: 2000,
                    ignore_watch: ['node_modules', 'logs', '*.log', 'oauth.json'],
                    watch_options: { followSymlinks: false }
                });
                await fs.writeFile(ecosystemPath, `module.exports = ${JSON.stringify(ecosystem, null, 2)}`);
            }
            await pm2(['start', ecosystemPath, '--only', name]);
        } else {
            throw new HttpError(400, 'Unknown action');
        }

        // So the bot's state survives a reboot (pm2 resurrect).
        await pm2(['save']).catch(error => console.error('Dashboard:', error.message));
        res.json({ ok: true, process: await botProcess(channel) });
    }));

    app.get(`${api}/:channel/logs`, read, handle(async (req, res) => {
        const file = path.join(baseDir, 'logs', `twitch-${req.channel}-out.log`);
        let handleFile;
        try {
            handleFile = await fs.open(file, 'r');
        } catch (error) {
            if (error.code === 'ENOENT') return res.json({ lines: [] });
            throw error;
        }
        try {
            const { size } = await handleFile.stat();
            const length = Math.min(size, LOG_TAIL_BYTES);
            const buffer = Buffer.alloc(length);
            await handleFile.read(buffer, 0, length, size - length);
            const lines = buffer.toString('utf8').split('\n').filter(Boolean);
            // The first line is cut mid-way when the tail starts inside the file.
            if (size > length) lines.shift();
            res.json({ lines: lines.slice(-LOG_TAIL_LINES) });
        } finally {
            await handleFile.close();
        }
    }));
}

module.exports = { mount };

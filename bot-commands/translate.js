/**
 * Twitch chat Google Translate command
 * 
 * Description: Allows twitch chat to perform google translation.
 * 
 * Permission required: All users
 * 
 * Usage:   !<language code><SPACE><message to translate>
 *          Language codes: https://cloud.google.com/translate/docs/languages
 *          
 *  
 */

// API Google Translate
const gtrans = require('googletrans').default;

const tr_lang = {
    'de': ['de', 'sagt'],
    'en': ['en', 'says'],
    'fr': ['fr', 'dit'],
    'pt': ['pt', 'disse'],
    'af': ['af', 'sê'],
    'sq': ['sq', 'thotë'],
    'am': ['am', 'አለው'],
    'ar': ['ar', 'يقول'],
    'hy': ['hy', 'կանչում է'],
    'az': ['az', 'deyir'],
    'eu': ['eu', 'esaten'],
    'be': ['be', 'кажа'],
    'bn': ['bn', 'বলে'],
    'bs': ['bs', 'kaže'],
    'bg': ['bg', 'казва'],
    'ca': ['ca', 'diu'],
    'ceb': ['ceb', 'mobuhat'],
    'ny': ['ny', 'anakhalitsa'],
    'cn': ['zh', '说'],
    'zh-cn': ['zh-cn', '说'],
    'zh-tw': ['zh-tw', '說'],
    'co': ['co', 'di'],
    'hr': ['hr', 'kaže'],
    'cs': ['cs', 'říká'],
    'da': ['da', 'siger'],
    'nl': ['nl', 'zegt'],
    'eo': ['eo', 'diras'],
    'et': ['et', 'ütlevad'],
    'tl': ['tl', 'sinasabi'],
    'fi': ['fi', 'sanoo'],
    'fy': ['fy', 'seit'],
    'gl': ['gl', 'di'],
    'ka': ['ka', 'ამოცნობს'],
    'el': ['el', 'λέει'],
    'gu': ['gu', 'કહેતું છે'],
    'ht': ['ht', 'di'],
    'ha': ['ha', 'yace'],
    'haw': ['haw', 'kaʻu'],
    'he': ['he', 'אומר'],
    'hi': ['hi', 'कहते हैं'],
    'hmn': ['hmn', 'tug'],
    'hu': ['hu', 'mondja'],
    'is': ['is', 'segir'],
    'ig': ['ig', 'enye'],
    'id': ['id', 'bilang'],
    'ga': ['ga', 'a dhéanann'],
    'it': ['it', 'dice'],
    'ja': ['ja', '言う'],
    'jw': ['jw', 'ngandika'],
    'kn': ['kn', 'ಹೇಳುತ್ತೇವೆ'],
    'kk': ['kk', 'әйтер'],
    'km': ['km', 'បាននិយាយ'],
    'ko': ['ko', '이야기한다'],
    'ku': ['ku', 'dibêje'],
    'ky': ['ky', 'айтады'],
    'lo': ['lo', 'ພູມ'],
    'la': ['la', 'dicit'],
    'lv': ['lv', 'saka'],
    'lt': ['lt', 'sako'],
    'lb': ['lb', 'seet'],
    'mk': ['mk', 'искаже'],
    'mg': ['mg', 'manao'],
    'ms': ['ms', 'mengatakan'],
    'ml': ['ml', 'പറഞ്ഞു'],
    'mt': ['mt', 'qalt'],
    'mi': ['mi', 'ka whakaahuatia'],
    'mr': ['mr', 'बोलतो'],
    'mn': ['mn', 'өгдөг'],
    'my': ['my', 'ကြေးမှု'],
    'ne': ['ne', 'बोल्छ।'],
    'no': ['no', 'sier'],
    'ps': ['ps', 'مننه'],
    'fa': ['fa', 'گفت'],
    'pl': ['pl', 'mówi'],
    'pa': ['pa', 'ਕਹਿਣਾ'],
    'ro': ['ro', 'spune'],
    'ru': ['ru', 'говорит'],
    'sm': ['sm', 'faʻamau'],
    'gd': ['gd', 'innis'],
    'sr': ['sr', 'каже'],
    'st': ['st', 'khutla'],
    'sn': ['sn', 'anoda'],
    'sd': ['sd', 'کاندو'],
    'si': ['si', 'කරයි'],
    'sk': ['sk', 'hovorí'],
    'sl': ['sl', 'pravi'],
    //'so': ['so', 'wuxuu yidhi'],
    'es': ['es', 'dice'],
    'su': ['su', 'ngandika'],
    'sw': ['sw', 'anasema'],
    'sv': ['sv', 'säger'],
    'tg': ['tg', 'говорит'],
    'ta': ['ta', 'பேசுகிறது'],
    'te': ['te', 'ప్రబంధించాడు'],
    'th': ['th', 'พูด'],
    'tr': ['tr', 'söyler'],
    'uk': ['uk', 'говорить'],
    'ur': ['ur', 'کہتا ہے'],
    'uz': ['uz', 'deyarli'],
    'vi': ['vi', 'nói'],
    'cy': ['cy', 'dice'],
    'xh': ['xh', 'uthi'],
    'yi': ['yi', 'זאָגט'],
    'yo': ['yo', 'fi'],
    'zu': ['zu', 'ithi'],
    'pinyin': ['zh', 'says'],
    'romaji': ['ja', 'says']
};

// Called every time a message comes in
exports.translate = async function translate(client, message, channel, tags) {
    try {
        // Remove whitespace from chat message
        let tMsg = message.trim();

        // Check if the message starts with @name
        // in that case, extract the name and move the @name at the end of the message, and process
        if (tMsg[0] === '@') {
            let atnameEndIndex = tMsg.indexOf(' ');
            let atname = tMsg.substring(0, atnameEndIndex);
            let message = tMsg.substring(atnameEndIndex + 1);
            tMsg = message + ' ' + atname;
            // console.info('Changed message :', tMsg);
        }

        // Filter commands (options)
        if (tMsg[0] != '!') return;

        // Extract command
        let cmd = tMsg.split(' ')[0].substring(1).toLowerCase();

        // Name for answering
        let answername = '@' + `${tags.username}`;

        // Command for displaying the commands (in english)
        if (cmd === "lang" || cmd === "translate") {
            client.say(channel, 'I can (approximatevely) translate your messages in many languages. Simply start your message with one of the language short codes as per https://raw.githubusercontent.com/DarinRowe/googletrans/2cb2ef1eaa5dc2b5cf7492e69ad96d8ed40ea656/src/languages.ts');
            return;
        }

        // Commands for displaying messages explaining the translation feature in various languages
        // TODO: sentences
        const explanations = {
            'english': 'You can use our Translator Bot. Start your message by typing !en To translate your message into English. For example: "!en Bonjour"',
        }
        if (cmd in explanations) {
            client.say(channel, explanations[cmd]);
            return;
        }

        if (cmd in tr_lang && tMsg[0] == '!') {
            var ll = tr_lang[cmd];
            //console.error(ll);
            var txt = tMsg.substring(1 + cmd.length);

            // Text must be at least 2 characters and max 200 characters
            var lazy = false;
            if (txt.length > 2) {
                if (txt.length > 200) {
                    lazy = true;
                    txt = "i'm too lazy to translate long sentences ^^";
                }

                // Lazy mode, and english target => no translation, only displays 'lazy' message in english
                if ((lazy === true) && (ll[0].indexOf('en') == 0)) {
                    say(channel, `${tags.username}` + ', ' + txt);
                    return;
                }

                // Translate text
                gtrans(txt, { to: ll[0] }).then(res => {
                    // Tweak to add pinyin to display chinese pronunciation + english translation
                    if (cmd == 'pinyin') {
                        gtrans(txt, { to: 'en' }).then(enres => {
                            client.say(channel, `${tags.username}` + '| pinyin: ' + res.pronunciation + ' | english: ' + enres.text);
                        }).catch(err => {
                            console.error('Translation Error:', err);
                        })
                    }
                    // Tweak to add romaji to display japanese pronunciation + english translation
                    else if (cmd == 'romaji') {
                        gtrans(txt, { to: 'en' }).then(enres => {
                            client.say(channel, `${tags.username}` + '| romaji: ' + res.pronunciation + ' | english: ' + enres.text);
                        }).catch(err => {
                            console.error('Translation Error:', err);
                        })
                    } else if (lazy === true) {
                        // lazy mode sentence in english and also in requested language
                        client.say(channel, `${tags.username}` + ', ' + txt + '/' + res.text);
                    }
                    else {
                        // Translation
                        // TODO: Check is translated text == original text. In that case it
                        // means the command was not correctly used (ex: "!en hello friends")
                        client.say(channel, `${tags.username}` + ' ' + ll[1] + ': ' + res.pronunciation + ': ' + res.text);
                    }
                }).catch(err => {
                    console.error('Translation Error:', err);
                })
            }
        }
    }
    catch (e) {
        console.error(e.stack);
    }
}

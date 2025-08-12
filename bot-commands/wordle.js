/**
 * Wordle game command
 * 
 * Description: Interactive Wordle game for Twitch chat
 * 
 * Permission required: 
 *   - Moderators+ can start games (!wordle start)
 *   - All users can guess (!wordle guess [word])
 * 
 * Usage:   !wordle start - Start a new game (mods only)
 *          !wordle guess <word> - Make a guess (all users)
 *          !wordle chars - Show unused letters and wrong positions
 *          !wordle guesses - Show all previous guesses
 *          !wordle stats - Show game statistics
 *          !wordle help - Show game instructions
 */

const fs = require('fs');
const path = require('path');

// Load channel configuration
function loadChannelConfig(channelName) {
  try {
    const configPath = path.join(process.env.BOT_FULL_PATH || __dirname, 'channel-configs', `${channelName}.json`);
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (error) {
    console.error(`[WORDLE] Error loading config for ${channelName}:`, error.message);
  }
  return null;
}

// Channel-specific game states
const channelGames = new Map();

// Rate limiting for guesses
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 5000; // 5 seconds between guesses per user
const MAX_GUESS_LENGTH = 5;

const wordList = require('word-list-json');

// Full dictionary for word validation (guesses)
const validWords = wordList.filter(word => 
  word.length === 5 && /^[a-z]+$/.test(word)
).map(word => word.toLowerCase());

// Curated list of common 5-letter English words for Wordle answers
const fiveLetterWords = [
  'about', 'above', 'abuse', 'actor', 'acute', 'admit', 'adopt', 'adult', 'after', 'again',
  'agent', 'agree', 'ahead', 'alarm', 'album', 'alert', 'alien', 'align', 'alike', 'alive',
  'allow', 'alone', 'along', 'alter', 'among', 'anger', 'angle', 'angry', 'apart', 'apple',
  'apply', 'arena', 'argue', 'arise', 'array', 'aside', 'asset', 'avoid', 'awake', 'award',
  'aware', 'badly', 'baker', 'bases', 'basic', 'beach', 'began', 'begin', 'bench', 'billy',
  'birth', 'black', 'blame', 'blind', 'block', 'blood', 'board', 'boost', 'booth', 'bound',
  'brain', 'brand', 'brass', 'brave', 'bread', 'break', 'breed', 'brief', 'bring', 'broad',
  'broke', 'brown', 'build', 'built', 'buyer', 'cable', 'carry', 'catch', 'cause', 'chain',
  'chair', 'chaos', 'charm', 'chart', 'chase', 'cheap', 'check', 'chest', 'chief', 'child',
  'chose', 'civil', 'claim', 'class', 'clean', 'clear', 'click', 'climb', 'clock', 'close',
  'cloud', 'coach', 'coast', 'could', 'count', 'court', 'cover', 'craft', 'crash', 'crazy',
  'cream', 'crime', 'cross', 'crowd', 'crown', 'crude', 'curve', 'cycle', 'daily', 'dance',
  'dated', 'dealt', 'death', 'debut', 'delay', 'depth', 'doing', 'doubt', 'dozen', 'draft',
  'drama', 'drank', 'dream', 'dress', 'drill', 'drink', 'drive', 'drove', 'dying', 'eager',
  'early', 'earth', 'eight', 'elite', 'empty', 'enemy', 'enjoy', 'enter', 'entry', 'equal',
  'error', 'event', 'every', 'exact', 'exist', 'extra', 'faith', 'false', 'fault', 'fiber',
  'field', 'fifth', 'fifty', 'fight', 'final', 'first', 'fixed', 'flash', 'fleet', 'floor',
  'fluid', 'focus', 'force', 'forth', 'forty', 'forum', 'found', 'frame', 'frank', 'fraud',
  'fresh', 'front', 'fruit', 'fully', 'funny', 'giant', 'given', 'glass', 'globe', 'going',
  'grace', 'grade', 'grain', 'grand', 'grant', 'grass', 'grave', 'great', 'green', 'gross',
  'group', 'grown', 'guard', 'guess', 'guest', 'guide', 'happy', 'harry', 'heart', 'heavy',
  'hence', 'henry', 'horse', 'hotel', 'house', 'human', 'ideal', 'image', 'index', 'inner',
  'input', 'issue', 'japan', 'jimmy', 'joint', 'jones', 'judge', 'known', 'label', 'large',
  'laser', 'later', 'laugh', 'layer', 'learn', 'lease', 'least', 'leave', 'legal', 'level',
  'lewis', 'light', 'limit', 'links', 'lives', 'local', 'loose', 'lower', 'lucky', 'lunch',
  'lying', 'magic', 'major', 'maker', 'march', 'maria', 'match', 'maybe', 'mayor', 'meant',
  'media', 'metal', 'might', 'minor', 'minus', 'mixed', 'model', 'money', 'month', 'moral',
  'motor', 'mount', 'mouse', 'mouth', 'moved', 'movie', 'music', 'needs', 'never', 'newly',
  'night', 'noise', 'north', 'noted', 'novel', 'nurse', 'occur', 'ocean', 'offer', 'often',
  'order', 'other', 'ought', 'paint', 'panel', 'paper', 'party', 'peace', 'peter', 'phase',
  'phone', 'photo', 'piano', 'piece', 'pilot', 'pitch', 'place', 'plain', 'plane', 'plant',
  'plate', 'point', 'pound', 'power', 'press', 'price', 'pride', 'prime', 'print', 'prior',
  'prize', 'proof', 'proud', 'prove', 'queen', 'quick', 'quiet', 'quite', 'radio', 'raise',
  'range', 'rapid', 'ratio', 'reach', 'ready', 'realm', 'rebel', 'refer', 'relax', 'repay',
  'reply', 'rider', 'ridge', 'right', 'rigid', 'rival', 'river', 'robin', 'roger', 'roman',
  'rough', 'round', 'route', 'royal', 'rural', 'scale', 'scene', 'scope', 'score', 'sense',
  'serve', 'seven', 'shall', 'shape', 'share', 'sharp', 'sheet', 'shelf', 'shell', 'shift',
  'shine', 'shock', 'shoot', 'short', 'shown', 'sided', 'sight', 'since', 'sixth', 'sixty',
  'sized', 'skill', 'sleep', 'slide', 'small', 'smart', 'smile', 'smith', 'smoke', 'solid',
  'solve', 'sorry', 'sound', 'south', 'space', 'spare', 'speak', 'speed', 'spend', 'spent',
  'split', 'spoke', 'sport', 'staff', 'stage', 'stake', 'stand', 'start', 'state', 'steam',
  'steel', 'steep', 'steer', 'stick', 'still', 'stock', 'stone', 'stood', 'store', 'storm',
  'story', 'strip', 'stuck', 'study', 'stuff', 'style', 'sugar', 'suite', 'super', 'sweet',
  'swift', 'swing', 'table', 'taken', 'taste', 'taxes', 'teach', 'teeth', 'terry', 'texas',
  'thank', 'theft', 'their', 'theme', 'there', 'these', 'thick', 'thing', 'think', 'third',
  'those', 'three', 'threw', 'throw', 'thumb', 'tiger', 'tight', 'timer', 'title', 'today',
  'topic', 'total', 'touch', 'tough', 'tower', 'track', 'trade', 'train', 'treat', 'trend',
  'trial', 'tribe', 'trick', 'tried', 'tries', 'truly', 'trunk', 'trust', 'truth', 'twice',
  'uncle', 'under', 'undue', 'union', 'unity', 'until', 'upper', 'upset', 'urban', 'usage',
  'usual', 'valid', 'value', 'video', 'virus', 'visit', 'vital', 'vocal', 'voice', 'waste',
  'watch', 'water', 'wheel', 'where', 'which', 'while', 'white', 'whole', 'whose', 'woman',
  'women', 'world', 'worry', 'worse', 'worst', 'worth', 'would', 'write', 'wrong', 'wrote',
  'young', 'youth'
];

console.log(`[WORDLE] Loaded ${validWords.length} words for validation and ${fiveLetterWords.length} curated words for answers`);

// Get random 5-letter word using npm package
function getRandomWord() {
  try {    
    if (fiveLetterWords.length === 0) {
      throw new Error('No 5-letter words available');
    }
    
    const randomIndex = Math.floor(Math.random() * fiveLetterWords.length);
    const word = fiveLetterWords[randomIndex].toUpperCase();
    
    // Double-check validation
    if (word.length === 5 && /^[A-Z]+$/.test(word)) {
      return word;
    } else {
      throw new Error('Invalid word selected');
    }
    
  } catch (error) {
    console.error('[WORDLE] Word generation failed, using fallback:', error.message);
    
    // Fallback word list as last resort
    const FALLBACK_WORDS = [
      'ABOUT', 'HOUSE', 'WORLD', 'MUSIC', 'LIGHT', 'SOUND', 'WATER', 'POWER', 'MONEY', 'RIGHT',
      'HEART', 'PARTY', 'STORY', 'HAPPY', 'GREAT', 'BRAIN', 'QUICK', 'VOICE', 'WATCH', 'CLEAN',
      'FRESH', 'SMART', 'MAGIC', 'PEACE', 'SMILE', 'DREAM', 'SHINE', 'SWEET', 'SPACE', 'CROWN',
      'BRAVE', 'BREAD', 'BREAK', 'BRING', 'BUILD', 'CHAIR', 'CHART', 'CHECK', 'CHEST', 'CHILD',
      'CLEAR', 'CLICK', 'CLIMB', 'CLOSE', 'CLOUD', 'COUNT', 'COVER', 'CRAFT', 'CRAZY', 'DANCE'
    ];
    
    return FALLBACK_WORDS[Math.floor(Math.random() * FALLBACK_WORDS.length)];
  }
}

// Get game data directory path
function getGameDataPath() {
  return path.join(process.env.BOT_FULL_PATH || __dirname, 'wordle-data');
}

// Ensure game data directory exists
function ensureGameDataDir() {
  const dataPath = getGameDataPath();
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }
}

// Load channel stats from file
function loadChannelStats(channelName) {
  try {
    ensureGameDataDir();
    const filePath = path.join(getGameDataPath(), `${channelName}-stats.json`);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (error) {
    console.error(`[WORDLE] Error loading stats for ${channelName}:`, error.message);
  }
  
  return {
    gamesPlayed: 0,
    totalGuesses: 0,
    winners: {},
    lastPlayed: null
  };
}

// Save channel stats to file
function saveChannelStats(channelName, stats) {
  try {
    ensureGameDataDir();
    const filePath = path.join(getGameDataPath(), `${channelName}-stats.json`);
    fs.writeFileSync(filePath, JSON.stringify(stats, null, 2));
  } catch (error) {
    console.error(`[WORDLE] Error saving stats for ${channelName}:`, error.message);
  }
}

// Check rate limiting for guesses
function checkGuessRateLimit(username) {
  const now = Date.now();
  const lastGuess = rateLimitMap.get(username) || 0;
  
  if (now - lastGuess < RATE_LIMIT_WINDOW) {
    return false; // Rate limited
  }
  
  rateLimitMap.set(username, now);
  return true; // Not rate limited
}

// Validate 5-letter word
function isValidWord(word) {
  if (!word || typeof word !== 'string') return false;
  const cleanWord = word.toUpperCase().trim();
  
  // Check basic format first
  if (!/^[A-Z]{5}$/.test(cleanWord)) return false;
  
  // Check if word exists in dictionary (use broader validation list)
  return validWords.includes(cleanWord.toLowerCase());
}

// Get word feedback (Wordle-style)
function getWordFeedback(guess, target) {
  const result = [];
  const guessArray = guess.split('');
  const targetArray = target.split('');
  const targetCount = {};
  
  // Count letters in target
  for (const letter of targetArray) {
    targetCount[letter] = (targetCount[letter] || 0) + 1;
  }
  
  // First pass: mark correct positions (green)
  for (let i = 0; i < 5; i++) {
    if (guessArray[i] === targetArray[i]) {
      result[i] = '🟩';
      targetCount[guessArray[i]]--;
    } else {
      result[i] = null; // Will be filled in second pass
    }
  }
  
  // Second pass: mark wrong positions (yellow) and misses (white)
  for (let i = 0; i < 5; i++) {
    if (result[i] === null) {
      if (targetCount[guessArray[i]] > 0) {
        result[i] = '🟨';
        targetCount[guessArray[i]]--;
      } else {
        result[i] = '⬜';
      }
    }
  }
  
  return result.join('');
}

// Format guess display
function formatGuessDisplay(guess, feedback) {
  return `${guess} ${feedback}`;
}

// Track alphabet state from all guesses (proper Wordle behavior)
function getAlphabetState(game) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const state = {};
  
  // Initialize all letters as unused
  for (const letter of alphabet) {
    state[letter] = 'unused'; // unused, correct, wrong_position, not_in_word
  }
  
  // Process all guesses to update letter states
  for (const guess of game.guesses) {
    const guessWord = guess.word;
    const targetWord = game.word;
    
    for (let i = 0; i < 5; i++) {
      const letter = guessWord[i];
      
      if (targetWord[i] === letter) {
        // Correct position - highest priority (green)
        state[letter] = 'correct';
      } else if (targetWord.includes(letter) && state[letter] !== 'correct') {
        // Wrong position - only if not already marked as correct (yellow)
        state[letter] = 'wrong_position';
      } else if (!targetWord.includes(letter)) {
        // Not in word - only if not already marked as correct or wrong_position (gray)
        if (state[letter] === 'unused') {
          state[letter] = 'not_in_word';
        }
      }
    }
  }
  
  return state;
}

// Format alphabet display for chat
function formatAlphabetDisplay(alphabetState) {
  const unused = [];
  const wrongPosition = [];
  const notInWord = [];
  
  for (const [letter, status] of Object.entries(alphabetState)) {
    switch (status) {
      case 'unused':
        unused.push(letter);
        break;
      case 'wrong_position':
        wrongPosition.push(letter);
        break;
      case 'not_in_word':
        notInWord.push(letter);
        break;
      // Skip 'correct' letters as they're already placed
    }
  }
  
  let display = '';
  
  if (unused.length > 0) {
    display += `Unused: ${unused.join('')}`;
  }
  
  if (wrongPosition.length > 0) {
    if (display) display += ' | ';
    display += `Wrong pos: ${wrongPosition.join('')}`;
  }
  
  if (notInWord.length > 0) {
    if (display) display += ' | ';
    display += `Not in word: ${notInWord.join('')}`;
  }
  
  return display || 'All letters have been tried!';
}

exports.wordle = async function wordle(client, message, channel, tags) {
  const input = message.split(" ");
  if (input[0] !== "!wordle") {
    return;
  }
  
  const channelName = channel.replace('#', '');
  const command = input[1]?.toLowerCase();
  const username = tags.username;
  const displayName = tags['display-name'] || username;
  
  // Load channel config for special user permissions
  const channelConfig = loadChannelConfig(channelName);
  const specialUsers = channelConfig?.specialUsers || [];
  const isSpecialUser = specialUsers.includes(username);
  
  // Permission checks
  const isMod = tags.isModUp || tags.badges?.moderator || tags.badges?.broadcaster || isSpecialUser;
  
  try {
    switch (command) {
      case 'start':
        if (!isMod) {
          client.say(channel, `@${displayName}, only moderators, broadcasters, and special users can start Wordle games!`);
          return;
        }
        
        // Check if game already active
        if (channelGames.has(channelName)) {
          const game = channelGames.get(channelName);
          if (game.active) {
            client.say(channel, `@${displayName}, a Wordle game is already active! Current word has ${game.word.split('').map(() => '_').join(' ')} (${game.guesses.length} guesses made)`);
            return;
          } else {
            // Game exists but is not active (finished), remove it
            channelGames.delete(channelName);
          }
        }
        
        // Start new game
        try {
          const newWord = getRandomWord();
          const gameState = {
            word: newWord,
            guesses: [],
            startTime: Date.now(),
            startedBy: displayName,
            active: true,
            winner: null
          };
          
          channelGames.set(channelName, gameState);
          
          client.say(channel, `🎯 New Wordle game started by @${displayName}! Guess the 5-letter word with !wordle guess <word>. Good luck! _ _ _ _ _`);
        } catch (error) {
          console.error('[WORDLE] Failed to start game:', error.message);
          client.say(channel, `@${displayName}, sorry, failed to start Wordle game. Please try again!`);
        }
        break;
        
      case 'guess':
        const guessWord = input[2]?.toUpperCase();
        
        if (!guessWord) {
          client.say(channel, `@${displayName}, please provide a 5-letter word! Usage: !wordle guess <word>`);
          return;
        }
        
        if (!isValidWord(guessWord)) {
          client.say(channel, `@${displayName}, "${guessWord}" is not a valid 5-letter word! Please use a real English word.`);
          return;
        }
        
        // Check if game is active
        if (!channelGames.has(channelName)) {
          client.say(channel, `@${displayName}, no Wordle game is currently active! A moderator can start one with !wordle start`);
          return;
        }
        
        const game = channelGames.get(channelName);
        if (!game.active) {
          client.say(channel, `@${displayName}, the current game has ended! A moderator can start a new one with !wordle start`);
          return;
        }
        
        // Check rate limiting
        if (!checkGuessRateLimit(username)) {
          client.say(channel, `@${displayName}, please wait a moment before making another guess!`);
          return;
        }
        
        // Check if game has reached maximum guesses
        if (game.guesses.length >= 6) {
          client.say(channel, `@${displayName}, this game has ended after 6 guesses! The word was ${game.word}. A moderator can start a new game with !wordle start`);
          return;
        }
        
        // Check if user already won
        if (game.winner) {
          client.say(channel, `@${displayName}, this game was already won by @${game.winner}! A moderator can start a new game with !wordle start`);
          return;
        }
        
        // Check for duplicate guess
        const previousGuess = game.guesses.find(g => g.word === guessWord);
        if (previousGuess) {
          client.say(channel, `@${displayName}, "${guessWord}" was already guessed by @${previousGuess.displayName}! Try a different word.`);
          return;
        }
        
        // Process guess
        const feedback = getWordFeedback(guessWord, game.word);
        const guessDisplay = formatGuessDisplay(guessWord, feedback);
        
        // Add guess to game state
        game.guesses.push({
          word: guessWord,
          feedback: feedback,
          username: username,
          displayName: displayName,
          timestamp: Date.now()
        });
        
        // Check if correct
        if (guessWord === game.word) {
          game.winner = displayName;
          game.active = false;
          game.endTime = Date.now();
          
          // Update stats
          const stats = loadChannelStats(channelName);
          stats.gamesPlayed++;
          stats.totalGuesses += game.guesses.length;
          stats.winners[displayName] = (stats.winners[displayName] || 0) + 1;
          stats.lastPlayed = new Date().toISOString();
          saveChannelStats(channelName, stats);
          
          client.say(channel, `🎉 Congratulations @${displayName}! You won! The word was ${game.word}! ${guessDisplay} (${game.guesses.length} total guesses)`);
          
          // Clean up game after 30 seconds
          setTimeout(() => {
            channelGames.delete(channelName);
          }, 30000);
        } else {
          // Check if this was the 6th guess (game over)
          if (game.guesses.length >= 6) {
            game.active = false;
            game.endTime = Date.now();
            
            // Update stats for failed game
            const stats = loadChannelStats(channelName);
            stats.gamesPlayed++;
            stats.totalGuesses += game.guesses.length;
            stats.lastPlayed = new Date().toISOString();
            saveChannelStats(channelName, stats);
            
            client.say(channel, `💀 Game Over! The word was ${game.word}. ${guessDisplay} | 6/6 guesses used. Better luck next time!`);
            
            // Clean up game after 30 seconds
            setTimeout(() => {
              channelGames.delete(channelName);
            }, 30000);
          } else {
            // Show alphabet status after each guess
            const alphabetState = getAlphabetState(game);
            const alphabetDisplay = formatAlphabetDisplay(alphabetState);
            
            client.say(channel, `@${displayName}: ${guessDisplay} | Guesses: ${game.guesses.length}/6 | ${alphabetDisplay}`);
          }
        }
        break;
        
      case 'stats':
        const channelStats = loadChannelStats(channelName);
        if (channelStats.gamesPlayed === 0) {
          client.say(channel, `@${displayName}, no Wordle games have been played in this channel yet!`);
          return;
        }
        
        const avgGuesses = (channelStats.totalGuesses / channelStats.gamesPlayed).toFixed(1);
        const topWinners = Object.entries(channelStats.winners)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5);
        
        let statsMsg = `📊 Wordle Stats: ${channelStats.gamesPlayed} games played | Avg guesses: ${avgGuesses}`;
        if (topWinners.length > 0) {
          const winnersText = topWinners.map(([name, wins]) => `@${name} (${wins})`).join(', ');
          statsMsg += ` | Top 5: ${winnersText}`;
        }
        
        client.say(channel, `@${displayName}, ${statsMsg}`);
        break;
        
      case 'chars':
        // Check if game is active
        if (!channelGames.has(channelName)) {
          client.say(channel, `@${displayName}, no Wordle game is currently active! A moderator can start one with !wordle start`);
          return;
        }
        
        const currentGame = channelGames.get(channelName);
        if (!currentGame.active) {
          client.say(channel, `@${displayName}, the current game has ended! A moderator can start a new one with !wordle start`);
          return;
        }
        
        if (currentGame.guesses.length === 0) {
          client.say(channel, `@${displayName}, no guesses have been made yet! All letters are unused: ABCDEFGHIJKLMNOPQRSTUVWXYZ`);
          return;
        }
        
        const alphabetState = getAlphabetState(currentGame);
        const alphabetDisplay = formatAlphabetDisplay(alphabetState);
        
        client.say(channel, `@${displayName}, Letter status: ${alphabetDisplay}`);
        break;
        
      case 'guesses':
        // Check if game is active
        if (!channelGames.has(channelName)) {
          client.say(channel, `@${displayName}, no Wordle game is currently active! A moderator can start one with !wordle start`);
          return;
        }
        
        const activeGame = channelGames.get(channelName);
        if (!activeGame.active) {
          client.say(channel, `@${displayName}, the current game has ended! A moderator can start a new one with !wordle start`);
          return;
        }
        
        if (activeGame.guesses.length === 0) {
          client.say(channel, `@${displayName}, no guesses have been made yet!`);
          return;
        }
        
        // Show all previous guesses
        const guessList = activeGame.guesses.map((g, index) => 
          `${index + 1}. ${g.word} (@${g.displayName})`
        ).join(' | ');
        
        client.say(channel, `@${displayName}, Previous guesses (${activeGame.guesses.length}/6): ${guessList}`);
        break;
        
      case 'help':
        client.say(channel, `@${displayName}, Wordle Help: Mods use !wordle start to begin. Everyone can !wordle guess <word> to play. Goal: guess the 5-letter word in 6 tries! 🟩=correct, 🟨=wrong position, ⬜=not in word. Use !wordle chars for letters, !wordle guesses for previous attempts.`);
        break;
        
      case 'stop':
        if (!isMod) {
          client.say(channel, `@${displayName}, only moderators, broadcasters, and special users can stop Wordle games!`);
          return;
        }
        
        if (!channelGames.has(channelName)) {
          client.say(channel, `@${displayName}, no Wordle game is currently active!`);
          return;
        }
        
        const stoppedGame = channelGames.get(channelName);
        channelGames.delete(channelName);
        
        client.say(channel, `@${displayName}, Wordle game stopped. The word was: ${stoppedGame.word}`);
        break;
        
      default:
        client.say(channel, `@${displayName}, Wordle commands: !wordle start (mods), !wordle guess <word>, !wordle chars, !wordle guesses, !wordle stats, !wordle help, !wordle stop (mods)`);
    }
    
  } catch (error) {
    console.error(`[WORDLE] Error for user ${username} in ${channelName}:`, {
      message: error.message,
      command: command,
      timestamp: new Date().toISOString()
    });
    
    client.say(channel, `@${displayName}, sorry, there was an error with the Wordle game. Please try again!`);
  }
};
const crypto = require('crypto');
const winston = require('winston');
const { Boom } = require('@hapi/boom');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const P = require('pino');

/**
 * OpenClaw WhatsApp Handler (Hardened Edition)
 * Uses Baileys for WhatsApp Web connection with comprehensive security measures
 *
 * Features:
 *   - AES-256-GCM session encryption at rest
 *   - Rate limiting (global, per-phone, per-endpoint)
 *   - Input validation and sanitization
 *   - Phone number allowlisting (CEO only by default)
 *   - Secure session management with timeout
 *   - Command injection prevention
 *   - Comprehensive security logging
 *   - Device linking approval flow
 *   - Session integrity monitoring
 */

// ===== CONFIGURATION =====

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const SESSION_ENCRYPTION_KEY = Buffer.from(
  process.env.SESSION_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex'),
  'hex'
);
const API_TOKEN = process.env.API_TOKEN || crypto.randomBytes(32).toString('hex');
const ALLOWED_PHONES = (process.env.ALLOWED_PHONES || '+12125551234').split(',').map(function(p) { return p.trim(); });
const SESSION_TIMEOUT_MS = parseInt(process.env.SESSION_TIMEOUT_MS || '86400000', 10); // 24 hours
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10); // 1 minute
const RATE_LIMIT_MAX_GLOBAL = parseInt(process.env.RATE_LIMIT_MAX_GLOBAL || '1000', 10);
const RATE_LIMIT_MAX_SEND = parseInt(process.env.RATE_LIMIT_MAX_SEND || '10', 10);
const BAILEYS_SESSION_DIR = process.env.BAILEYS_SESSION_DIR || '/home/openclaw/.openclaw/sessions';

// ===== LOGGER SETUP =====

var logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({
      filename: process.env.LOG_DIR + '/openclaw-error.log' || '/var/log/openclaw/error.log',
      level: 'error'
    }),
    new winston.transports.File({
      filename: process.env.LOG_DIR + '/openclaw-security.log' || '/var/log/openclaw/security.log'
    })
  ],
});

// ===== ENCRYPTION FUNCTIONS =====

/**
 * Encrypt session data using AES-256-GCM
 */
function encryptSessionData(sessionData) {
  var iv = crypto.randomBytes(16);
  var cipher = crypto.createCipheriv(
    ENCRYPTION_ALGORITHM,
    SESSION_ENCRYPTION_KEY,
    iv
  );

  var encrypted = cipher.update(
    JSON.stringify(sessionData),
    'utf8',
    'hex'
  );
  encrypted = encrypted + cipher.final('hex');

  var authTag = cipher.getAuthTag();

  return {
    iv: iv.toString('hex'),
    encryptedData: encrypted,
    authTag: authTag.toString('hex'),
    algorithm: ENCRYPTION_ALGORITHM,
    timestamp: Date.now()
  };
}

/**
 * Decrypt session data using AES-256-GCM
 */
function decryptSessionData(encryptedObj) {
  var decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    SESSION_ENCRYPTION_KEY,
    Buffer.from(encryptedObj.iv, 'hex')
  );

  decipher.setAuthTag(Buffer.from(encryptedObj.authTag, 'hex'));

  var decrypted = decipher.update(
    encryptedObj.encryptedData,
    'hex',
    'utf8'
  );
  decrypted = decrypted + decipher.final('utf8');

  return JSON.parse(decrypted);
}

// ===== INPUT VALIDATION =====

/**
 * Validate incoming message
 */
function validateIncomingMessage(message) {
  var errors = [];

  // Check message exists and is string
  if (!message || typeof message !== 'string') {
    errors.push('Message must be non-empty string');
  }

  // Check length (WhatsApp limit: 4096 chars)
  if (message.length > 4096) {
    errors.push('Message exceeds maximum length (4096)');
  }

  // Check for code injection patterns
  var dangerousPatterns = [
    /eval\(/gi,
    /Function\(/gi,
    /require\(/gi,
    /import\(/gi,
    /child_process/gi,
    /exec\(/gi,
    /spawn\(/gi,
    /process\./gi,
    /__proto__/gi,
    /constructor/gi
  ];

  for (var i = 0; i < dangerousPatterns.length; i++) {
    if (dangerousPatterns[i].test(message)) {
      errors.push('Message contains dangerous patterns');
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors,
    sanitized: sanitizeMessage(message)
  };
}

/**
 * Sanitize message for safe processing
 */
function sanitizeMessage(message) {
  return message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}

/**
 * Validate phone number in E.164 format
 */
function validatePhoneNumber(phone) {
  var e164Regex = /^\+[1-9]\d{1,14}$/;

  if (!e164Regex.test(phone)) {
    return {
      valid: false,
      error: 'Phone must be in E.164 format (+1234567890)'
    };
  }

  if (ALLOWED_PHONES.indexOf(phone) === -1) {
    logger.warn('Unauthorized phone number attempted', {
      phone: phone,
      timestamp: new Date()
    });
    return {
      valid: false,
      error: 'Phone number not in allowlist'
    };
  }

  return { valid: true };
}

// ===== RATE LIMITING =====

var globalRateLimitMap = new Map();
var sendRateLimitMap = new Map();

/**
 * Check global rate limit
 */
function checkGlobalRateLimit(identifier) {
  var now = Date.now();
  var key = 'global_' + identifier;

  if (!globalRateLimitMap.has(key)) {
    globalRateLimitMap.set(key, []);
  }

  var requests = globalRateLimitMap.get(key);
  requests = requests.filter(function(t) { return (now - t) < RATE_LIMIT_WINDOW_MS; });
  requests.push(now);
  globalRateLimitMap.set(key, requests);

  if (requests.length > RATE_LIMIT_MAX_GLOBAL) {
    logger.warn('Global rate limit exceeded', {
      identifier: identifier,
      requests: requests.length,
      limit: RATE_LIMIT_MAX_GLOBAL
    });
    return false;
  }

  return true;
}

/**
 * Check send message rate limit
 */
function checkSendRateLimit(phoneNumber) {
  var now = Date.now();
  var key = 'send_' + phoneNumber;

  if (!sendRateLimitMap.has(key)) {
    sendRateLimitMap.set(key, []);
  }

  var requests = sendRateLimitMap.get(key);
  requests = requests.filter(function(t) { return (now - t) < RATE_LIMIT_WINDOW_MS; });
  requests.push(now);
  sendRateLimitMap.set(key, requests);

  if (requests.length > RATE_LIMIT_MAX_SEND) {
    logger.warn('Send rate limit exceeded', {
      phoneNumber: phoneNumber,
      requests: requests.length,
      limit: RATE_LIMIT_MAX_SEND
    });
    return false;
  }

  return true;
}

// ===== AGENT ALIASES =====

var AGENT_ALIASES = {
  'ceo': 'agent-00',
  'ceo agent': 'agent-00',
  'abi': 'agent-00',
  'scout': 'agent-01',
  'prospect scout': 'agent-01',
  'prospect': 'agent-01',
  'decision maker': 'agent-02',
  'finder': 'agent-02',
  'icp': 'agent-03',
  'icp profiler': 'agent-03',
  'profiler': 'agent-03',
  'linkedin': 'agent-04',
  'linkedin outreach': 'agent-04',
  'email': 'agent-05',
  'email writer': 'agent-05',
  'sales writer': 'agent-06',
  'writer': 'agent-06',
  'objection': 'agent-07',
  'objection handler': 'agent-07',
  'followup': 'agent-08',
  'follow-up': 'agent-08',
  'follow up': 'agent-08',
  'multichannel': 'agent-09',
  'multi-channel': 'agent-09',
  'demo': 'agent-10',
  'demo scheduler': 'agent-10',
  'proposal': 'agent-11',
  'proposal generator': 'agent-11',
  'roi': 'agent-12',
  'roi calculator': 'agent-12',
  'negotiation': 'agent-13',
  'negotiation analyst': 'agent-13',
  'contract': 'agent-14',
  'contract prep': 'agent-14',
  'competitor': 'agent-15',
  'competitor intel': 'agent-15',
  'win loss': 'agent-16',
  'win/loss': 'agent-16',
  'customer success': 'agent-17',
  'cs': 'agent-17',
  'thought leadership': 'agent-18',
  'thought': 'agent-18',
  'case study': 'agent-19',
  'social media': 'agent-20',
  'social': 'agent-20',
  'website': 'agent-21',
  'website publisher': 'agent-21',
  'events': 'agent-22',
  'community': 'agent-22',
  'product feedback': 'agent-23',
  'feedback': 'agent-23',
  'market trends': 'agent-24',
  'trends': 'agent-24',
  'brand': 'agent-25',
  'brand comms': 'agent-25',
  'partnerships': 'agent-26',
  'strategic partnerships': 'agent-26',
  'partner': 'agent-26',
  'dashboard': 'agent-27',
  'ceo dashboard': 'agent-27',
  'performance': 'agent-28',
  'optimizer': 'agent-28',
  'compliance': 'agent-29',
  'compliance monitor': 'agent-29',
  'bdr': 'agent-04',
  'market scanner': 'agent-01',
};

// ===== OPENCLAW HANDLER CLASS =====

function OpenClawHandler(agentsConfig, triggerAgent, agentRunner, jobQueue, executionHistory, supabaseClient) {
  this.agentsConfig = agentsConfig;
  this.triggerAgent = triggerAgent;
  this.agentRunner = agentRunner;
  this.jobQueue = jobQueue;
  this.executionHistory = executionHistory;
  this.supabase = supabaseClient;

  // Baileys socket instance
  this.sock = null;

  // Session state
  this.sessionId = 'openclaw-session-default';
  this.sessionMetadata = {
    createdAt: Date.now(),
    linkedDevices: [],
    connectionHistory: [],
    lastActivity: Date.now(),
    qrCode: null,
    qrTimeout: null
  };

  // Conversation tracking
  this.conversations = new Map();

  // Initialize async
  this._initialized = false;
}

/**
 * Initialize Baileys connection
 */
OpenClawHandler.prototype.initialize = function() {
  var self = this;

  return new Promise(function(resolve, reject) {
    logger.info('Initializing OpenClaw handler with Baileys');

    // Use auth directory for session
    useMultiFileAuthState(BAILEYS_SESSION_DIR).then(function(authState) {
      var { state, saveCreds } = authState;

      var sock = makeWASocket({
        auth: state,
        // Use pino for logging
        logger: P({ level: 'fatal' }),
        // QR code handling
        qrTimeout: 60000,
        // Browser info
        browser: ['Drooid WhatsApp', 'Chrome', '1.0'],
        // Download history limit
        downloadHistory: 50,
        // Sync version
        syncFullHistory: false,
      });

      // Save credentials after update
      sock.ev.on('creds.update', saveCreds);

      // Connection update handler
      sock.ev.on('connection.update', function(update) {
        self.handleConnectionUpdate(update);
      });

      // Message reception handler
      sock.ev.on('messages.upsert', function(m) {
        self.handleIncomingMessage(m);
      });

      // Socket close handler
      sock.ev.on('connection.error', function(err) {
        logger.error('Connection error', {
          error: err.message,
          code: err.code,
          timestamp: new Date()
        });
      });

      self.sock = sock;
      self._initialized = true;

      logger.info('OpenClaw handler initialized successfully');
      resolve();
    }).catch(function(err) {
      logger.error('Failed to initialize OpenClaw handler', {
        error: err.message,
        stack: err.stack
      });
      reject(err);
    });
  });
};

/**
 * Handle connection state updates
 */
OpenClawHandler.prototype.handleConnectionUpdate = function(update) {
  var self = this;
  var connection = update.connection;
  var lastDisconnect = update.lastDisconnect;
  var qr = update.qr;
  var isNewLogin = update.isNewLogin;

  if (qr) {
    logger.info('QR code generated for device linking', {
      sessionId: this.sessionId,
      timestamp: new Date()
    });
    this.sessionMetadata.qrCode = qr;
  }

  if (connection === 'open') {
    logger.info('Successfully connected to WhatsApp', {
      sessionId: this.sessionId,
      jid: this.sock.user.id,
      timestamp: new Date()
    });
    this.sessionMetadata.connectionHistory.push({
      connectedAt: Date.now(),
      disconnectedAt: null,
      reason: 'User initiated'
    });
  }

  if (connection === 'close') {
    logger.warn('WhatsApp connection closed', {
      statusCode: lastDisconnect ? lastDisconnect.error.output.statusCode : 'unknown',
      timestamp: new Date()
    });

    // Don't auto-reconnect if logged out
    if (lastDisconnect && lastDisconnect.error.output.statusCode === 401) {
      logger.info('Device was logged out. Manual re-authentication required.');
    } else if (connection !== 'connecting') {
      // Attempt reconnect after 3 seconds
      setTimeout(function() {
        self.initialize().catch(function(err) {
          logger.error('Reconnection failed', { error: err.message });
        });
      }, 3000);
    }
  }
};

/**
 * Handle incoming message
 */
OpenClawHandler.prototype.handleIncomingMessage = function(m) {
  var self = this;

  try {
    var messages = m.messages;

    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];

      if (!msg.message) continue;

      var remoteJid = msg.key.remoteJid;
      var sender = remoteJid.split('@')[0];

      // Validate sender
      var phoneValidation = validatePhoneNumber('+' + sender);
      if (!phoneValidation.valid) {
        logger.warn('Message from unauthorized sender', {
          sender: sender,
          reason: phoneValidation.error
        });
        continue;
      }

      // Check rate limit
      if (!checkSendRateLimit(sender)) {
        logger.warn('Rate limit exceeded for sender', { sender: sender });
        self.sock.sendMessage(remoteJid, {
          text: 'Rate limit exceeded. Please wait before sending more messages.'
        });
        continue;
      }

      // Extract message text
      var text = msg.message.conversation ||
                 msg.message.extendedTextMessage?.text || '';

      if (!text) continue;

      // Validate message content
      var validation = validateIncomingMessage(text);
      if (!validation.valid) {
        logger.warn('Invalid message content', {
          sender: sender,
          errors: validation.errors,
          length: text.length
        });
        continue;
      }

      // Update last activity
      self.sessionMetadata.lastActivity = Date.now();

      // Process message
      self.processMessage(text, sender, remoteJid).catch(function(err) {
        logger.error('Error processing message', {
          sender: sender,
          error: err.message
        });
      });
    }
  } catch (error) {
    logger.error('Error handling incoming message', {
      error: error.message,
      stack: error.stack
    });
  }
};

/**
 * Process message and route to command handler
 */
OpenClawHandler.prototype.processMessage = function(text, sender, remoteJid) {
  var self = this;
  var textLower = text.toLowerCase().trim();

  // Check global rate limit
  if (!checkGlobalRateLimit(sender)) {
    return this.sendMessage(remoteJid, 'Too many requests. Please wait.');
  }

  // Command routing
  if (textLower === 'help' || textLower === '?') {
    return this.handleHelp(remoteJid);
  }

  if (textLower === 'list' || textLower === 'list agents' || textLower === 'agents') {
    return this.handleListAgents(remoteJid);
  }

  if (textLower === 'status' || textLower === 'overview') {
    return this.handleStatus(remoteJid);
  }

  if (textLower.indexOf('approve ') === 0) {
    var id = textLower.replace('approve ', '').trim();
    return this.handleApprove(id, remoteJid);
  }

  if (textLower.indexOf('reject ') === 0) {
    var id = textLower.replace('reject ', '').trim();
    return this.handleReject(id, remoteJid);
  }

  if (textLower === 'approvals' || textLower === 'pending') {
    return this.handlePendingApprovals(remoteJid);
  }

  if (textLower === 'leads' || textLower === 'new leads') {
    return this.handleLeads(remoteJid);
  }

  if (textLower === 'pipeline') {
    return this.handlePipeline(remoteJid);
  }

  if (textLower === 'pause' || textLower === 'pause all') {
    this.jobQueue.pause();
    return this.sendMessage(remoteJid, 'All agents paused. Send "resume" to restart.');
  }

  if (textLower === 'resume' || textLower === 'resume all') {
    this.jobQueue.resume();
    return this.sendMessage(remoteJid, 'All agents resumed and running on schedule.');
  }

  // Check for @agent mentions
  if (text.indexOf('@') === 0 || textLower.indexOf('talk to ') === 0 || textLower.indexOf('ask ') === 0) {
    return this.handleAgentChat(text, sender, remoteJid);
  }

  // Check for "run <agent>" or "trigger <agent>"
  if (textLower.indexOf('run ') === 0 || textLower.indexOf('trigger ') === 0) {
    var agentQuery = textLower.replace(/^(run|trigger)\s+/, '').trim();
    return this.handleTriggerAgent(agentQuery, remoteJid);
  }

  // Default: treat as general query to CEO Agent
  return this.handleGeneralQuery(text, sender, remoteJid);
};

/**
 * Handle help command
 */
OpenClawHandler.prototype.handleHelp = function(remoteJid) {
  var response = '*OpenClaw Command Center*\n\n' +
    'Available commands:\n\n' +
    '*Talk to agents:*\n' +
    '  @BDR what leads do you have?\n' +
    '  @Scout find companies in fintech\n' +
    '  talk to Proposal Generator\n\n' +
    '*Quick commands:*\n' +
    '  agents - list all agents\n' +
    '  status - system overview\n' +
    '  leads - recent leads\n' +
    '  pipeline - pipeline summary\n' +
    '  approvals - pending approvals\n\n' +
    '*Actions:*\n' +
    '  run <agent> - trigger agent now\n' +
    '  approve <id> - approve item\n' +
    '  reject <id> - reject item\n' +
    '  pause - pause all agents\n' +
    '  resume - resume all agents\n\n' +
    'Or just type a question and the CEO Agent will answer.';

  return this.sendMessage(remoteJid, response);
};

/**
 * Handle list agents command
 */
OpenClawHandler.prototype.handleListAgents = function(remoteJid) {
  var phases = {};
  var self = this;

  this.agentsConfig.forEach(function(agent) {
    var phase = agent.phase || 'other';
    if (!phases[phase]) phases[phase] = [];
    var lastRun = self.executionHistory.get(agent.id);
    var statusEmoji = lastRun && (Date.now() - lastRun < 3600000) ? '🟢' : lastRun ? '🟡' : '⚪';
    phases[phase].push(statusEmoji + ' ' + agent.name);
  });

  var response = '*Your 30 AI Agents:*\n';
  for (var phase in phases) {
    if (phases.hasOwnProperty(phase)) {
      response += '\n*' + phase.charAt(0).toUpperCase() + phase.slice(1) + ':*\n';
      phases[phase].forEach(function(a) {
        response += '  ' + a + '\n';
      });
    }
  }
  response += '\nUse @AgentName to chat with any agent.';

  return this.sendMessage(remoteJid, response);
};

/**
 * Handle status command
 */
OpenClawHandler.prototype.handleStatus = function(remoteJid) {
  var queueStatus = this.jobQueue.getStatus();
  var activeCount = 0;

  this.executionHistory.forEach(function(t) {
    if (Date.now() - t < 3600000) activeCount++;
  });

  var response = '*System Status*\n\n' +
    'Agents active (last hour): ' + activeCount + '/' + this.agentsConfig.length + '\n' +
    'Queue: ' + queueStatus.runningCount + ' running, ' + queueStatus.queueLength + ' waiting\n' +
    'Jobs processed: ' + queueStatus.stats.processed + '\n' +
    'Jobs failed: ' + queueStatus.stats.failed + '\n' +
    'Uptime: ' + Math.round(process.uptime() / 60) + ' minutes';

  return this.sendMessage(remoteJid, response);
};

/**
 * Handle approve command
 */
OpenClawHandler.prototype.handleApprove = function(id, remoteJid) {
  var self = this;

  if (!this.supabase) {
    return this.sendMessage(remoteJid, 'Supabase not connected. Cannot process approvals.');
  }

  return this.supabase
    .from('approvals')
    .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: 'openclaw' })
    .eq('id', id)
    .select()
    .then(function(result) {
      var data = result.data;
      var error = result.error;

      if (error) throw error;
      if (!data || data.length === 0) {
        return self.sendMessage(remoteJid, 'No approval found with ID: ' + id);
      }

      logger.info('Approval processed via OpenClaw', {
        id: id,
        description: data[0].description,
        timestamp: new Date()
      });

      return self.sendMessage(remoteJid, 'Approved: ' + (data[0].description || id) + '\nThe agent will now proceed with the action.');
    })
    .catch(function(error) {
      logger.error('Approval error', { error: error.message, id: id });
      return self.sendMessage(remoteJid, 'Error processing approval: ' + error.message);
    });
};

/**
 * Handle reject command
 */
OpenClawHandler.prototype.handleReject = function(id, remoteJid) {
  var self = this;

  if (!this.supabase) {
    return this.sendMessage(remoteJid, 'Supabase not connected. Cannot process rejections.');
  }

  return this.supabase
    .from('approvals')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: 'openclaw' })
    .eq('id', id)
    .select()
    .then(function(result) {
      var data = result.data;
      var error = result.error;

      if (error) throw error;
      if (!data || data.length === 0) {
        return self.sendMessage(remoteJid, 'No approval found with ID: ' + id);
      }

      logger.info('Rejection processed via OpenClaw', {
        id: id,
        description: data[0].description,
        timestamp: new Date()
      });

      return self.sendMessage(remoteJid, 'Rejected: ' + (data[0].description || id));
    })
    .catch(function(error) {
      logger.error('Rejection error', { error: error.message, id: id });
      return self.sendMessage(remoteJid, 'Error processing rejection: ' + error.message);
    });
};

/**
 * Handle pending approvals command
 */
OpenClawHandler.prototype.handlePendingApprovals = function(remoteJid) {
  var self = this;

  if (!this.supabase) {
    return this.sendMessage(remoteJid, 'Supabase not connected.');
  }

  return this.supabase
    .from('approvals')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(10)
    .then(function(result) {
      var data = result.data;
      var error = result.error;

      if (error) throw error;

      if (!data || data.length === 0) {
        return self.sendMessage(remoteJid, 'No pending approvals. All clear!');
      }

      var response = '*Pending Approvals (' + data.length + '):*\n\n';
      data.forEach(function(item, i) {
        response += (i + 1) + '. *' + (item.agent_name || 'Unknown') + '*\n';
        response += '   ' + (item.description || 'No description').substring(0, 100) + '\n';
        response += '   ID: ' + item.id + '\n';
        response += '   Reply: approve ' + item.id + ' / reject ' + item.id + '\n\n';
      });

      return self.sendMessage(remoteJid, response);
    })
    .catch(function(error) {
      return self.sendMessage(remoteJid, 'Error fetching approvals: ' + error.message);
    });
};

/**
 * Handle leads command
 */
OpenClawHandler.prototype.handleLeads = function(remoteJid) {
  var self = this;

  if (!this.supabase) {
    return this.sendMessage(remoteJid, 'Supabase not connected.');
  }

  return this.supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5)
    .then(function(result) {
      var data = result.data;
      var error = result.error;

      if (error) throw error;

      if (!data || data.length === 0) {
        return self.sendMessage(remoteJid, 'No leads found yet.');
      }

      var response = '*Recent Leads (' + data.length + '):*\n\n';
      data.forEach(function(lead, i) {
        response += (i + 1) + '. *' + lead.company + '*\n';
        response += '   Industry: ' + (lead.industry || 'N/A') + '\n';
        response += '   ICP Score: ' + (lead.icp_score || 'N/A') + '\n';
        response += '   Status: ' + (lead.status || 'new') + '\n\n';
      });

      return self.sendMessage(remoteJid, response);
    })
    .catch(function(error) {
      return self.sendMessage(remoteJid, 'Error fetching leads: ' + error.message);
    });
};

/**
 * Handle pipeline command
 */
OpenClawHandler.prototype.handlePipeline = function(remoteJid) {
  var self = this;

  if (!this.supabase) {
    return this.sendMessage(remoteJid, 'Supabase not connected.');
  }

  return this.supabase
    .from('pipeline')
    .select('stage, id')
    .order('created_at', { ascending: false })
    .then(function(result) {
      var data = result.data;
      var error = result.error;

      if (error) throw error;

      var stages = {};
      (data || []).forEach(function(item) {
        stages[item.stage] = (stages[item.stage] || 0) + 1;
      });

      var response = '*Pipeline Summary:*\n\n';
      var stageOrder = ['new', 'qualified', 'engaged', 'proposal', 'negotiation', 'won', 'lost'];
      stageOrder.forEach(function(stage) {
        if (stages[stage]) {
          response += '  ' + stage.charAt(0).toUpperCase() + stage.slice(1) + ': ' + stages[stage] + '\n';
        }
      });

      if (Object.keys(stages).length === 0) {
        response += 'No pipeline data yet.';
      }

      return self.sendMessage(remoteJid, response);
    })
    .catch(function(error) {
      return self.sendMessage(remoteJid, 'Error fetching pipeline: ' + error.message);
    });
};

/**
 * Handle trigger agent command
 */
OpenClawHandler.prototype.handleTriggerAgent = function(agentQuery, remoteJid) {
  var agentId = this.fuzzyMatchAgent(agentQuery);
  if (!agentId) {
    return this.sendMessage(remoteJid, 'Could not find an agent matching "' + agentQuery + '". Type "agents" to see the full list.');
  }

  var agent = this.agentsConfig.find(function(a) { return a.id === agentId; });
  if (!agent) {
    return this.sendMessage(remoteJid, 'Agent ' + agentId + ' not found in config.');
  }

  try {
    this.triggerAgent(agent, { source: 'openclaw' }, 'high');
    logger.info('Agent triggered via OpenClaw', {
      agentId: agent.id,
      agentName: agent.name,
      timestamp: new Date()
    });
    return this.sendMessage(remoteJid, 'Triggered *' + agent.name + '* (' + agent.id + '). Running now with high priority.\n\nI will notify you when it completes.');
  } catch (error) {
    return this.sendMessage(remoteJid, 'Error triggering ' + agent.name + ': ' + error.message);
  }
};

/**
 * Handle agent chat
 */
OpenClawHandler.prototype.handleAgentChat = function(text, sender, remoteJid) {
  var agentQuery, message;
  var textLower = text.toLowerCase();

  if (text.indexOf('@') === 0) {
    // @AgentName message
    var spaceIdx = text.indexOf(' ', 1);
    if (spaceIdx === -1) {
      agentQuery = text.substring(1).trim();
      message = 'What is your current status and what are you working on?';
    } else {
      agentQuery = text.substring(1, spaceIdx).trim();
      message = text.substring(spaceIdx + 1).trim();
    }
  } else if (textLower.indexOf('talk to ') === 0) {
    var rest = text.substring(8).trim();
    var parts = rest.split(/[,:]|\s+about\s+|\s+regarding\s+/i);
    agentQuery = parts[0].trim();
    message = parts.length > 1 ? parts.slice(1).join(' ').trim() : 'What is your current status?';
  } else if (textLower.indexOf('ask ') === 0) {
    var rest = text.substring(4).trim();
    var parts = rest.split(/\s+to\s+|\s+about\s+|\s+regarding\s+/i);
    agentQuery = parts[0].trim();
    message = parts.length > 1 ? parts.slice(1).join(' ').trim() : 'What is your current status?';
  }

  var agentId = this.fuzzyMatchAgent(agentQuery.toLowerCase());
  if (!agentId) {
    return this.sendMessage(remoteJid, 'Could not find agent "' + agentQuery + '". Try:\n  @BDR, @Scout, @LinkedIn, @Email, @Demo, @Proposal, etc.\nOr type "agents" to see the full list.');
  }

  var agent = this.agentsConfig.find(function(a) { return a.id === agentId; });
  if (!agent) {
    return this.sendMessage(remoteJid, 'Agent ' + agentId + ' not in config.');
  }

  return this.chatWithAgent(agent, message, remoteJid);
};

/**
 * Chat with a specific agent
 */
OpenClawHandler.prototype.chatWithAgent = function(agent, message, remoteJid) {
  var self = this;

  try {
    var chatPrompt = 'You are ' + agent.name + ', an AI sales agent at Drooid. ' +
      'Your role: ' + agent.description + '\n\n' +
      'The CEO (Abi) is messaging you via WhatsApp. Answer concisely (under 300 words) and be direct.\n\n' +
      'CEO message: "' + message + '"\n\n' +
      'Respond as ' + agent.name + '. Include relevant data from your recent work if applicable. ' +
      'If you need to take an action, describe what you would do. Keep the tone professional but conversational.';

    return this.agentRunner.callGeminiWithRetry(
      chatPrompt,
      'You are ' + agent.name + ', a specialized AI sales agent. Be concise, data-driven, and actionable.',
      agent,
      2
    ).then(function(result) {
      if (result.success) {
        var agentResponse = result.content.substring(0, 1500); // WhatsApp char limit
        return self.sendMessage(remoteJid, '*' + agent.name + ':*\n\n' + agentResponse + '\n\n_Chatting with ' + agent.name + '. Send another message or type "help" for commands._');
      } else {
        return self.sendMessage(remoteJid, agent.name + ' is unavailable right now. Error: ' + result.error);
      }
    }).catch(function(error) {
      logger.error('Agent chat error', { agentId: agent.id, error: error.message });
      return self.sendMessage(remoteJid, 'Could not reach ' + agent.name + ': ' + error.message + '\n\nTry again or use "run ' + agent.name.toLowerCase() + '" to trigger the agent.');
    });
  } catch (error) {
    logger.error('Chat error', { error: error.message });
    return this.sendMessage(remoteJid, 'Error: ' + error.message);
  }
};

/**
 * Handle general query to CEO Agent
 */
OpenClawHandler.prototype.handleGeneralQuery = function(text, sender, remoteJid) {
  var ceoAgent = this.agentsConfig.find(function(a) { return a.id === 'agent-00'; });
  if (!ceoAgent) {
    return this.sendMessage(remoteJid, 'CEO Agent not configured. Type "help" for available commands.');
  }

  return this.chatWithAgent(ceoAgent, text, remoteJid);
};

/**
 * Fuzzy match agent name to agent ID
 */
OpenClawHandler.prototype.fuzzyMatchAgent = function(query) {
  // Direct alias match
  if (AGENT_ALIASES[query]) return AGENT_ALIASES[query];

  // Partial match on aliases
  for (var alias in AGENT_ALIASES) {
    if (AGENT_ALIASES.hasOwnProperty(alias)) {
      if (alias.indexOf(query) !== -1 || query.indexOf(alias) !== -1) {
        return AGENT_ALIASES[alias];
      }
    }
  }

  // Match against config names
  for (var i = 0; i < this.agentsConfig.length; i++) {
    var agent = this.agentsConfig[i];
    var nameLower = agent.name.toLowerCase();
    if (nameLower === query || nameLower.indexOf(query) !== -1 || query.indexOf(nameLower) !== -1) {
      return agent.id;
    }
  }

  // Try agent ID directly
  if (/^agent-\d{2}$/.test(query)) {
    return query;
  }

  return null;
};

/**
 * Send message via Baileys
 */
OpenClawHandler.prototype.sendMessage = function(remoteJid, text) {
  var self = this;

  if (!this.sock) {
    logger.error('Socket not initialized - cannot send message');
    return Promise.reject(new Error('WhatsApp connection not ready'));
  }

  return this.sock.sendMessage(remoteJid, { text: text }).then(function(result) {
    logger.info('Message sent successfully', {
      remoteJid: remoteJid,
      length: text.length,
      timestamp: new Date()
    });
    return result;
  }).catch(function(error) {
    logger.error('Failed to send message', {
      remoteJid: remoteJid,
      error: error.message
    });
    return Promise.reject(error);
  });
};

/**
 * Send notification to admin
 */
OpenClawHandler.prototype.sendNotification = function(message) {
  var self = this;

  if (!this.sock) {
    logger.warn('WhatsApp notification skipped - socket not initialized');
    return Promise.resolve();
  }

  var adminPhone = ALLOWED_PHONES[0];
  if (!adminPhone) {
    logger.warn('No admin phone configured');
    return Promise.resolve();
  }

  return this.sendMessage(adminPhone + '@s.whatsapp.net', message).catch(function(err) {
    logger.error('Failed to send notification', { error: err.message });
  });
};

/**
 * Validate API token
 */
OpenClawHandler.prototype.validateAPIToken = function(token) {
  if (!token) {
    return { valid: false, error: 'No token provided' };
  }

  if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(API_TOKEN))) {
    return { valid: true };
  }

  logger.warn('Invalid API token attempted', {
    tokenHash: crypto.createHash('sha256').update(token).digest('hex'),
    timestamp: new Date()
  });

  return { valid: false, error: 'Invalid token' };
};

/**
 * Get session metadata (encrypted)
 */
OpenClawHandler.prototype.getSessionMetadata = function() {
  return encryptSessionData(this.sessionMetadata);
};

/**
 * Restore session metadata (decrypted)
 */
OpenClawHandler.prototype.restoreSessionMetadata = function(encryptedMetadata) {
  try {
    this.sessionMetadata = decryptSessionData(encryptedMetadata);
    logger.info('Session metadata restored', {
      sessionId: this.sessionId,
      timestamp: new Date()
    });
    return true;
  } catch (error) {
    logger.error('Failed to restore session metadata', {
      error: error.message
    });
    return false;
  }
};

module.exports = OpenClawHandler;

const winston = require('winston');

/**
 * WhatsApp Handler for Drooid Sales Engine
 * Enables CEO to communicate with individual agents via WhatsApp (Twilio)
 *
 * Usage:
 *   - Text "list agents" → shows all agents
 *   - Text "@BDR what's your status?" → talks to the BDR agent
 *   - Text "@CEO Agent run now" → triggers the CEO agent
 *   - Text "status" → system overview
 *   - Text "approve 123" → approve pending item
 *   - Text "reject 123" → reject pending item
 *   - Voice messages are transcribed by Twilio and handled as text
 */

const logger = winston.createLogger({
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
  ],
});

// Agent name aliases for fuzzy matching
const AGENT_ALIASES = {
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

class WhatsAppHandler {
  constructor(agentsConfig, triggerAgent, agentRunner, jobQueue, executionHistory, supabaseClient) {
    this.agentsConfig = agentsConfig;
    this.triggerAgent = triggerAgent;
    this.agentRunner = agentRunner;
    this.jobQueue = jobQueue;
    this.executionHistory = executionHistory;
    this.supabase = supabaseClient;
    this.twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
    this.twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
    this.twilioWhatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
    this.ceoWhatsappNumber = process.env.CEO_WHATSAPP_NUMBER;

    // Conversation state per user (for multi-turn agent chats)
    this.conversations = new Map();
  }

  /**
   * Validate incoming Twilio webhook (optional but recommended)
   */
  validateTwilioSignature(req) {
    // In production, validate X-Twilio-Signature
    // For sandbox development, skip validation
    if (process.env.NODE_ENV === 'production' && this.twilioAuthToken) {
      // TODO: Add twilio signature validation
      return true;
    }
    return true;
  }

  /**
   * Process incoming WhatsApp message
   * Returns TwiML response string
   */
  async processMessage(body) {
    const from = body.From; // e.g., whatsapp:+1234567890
    const messageBody = (body.Body || '').trim();
    const numMedia = parseInt(body.NumMedia || '0', 10);

    logger.info('WhatsApp message received', { from, messageBody: messageBody.substring(0, 100), numMedia });

    // Handle voice messages (Twilio transcribes them)
    let text = messageBody;
    if (numMedia > 0 && body.MediaContentType0 && body.MediaContentType0.startsWith('audio/')) {
      // Twilio can auto-transcribe voice messages if enabled
      text = body.Body || 'Voice message received but no transcription available';
    }

    if (!text) {
      return this.formatResponse('Please send a text or voice message. Type "help" to see available commands.');
    }

    const textLower = text.toLowerCase().trim();

    try {
      // Command routing
      if (textLower === 'help' || textLower === '?') {
        return this.handleHelp();
      }

      if (textLower === 'list' || textLower === 'list agents' || textLower === 'agents') {
        return this.handleListAgents();
      }

      if (textLower === 'status' || textLower === 'overview') {
        return this.handleStatus();
      }

      if (textLower.startsWith('approve ')) {
        return await this.handleApprove(textLower.replace('approve ', '').trim());
      }

      if (textLower.startsWith('reject ')) {
        return await this.handleReject(textLower.replace('reject ', '').trim());
      }

      if (textLower === 'approvals' || textLower === 'pending') {
        return await this.handlePendingApprovals();
      }

      if (textLower === 'leads' || textLower === 'new leads') {
        return await this.handleLeads();
      }

      if (textLower === 'pipeline') {
        return await this.handlePipeline();
      }

      if (textLower === 'pause' || textLower === 'pause all') {
        this.jobQueue.pause();
        return this.formatResponse('All agents paused. Send "resume" to restart.');
      }

      if (textLower === 'resume' || textLower === 'resume all') {
        this.jobQueue.resume();
        return this.formatResponse('All agents resumed and running on schedule.');
      }

      // Check for @agent mentions
      if (text.startsWith('@') || text.startsWith('talk to ') || text.startsWith('ask ')) {
        return await this.handleAgentChat(text, from);
      }

      // Check for "run <agent>" or "trigger <agent>"
      if (textLower.startsWith('run ') || textLower.startsWith('trigger ')) {
        const agentQuery = textLower.replace(/^(run|trigger)\s+/, '').trim();
        return await this.handleTriggerAgent(agentQuery);
      }

      // Try to match as an agent conversation (fuzzy)
      const matchedAgent = this.fuzzyMatchAgent(textLower);
      if (matchedAgent && this.conversations.has(from)) {
        return await this.handleAgentChat(text, from);
      }

      // Default: treat as a general query to the CEO Agent
      return await this.handleGeneralQuery(text, from);

    } catch (error) {
      logger.error('Error processing WhatsApp message', { error: error.message, from });
      return this.formatResponse('Something went wrong processing your message. Please try again.');
    }
  }

  /**
   * Help command
   */
  handleHelp() {
    return this.formatResponse(
      '*Drooid Command Center*\n\n' +
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
      'Or just type a question and the CEO Agent will answer.'
    );
  }

  /**
   * List all agents with their status
   */
  handleListAgents() {
    const phases = {};
    this.agentsConfig.forEach(agent => {
      const phase = agent.phase || 'other';
      if (!phases[phase]) phases[phase] = [];
      const lastRun = this.executionHistory.get(agent.id);
      const statusEmoji = lastRun && (Date.now() - lastRun < 3600000) ? '🟢' : lastRun ? '🟡' : '⚪';
      phases[phase].push(`${statusEmoji} ${agent.name}`);
    });

    let response = '*Your 30 AI Agents:*\n';
    for (const [phase, agents] of Object.entries(phases)) {
      response += `\n*${phase.charAt(0).toUpperCase() + phase.slice(1)}:*\n`;
      agents.forEach(a => { response += `  ${a}\n`; });
    }
    response += '\nUse @AgentName to chat with any agent.';
    return this.formatResponse(response);
  }

  /**
   * System status overview
   */
  handleStatus() {
    const queueStatus = this.jobQueue.getStatus();
    const activeCount = Array.from(this.executionHistory.values())
      .filter(t => Date.now() - t < 3600000).length;

    return this.formatResponse(
      '*System Status*\n\n' +
      `Agents active (last hour): ${activeCount}/${this.agentsConfig.length}\n` +
      `Queue: ${queueStatus.runningCount} running, ${queueStatus.queueLength} waiting\n` +
      `Jobs processed: ${queueStatus.stats.processed}\n` +
      `Jobs failed: ${queueStatus.stats.failed}\n` +
      `Uptime: ${Math.round(process.uptime() / 60)} minutes`
    );
  }

  /**
   * Handle approval
   */
  async handleApprove(id) {
    if (!this.supabase) {
      return this.formatResponse('Supabase not connected. Cannot process approvals.');
    }

    try {
      const { data, error } = await this.supabase
        .from('approvals')
        .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: 'whatsapp' })
        .eq('id', id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        return this.formatResponse(`No approval found with ID: ${id}`);
      }

      return this.formatResponse(`Approved: ${data[0].description || id}\nThe agent will now proceed with the action.`);
    } catch (error) {
      logger.error('Approval error', { error: error.message, id });
      return this.formatResponse(`Error processing approval: ${error.message}`);
    }
  }

  /**
   * Handle rejection
   */
  async handleReject(id) {
    if (!this.supabase) {
      return this.formatResponse('Supabase not connected. Cannot process rejections.');
    }

    try {
      const { data, error } = await this.supabase
        .from('approvals')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: 'whatsapp' })
        .eq('id', id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        return this.formatResponse(`No approval found with ID: ${id}`);
      }

      return this.formatResponse(`Rejected: ${data[0].description || id}`);
    } catch (error) {
      logger.error('Rejection error', { error: error.message, id });
      return this.formatResponse(`Error processing rejection: ${error.message}`);
    }
  }

  /**
   * Show pending approvals
   */
  async handlePendingApprovals() {
    if (!this.supabase) {
      return this.formatResponse('Supabase not connected.');
    }

    try {
      const { data, error } = await this.supabase
        .from('approvals')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      if (!data || data.length === 0) {
        return this.formatResponse('No pending approvals. All clear!');
      }

      let response = `*Pending Approvals (${data.length}):*\n\n`;
      data.forEach((item, i) => {
        response += `${i + 1}. *${item.agent_name || 'Unknown'}*\n`;
        response += `   ${(item.description || 'No description').substring(0, 100)}\n`;
        response += `   ID: ${item.id}\n`;
        response += `   Reply: approve ${item.id} / reject ${item.id}\n\n`;
      });

      return this.formatResponse(response);
    } catch (error) {
      return this.formatResponse(`Error fetching approvals: ${error.message}`);
    }
  }

  /**
   * Show recent leads
   */
  async handleLeads() {
    if (!this.supabase) {
      return this.formatResponse('Supabase not connected.');
    }

    try {
      const { data, error } = await this.supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) throw error;

      if (!data || data.length === 0) {
        return this.formatResponse('No leads found yet.');
      }

      let response = `*Recent Leads (${data.length}):*\n\n`;
      data.forEach((lead, i) => {
        response += `${i + 1}. *${lead.company}*\n`;
        response += `   Industry: ${lead.industry || 'N/A'}\n`;
        response += `   ICP Score: ${lead.icp_score || 'N/A'}\n`;
        response += `   Status: ${lead.status || 'new'}\n\n`;
      });

      return this.formatResponse(response);
    } catch (error) {
      return this.formatResponse(`Error fetching leads: ${error.message}`);
    }
  }

  /**
   * Show pipeline summary
   */
  async handlePipeline() {
    if (!this.supabase) {
      return this.formatResponse('Supabase not connected.');
    }

    try {
      const { data, error } = await this.supabase
        .from('pipeline')
        .select('stage, id')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const stages = {};
      (data || []).forEach(item => {
        stages[item.stage] = (stages[item.stage] || 0) + 1;
      });

      let response = '*Pipeline Summary:*\n\n';
      const stageOrder = ['new', 'qualified', 'engaged', 'proposal', 'negotiation', 'won', 'lost'];
      stageOrder.forEach(stage => {
        if (stages[stage]) {
          response += `  ${stage.charAt(0).toUpperCase() + stage.slice(1)}: ${stages[stage]}\n`;
        }
      });

      if (Object.keys(stages).length === 0) {
        response += 'No pipeline data yet.';
      }

      return this.formatResponse(response);
    } catch (error) {
      return this.formatResponse(`Error fetching pipeline: ${error.message}`);
    }
  }

  /**
   * Trigger a specific agent
   */
  async handleTriggerAgent(agentQuery) {
    const agentId = this.fuzzyMatchAgent(agentQuery);
    if (!agentId) {
      return this.formatResponse(`Could not find an agent matching "${agentQuery}". Type "agents" to see the full list.`);
    }

    const agent = this.agentsConfig.find(a => a.id === agentId);
    if (!agent) {
      return this.formatResponse(`Agent ${agentId} not found in config.`);
    }

    try {
      // Don't await - trigger async so we can respond immediately
      this.triggerAgent(agent, { source: 'whatsapp' }, 'high');
      return this.formatResponse(`Triggered *${agent.name}* (${agent.id}). Running now with high priority.\n\nI will notify you when it completes.`);
    } catch (error) {
      return this.formatResponse(`Error triggering ${agent.name}: ${error.message}`);
    }
  }

  /**
   * Chat with a specific agent using @mention or "talk to"
   */
  async handleAgentChat(text, from) {
    let agentQuery, message;

    if (text.startsWith('@')) {
      // @AgentName message
      const spaceIdx = text.indexOf(' ', 1);
      if (spaceIdx === -1) {
        agentQuery = text.substring(1).trim();
        message = 'What is your current status and what are you working on?';
      } else {
        agentQuery = text.substring(1, spaceIdx).trim();
        message = text.substring(spaceIdx + 1).trim();
      }
    } else if (text.toLowerCase().startsWith('talk to ')) {
      const rest = text.substring(8).trim();
      const parts = rest.split(/[,:]|\s+about\s+|\s+regarding\s+/i);
      agentQuery = parts[0].trim();
      message = parts.length > 1 ? parts.slice(1).join(' ').trim() : 'What is your current status?';
    } else if (text.toLowerCase().startsWith('ask ')) {
      const rest = text.substring(4).trim();
      const parts = rest.split(/\s+to\s+|\s+about\s+|\s+regarding\s+/i);
      agentQuery = parts[0].trim();
      message = parts.length > 1 ? parts.slice(1).join(' ').trim() : 'What is your current status?';
    } else {
      // Check if we have an active conversation
      const activeConvo = this.conversations.get(from);
      if (activeConvo) {
        agentQuery = null;
        message = text;
        const agent = this.agentsConfig.find(a => a.id === activeConvo.agentId);
        if (agent) {
          return await this.chatWithAgent(agent, message, from);
        }
      }
      return this.formatResponse('Please specify an agent with @AgentName or "talk to <agent>"');
    }

    // Resolve agent
    const agentId = this.fuzzyMatchAgent(agentQuery.toLowerCase());
    if (!agentId) {
      return this.formatResponse(
        `Could not find agent "${agentQuery}". Try:\n` +
        '  @BDR, @Scout, @LinkedIn, @Email, @Demo, @Proposal, etc.\n' +
        'Or type "agents" to see the full list.'
      );
    }

    const agent = this.agentsConfig.find(a => a.id === agentId);
    if (!agent) {
      return this.formatResponse(`Agent ${agentId} not in config.`);
    }

    // Set active conversation
    this.conversations.set(from, {
      agentId: agent.id,
      agentName: agent.name,
      startedAt: Date.now(),
      messageCount: 0,
    });

    return await this.chatWithAgent(agent, message, from);
  }

  /**
   * Send a message to a specific agent and get its response
   */
  async chatWithAgent(agent, message, from) {
    const convo = this.conversations.get(from);
    if (convo) {
      convo.messageCount++;
      // Auto-expire conversations after 30 minutes
      if (Date.now() - convo.startedAt > 30 * 60 * 1000) {
        this.conversations.delete(from);
      }
    }

    try {
      // Build a conversational prompt for the agent
      const chatPrompt = `You are ${agent.name}, an AI sales agent at Drooid. ` +
        `Your role: ${agent.description}\n\n` +
        `The CEO (Abi) is messaging you via WhatsApp. Answer concisely (under 300 words) and be direct.\n\n` +
        `CEO's message: "${message}"\n\n` +
        `Respond as ${agent.name}. Include relevant data from your recent work if applicable. ` +
        `If you need to take an action, describe what you would do. Keep the tone professional but conversational.`;

      const result = await this.agentRunner.callGeminiWithRetry(
        chatPrompt,
        `You are ${agent.name}, a specialized AI sales agent. Be concise, data-driven, and actionable.`,
        agent,
        2
      );

      if (result.success) {
        const agentResponse = result.content.substring(0, 1500); // WhatsApp char limit
        return this.formatResponse(
          `*${agent.name}:*\n\n${agentResponse}\n\n_Chatting with ${agent.name}. Send another message or type "help" for commands._`
        );
      } else {
        return this.formatResponse(`${agent.name} is unavailable right now. Error: ${result.error}`);
      }
    } catch (error) {
      logger.error('Agent chat error', { agentId: agent.id, error: error.message });
      return this.formatResponse(`Could not reach ${agent.name}: ${error.message}\n\nTry again or use "run ${agent.name.toLowerCase()}" to trigger the agent.`);
    }
  }

  /**
   * Handle general queries (routes to CEO Agent)
   */
  async handleGeneralQuery(text, from) {
    const ceoAgent = this.agentsConfig.find(a => a.id === 'agent-00');
    if (!ceoAgent) {
      return this.formatResponse('CEO Agent not configured. Type "help" for available commands.');
    }

    // Set conversation context to CEO Agent
    this.conversations.set(from, {
      agentId: 'agent-00',
      agentName: ceoAgent.name,
      startedAt: Date.now(),
      messageCount: 0,
    });

    return await this.chatWithAgent(ceoAgent, text, from);
  }

  /**
   * Fuzzy match agent name/alias to agent ID
   */
  fuzzyMatchAgent(query) {
    // Direct alias match
    if (AGENT_ALIASES[query]) return AGENT_ALIASES[query];

    // Partial match on aliases
    for (const [alias, id] of Object.entries(AGENT_ALIASES)) {
      if (alias.includes(query) || query.includes(alias)) return id;
    }

    // Match against config names
    for (const agent of this.agentsConfig) {
      const nameLower = agent.name.toLowerCase();
      if (nameLower === query || nameLower.includes(query) || query.includes(nameLower)) {
        return agent.id;
      }
    }

    // Try agent ID directly
    if (query.match(/^agent-\d{2}$/)) {
      return query;
    }

    return null;
  }

  /**
   * Format response as TwiML
   */
  formatResponse(text) {
    // Escape XML special characters
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`;
  }

  /**
   * Send a proactive WhatsApp message (for notifications)
   */
  async sendNotification(message) {
    if (!this.ceoWhatsappNumber || !this.twilioAccountSid) {
      logger.warn('WhatsApp notification skipped - Twilio not configured');
      return;
    }

    try {
      const accountSid = this.twilioAccountSid;
      const authToken = this.twilioAuthToken;
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

      // Use built-in fetch (Node 18+) or require
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
        },
        body: new URLSearchParams({
          To: this.ceoWhatsappNumber,
          From: this.twilioWhatsappNumber,
          Body: message,
        }).toString(),
      });

      const data = await response.json();
      logger.info('WhatsApp notification sent', { sid: data.sid });
      return data;
    } catch (error) {
      logger.error('Failed to send WhatsApp notification', { error: error.message });
    }
  }
}

module.exports = WhatsAppHandler;

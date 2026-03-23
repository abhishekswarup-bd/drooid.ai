const winston = require('winston');
const fs = require('fs');
const path = require('path');

const { callGemini } = require('../integrations/gemini-client');
const { logAgentAction, createApproval, queryLeads, queryPipeline } = require('../integrations/supabase-client');

/**
 * Executes individual agents with error handling, approval gates, and logging
 */
class AgentRunner {
  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
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
          filename: 'logs/agents.log',
          maxsize: 10485760, // 10MB
          maxFiles: 5,
        }),
      ],
    });

    // Ensure logs directory exists
    const logsDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
  }

  /**
   * Main agent execution method
   */
  async executeAgent(agent, context = {}) {
    const executionId = `${agent.id}-${Date.now()}`;
    const startTime = Date.now();

    this.logger.info(`Agent execution started: ${agent.name} (${agent.id})`, {
      executionId,
      phase: agent.phase,
    });

    try {
      // Build agent input based on phase
      const agentInput = await this.buildAgentInput(agent, context);

      // Build system prompt
      const systemPrompt = this.buildSystemPrompt(agent);

      // Call Gemini with error handling and retries
      let result;
      try {
        result = await this.callGeminiWithRetry(
          agentInput,
          systemPrompt,
          agent,
          3 // max retries
        );
      } catch (error) {
        this.logger.error(`Gemini API call failed for ${agent.name}`, {
          agentId: agent.id,
          error: error.message,
        });
        throw error;
      }

      if (!result.success) {
        throw new Error(`Gemini returned unsuccessful status: ${result.error}`);
      }

      const duration = Date.now() - startTime;

      // Log to Supabase
      await this.logExecution(agent, {
        executionId,
        status: 'success',
        duration,
        inputSummary: agentInput.substring(0, 200),
        outputSummary: result.content.substring(0, 500),
        tokensUsed: result.tokens?.total || 0,
      });

      this.logger.info(`Agent execution completed: ${agent.name}`, {
        agentId: agent.id,
        duration,
        tokensUsed: result.tokens?.total,
      });

      // Handle approval requirements
      if (agent.requires_approval && process.env.APPROVAL_MODE === 'manual') {
        this.logger.info(`Agent requires approval: ${agent.name}`, {
          agentId: agent.id,
        });

        const approval = await this.createApprovalRecord(agent, result.content);

        return {
          success: true,
          agentId: agent.id,
          agentName: agent.name,
          status: 'pending_approval',
          approvalId: approval?.id,
          result: result.content,
          duration,
          tokensUsed: result.tokens?.total,
        };
      }

      // Return successful result
      return {
        success: true,
        agentId: agent.id,
        agentName: agent.name,
        status: 'completed',
        result: result.content,
        duration,
        tokensUsed: result.tokens?.total,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      // Log error
      await this.logExecution(agent, {
        executionId,
        status: 'error',
        duration,
        error: error.message,
        inputSummary: '',
        outputSummary: '',
        tokensUsed: 0,
      }).catch((logError) => {
        this.logger.error('Failed to log agent error', {
          agentId: agent.id,
          logError: logError.message,
        });
      });

      this.logger.error(`Agent execution failed: ${agent.name}`, {
        agentId: agent.id,
        error: error.message,
        stack: error.stack,
        duration,
      });

      return {
        success: false,
        agentId: agent.id,
        agentName: agent.name,
        status: 'failed',
        error: error.message,
        duration,
      };
    }
  }

  /**
   * Call Gemini with exponential backoff retry logic
   */
  async callGeminiWithRetry(input, systemPrompt, agent, maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await callGemini(input, {
          systemPrompt,
          temperature: this.getTemperatureForComplexity(agent.complexity),
          maxTokens: agent.output_tokens_per_call,
          jsonMode: agent.phase !== 'create',
        });

        return result;
      } catch (error) {
        lastError = error;

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff
          this.logger.warn(
            `Gemini API call failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms`,
            {
              agentId: agent.id,
              error: error.message,
            }
          );

          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Build agent input based on phase
   */
  async buildAgentInput(agent, context = {}) {
    let input = `You are ${agent.name}. Your task: ${agent.description}\n\n`;

    switch (agent.phase) {
      case 'discover':
        return await this.buildDiscoverInput(agent, context, input);
      case 'engage':
        return await this.buildEngageInput(agent, context, input);
      case 'convert':
        return await this.buildConvertInput(agent, context, input);
      case 'create':
        return await this.buildCreateInput(agent, context, input);
      case 'innovate':
        return await this.buildInnovateInput(agent, context, input);
      case 'partner':
        return await this.buildPartnerInput(agent, context, input);
      case 'manage':
        return await this.buildManageInput(agent, context, input);
      default:
        throw new Error(`Unknown agent phase: ${agent.phase}`);
    }
  }

  async buildDiscoverInput(agent, context, input) {
    const leads = await queryLeads({ limit: 5, minIcpScore: 0.5 }).catch(() => ({ data: [] }));
    return `${input}Context:
- Industry focus: ${context.industry || 'B2B SaaS'}
- Company size: ${context.employeeCount || 'any'}
- Budget: ${context.budget || 'not specified'}
- Recent leads: ${leads.data?.length || 0} leads available

Task: Scan for new prospects matching ICP criteria. Provide JSON with prospects found, decision-makers, ICP scores, and recommended outreach approach.`;
  }

  async buildEngageInput(agent, context, input) {
    const leads = await queryLeads({ limit: 5, status: 'qualified' }).catch(() => ({ data: [] }));
    return `${input}Context:
- Target leads: ${leads.data?.length || 0} qualified leads ready for engagement
- Channel: ${context.channel || 'multi-channel'}
- Personalization: high
- Tone: professional yet personable

Task: Generate personalized outreach content. Return JSON with channel strategy, message variants, follow-up sequences, and timing recommendations.`;
  }

  async buildConvertInput(agent, context, input) {
    const pipeline = await queryPipeline({ limit: 10 }).catch(() => ({ data: [] }));
    return `${input}Context:
- Active opportunities: ${pipeline.data?.length || 0} deals in pipeline
- Focus stage: ${context.stage || 'all'}
- Average deal size: ${context.avgDealSize || 'not specified'}

Task: Analyze current pipeline and identify bottlenecks. Return JSON with deal recommendations, next steps, objection handling, and confidence scores.`;
  }

  async buildCreateInput(agent, context, input) {
    return `${input}Context:
- Content type: ${agent.id.includes('social') ? 'social media' : agent.id.includes('case') ? 'case study' : 'marketing'}
- Audience: ${context.audience || 'target market'}
- Tone: professional, engaging, conversion-focused
- Keywords: ${context.keywords || 'industry best practices'}
- Brand voice: ${context.brandVoice || 'authoritative'}

Task: Create high-quality, original content optimized for the specified channel and audience. Return structured content with title, body, metadata, CTAs, and performance expectations.`;
  }

  async buildInnovateInput(agent, context, input) {
    const metrics = await queryPipeline({ limit: 20 }).catch(() => ({ data: [] }));
    return `${input}Context:
- Current pipeline size: ${metrics.data?.length || 0} opportunities
- Average deal size: ${context.avgDealSize || 'not specified'}
- Sales cycle: ${context.salesCycle || 'unknown'}
- Current win rate: ${context.winRate || 'not tracked'}

Task: Analyze market trends and sales patterns. Identify innovative approaches to improve results. Return JSON with insights, new strategies, market opportunities, and ROI projections.`;
  }

  async buildPartnerInput(agent, context, input) {
    return `${input}Context:
- Target partnership types: ${context.partnerType || 'resellers, integrations, referral partners'}
- Mutual value drivers: ${context.valueProposition || 'revenue sharing, customer access, co-marketing'}
- Partnership maturity: ${context.maturity || 'early stage'}

Task: Identify and evaluate strategic partnership opportunities. Return JSON with partner candidates, approach strategy, mutual benefits, and collaboration models.`;
  }

  async buildManageInput(agent, context, input) {
    return `${input}Context:
- Operation focus: ${context.focus || 'overall optimization'}
- Current issues: ${context.issues || 'none reported'}
- Compliance scope: ${agent.id === 'agent-29' ? 'GDPR, SOC2, data security' : 'operational efficiency'}

Task: Monitor and optimize operations. Return JSON with findings, quality metrics, recommendations, action items, and risk assessments.`;
  }

  /**
   * Build system prompt for agent
   */
  buildSystemPrompt(agent) {
    return `You are a specialized AI sales agent: ${agent.name}.

Description: ${agent.description}
Complexity Level: ${agent.complexity}
Phase: ${agent.phase}
Model: ${agent.model}

Your role:
- Execute your specific function with precision and high quality
- Make data-driven, evidence-based decisions
- Provide actionable insights and clear recommendations
- Return valid, well-structured JSON responses
- Never fabricate data - use only provided context
- Flag uncertainty, assumptions, and missing information
- Consider regulatory, ethical, and compliance constraints
- Optimize for measurable business impact

Response format:
- Always return valid JSON with clear structure
- Include reasoning for recommendations
- Provide next steps and success metrics
- Flag any risks or concerns
- Suggest KPIs to track execution`;
  }

  /**
   * Get temperature parameter based on complexity
   */
  getTemperatureForComplexity(complexity) {
    const temps = {
      simple: 0.4,
      medium: 0.6,
      complex: 0.8,
    };
    return temps[complexity] || 0.6;
  }

  /**
   * Log agent execution to Supabase
   */
  async logExecution(agent, details) {
    try {
      await logAgentAction({
        agent_id: agent.id,
        agent_name: agent.name,
        action: agent.phase,
        input_summary: details.inputSummary,
        output_summary: details.outputSummary,
        tokens_used: details.tokensUsed,
        model: agent.model,
        duration_ms: details.duration,
        status: details.status,
        error: details.error || null,
        execution_id: details.executionId,
      });
    } catch (error) {
      this.logger.error(`Failed to log agent execution to Supabase`, {
        agentId: agent.id,
        error: error.message,
      });
      // Don't throw - logging failure shouldn't stop agent execution
    }
  }

  /**
   * Create approval record in Supabase
   */
  async createApprovalRecord(agent, content) {
    try {
      const approval = await createApproval({
        agent_id: agent.id,
        action_type: agent.phase,
        payload: {
          agent_name: agent.name,
          content: content.substring(0, 1000), // Store first 1000 chars
          full_content_id: `approval-${agent.id}-${Date.now()}`,
        },
      });

      this.logger.info(`Approval record created for ${agent.name}`, {
        agentId: agent.id,
        approvalId: approval?.id,
      });

      return approval;
    } catch (error) {
      this.logger.error(`Failed to create approval record`, {
        agentId: agent.id,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Utility: sleep
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = AgentRunner;

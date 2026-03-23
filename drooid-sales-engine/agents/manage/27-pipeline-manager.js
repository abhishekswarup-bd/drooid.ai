const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');

const AGENT_ID = 'agent-27';
const AGENT_NAME = 'Pipeline Manager';
const SYSTEM_PROMPT = `You are the Pipeline Manager, the operations coach overseeing a 26-agent sales team running the Drooid Sales Engine.

Your role:
- Monitor throughput metrics across all agents
- Detect bottlenecks: if Prospect Scout finds 200 leads but Personalization Engine processes 50, flag the imbalance and rebalance priorities
- Track queue depths for each agent
- Identify stalled workflows and trigger retries on failed tasks
- Take corrective actions: adjust agent priorities, clear stuck queues, escalate persistent failures

Your daily deliverable:
Generate an operations report with these sections:
1. agents_healthy: list of agents operating normally with call counts
2. agents_degraded: list of agents with issues, with severity
3. bottlenecks: array of identified bottlenecks with impact analysis
4. queue_depths: current queue status for each agent
5. recommended_adjustments: specific actions to optimize throughput
6. corrective_actions_taken: list of actions you've already taken
7. escalations: critical issues requiring CEO attention

Think of yourself as an air traffic controller for the sales pipeline. Your decisions directly impact deal velocity.`;

async function run(context = {}) {
  const startTime = Date.now();
  const runId = `${AGENT_ID}-${Date.now()}`;

  try {
    // Fetch agent logs from last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: agentLogs, error: logsError } = await db
      .from('agent_logs')
      .select('*')
      .gte('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false });

    if (logsError) throw new Error(`Failed to fetch agent logs: ${logsError.message}`);

    // Fetch pipeline status
    const { data: pipelineData, error: pipelineError } = await db
      .from('pipeline')
      .select('*')
      .neq('stage', 'closed_won')
      .neq('stage', 'closed_lost');

    if (pipelineError) throw new Error(`Failed to fetch pipeline data: ${pipelineError.message}`);

    // Fetch agent metrics for queue analysis
    const { data: agentMetrics, error: metricsError } = await db
      .from('agent_metrics')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (metricsError) throw new Error(`Failed to fetch agent metrics: ${metricsError.message}`);

    // Prepare analysis data
    const analysisData = {
      timestamp: new Date().toISOString(),
      metrics_period: '24h',
      agent_logs_count: agentLogs?.length || 0,
      pipeline_active_deals: pipelineData?.length || 0,
      agent_logs_summary: summarizeAgentLogs(agentLogs || []),
      queue_status: analyzeQueueDepths(agentMetrics || []),
      pipeline_stage_distribution: analyzePipelineStages(pipelineData || []),
    };

    // Call Gemini with the analysis context
    const geminiPrompt = `
Analyze the following operational data from the Drooid Sales Engine and provide a detailed operations report.

Current State (last 24 hours):
${JSON.stringify(analysisData, null, 2)}

Based on this data:
1. Identify agents operating normally and those degraded
2. Find bottlenecks where throughput is mismatched
3. Analyze queue depths for process efficiency
4. Recommend specific adjustments to rebalance workload
5. Flag any issues requiring CEO escalation

Provide your response as a valid JSON object with these exact fields:
{
  "agents_healthy": [{"agent_id": "", "calls": 0, "tokens": 0, "status": ""}],
  "agents_degraded": [{"agent_id": "", "issue": "", "severity": "low|medium|high"}],
  "bottlenecks": [{"source_agent": "", "target_agent": "", "throughput_mismatch": "", "impact": ""}],
  "queue_depths": {"agent_id": {"queue_items": 0, "processing_rate": 0, "backlog_hours": 0}},
  "recommended_adjustments": ["specific action 1", "specific action 2"],
  "corrective_actions_taken": ["action 1", "action 2"],
  "escalations": [{"issue": "", "severity": "low|medium|high", "action_required": ""}],
  "summary": "2-3 sentence executive summary"
}`;

    const reportContent = await callGemini(
      geminiPrompt,
      SYSTEM_PROMPT,
      { temperature: 0.3, maxTokens: 2000 }
    );

    // Parse the report
    let report;
    try {
      // Extract JSON from response
      const jsonMatch = reportContent.match(/\{[\s\S]*\}/);
      report = JSON.parse(jsonMatch ? jsonMatch[0] : reportContent);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', parseError);
      // Return structured error response
      report = {
        agents_healthy: [],
        agents_degraded: [],
        bottlenecks: [],
        queue_depths: {},
        recommended_adjustments: [],
        corrective_actions_taken: [],
        escalations: [{
          issue: 'Pipeline Manager analysis error',
          severity: 'high',
          action_required: 'Manual review required'
        }],
        summary: 'Analysis failed - manual review required'
      };
    }

    // Store the report in agent_metrics table
    const { error: storeError } = await db
      .from('agent_metrics')
      .insert({
        agent_id: AGENT_ID,
        agent_name: AGENT_NAME,
        run_id: runId,
        metrics: report,
        execution_time_ms: Date.now() - startTime,
        tokens_used: 0,
        api_calls: 2,
        status: report.escalations?.length > 0 ? 'completed_with_escalations' : 'success',
        created_at: new Date().toISOString()
      });

    if (storeError) console.error('Failed to store metrics:', storeError);

    // Log the run
    await logAgentRun(runId, 'success', report);

    return {
      success: true,
      agent_id: AGENT_ID,
      run_id: runId,
      report,
      execution_time_ms: Date.now() - startTime
    };

  } catch (error) {
    console.error('Pipeline Manager error:', error);

    await logAgentRun(runId, 'error', {
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      agent_id: AGENT_ID,
      run_id: runId,
      error: error.message,
      execution_time_ms: Date.now() - startTime
    };
  }
}

function summarizeAgentLogs(logs) {
  const summary = {};
  const agentCallCounts = {};
  const agentErrors = {};
  const agentTokens = {};

  logs.forEach(log => {
    const agent = log.agent_id || 'unknown';
    agentCallCounts[agent] = (agentCallCounts[agent] || 0) + 1;

    if (log.status === 'error') {
      agentErrors[agent] = (agentErrors[agent] || 0) + 1;
    }

    if (log.tokens_used) {
      agentTokens[agent] = (agentTokens[agent] || 0) + log.tokens_used;
    }
  });

  return {
    total_logs: logs.length,
    unique_agents: Object.keys(agentCallCounts).length,
    agent_call_counts: agentCallCounts,
    agent_errors: agentErrors,
    agent_tokens: agentTokens,
    error_rate: logs.length > 0
      ? (Object.values(agentErrors).reduce((a, b) => a + b, 0) / logs.length * 100).toFixed(2) + '%'
      : '0%'
  };
}

function analyzeQueueDepths(metrics) {
  const queueStatus = {};

  metrics.forEach(metric => {
    if (metric.metrics && metric.metrics.queue_depth) {
      const agentId = metric.agent_id;
      if (!queueStatus[agentId]) {
        queueStatus[agentId] = {
          queue_items: 0,
          processing_rate: 0,
          backlog_hours: 0,
          last_updated: metric.created_at
        };
      }
      queueStatus[agentId].queue_items = metric.metrics.queue_depth;
      if (metric.metrics.processing_rate) {
        queueStatus[agentId].processing_rate = metric.metrics.processing_rate;
      }
      if (metric.metrics.queue_depth && metric.metrics.processing_rate) {
        queueStatus[agentId].backlog_hours = (metric.metrics.queue_depth / metric.metrics.processing_rate).toFixed(2);
      }
    }
  });

  return queueStatus;
}

function analyzePipelineStages(pipeline) {
  const stageDistribution = {};

  pipeline.forEach(deal => {
    const stage = deal.stage || 'unknown';
    if (!stageDistribution[stage]) {
      stageDistribution[stage] = { count: 0, total_value: 0, avg_days_in_stage: 0 };
    }
    stageDistribution[stage].count += 1;
    stageDistribution[stage].total_value += deal.deal_value || 0;
  });

  // Calculate average days in stage
  Object.keys(stageDistribution).forEach(stage => {
    const stageDeals = pipeline.filter(d => d.stage === stage);
    if (stageDeals.length > 0) {
      const avgDays = stageDeals.reduce((sum, deal) => {
        const daysInStage = deal.updated_at
          ? Math.floor((Date.now() - new Date(deal.updated_at).getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        return sum + daysInStage;
      }, 0) / stageDeals.length;
      stageDistribution[stage].avg_days_in_stage = Math.round(avgDays);
    }
  });

  return stageDistribution;
}

async function logAgentRun(runId, status, details) {
  try {
    await db
      .from('agent_logs')
      .insert({
        agent_id: AGENT_ID,
        agent_name: AGENT_NAME,
        run_id: runId,
        status,
        details,
        created_at: new Date().toISOString()
      });
  } catch (error) {
    console.error('Failed to log agent run:', error);
  }
}

module.exports = { AGENT_ID, AGENT_NAME, run };

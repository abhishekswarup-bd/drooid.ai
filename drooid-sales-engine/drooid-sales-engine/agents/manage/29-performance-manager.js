const { callGemini } = require('../../integrations/gemini-client');
const db = require('../../integrations/supabase-client');

const AGENT_ID = 'agent-29';
const AGENT_NAME = 'Performance Manager';
const SYSTEM_PROMPT = `You are the Chief Revenue Officer's analytics engine for the Drooid Sales Engine.

Your role:
- Monitor performance of all 26 worker agents and 2 peer managers
- Track these KPIs:
  - Prospect volume (leads generated per day/week)
  - Outreach response rates by channel (LinkedIn, Email, Phone)
  - Meeting conversion rate (responses → meetings)
  - Pipeline velocity (deals progressing through stages)
  - Content engagement (opens, clicks, replies)
  - Deal win rate and average deal size
  - Sales cycle length

Alerts and Actions:
- When a metric drops >20% week-over-week, flag for immediate action
- When agent fails repeatedly, escalate to CEO
- When strategic pivot recommended, escalate to CEO
- A/B test variations to improve underperforming metrics

Reporting Types:
1. Daily Flash: 2-minute summary of key metrics and critical alerts
2. Weekly Dashboard: comprehensive performance review with trends
3. Monthly Strategic: deep trend analysis and strategy recommendations`;

const KPI_THRESHOLDS = {
  linkedin_accept_rate: { threshold: 15, unit: '%', direction: 'min' },
  email_open_rate: { threshold: 25, unit: '%', direction: 'min' },
  response_rate: { threshold: 10, unit: '%', direction: 'min' },
  meeting_conversion_rate: { threshold: 15, unit: '%', direction: 'min' },
  pipeline_velocity: { threshold: 3, unit: 'days/stage', direction: 'min' },
  deal_win_rate: { threshold: 20, unit: '%', direction: 'min' }
};

async function run(context = {}) {
  const startTime = Date.now();
  const runId = `${AGENT_ID}-${Date.now()}`;
  const reportType = context.reportType || 'daily'; // daily, weekly, monthly

  try {
    // Fetch performance data
    const performanceData = await fetchPerformanceData();

    // Generate appropriate report type
    let report;
    switch (reportType) {
      case 'weekly':
        report = await generateWeeklyDashboard(performanceData);
        break;
      case 'monthly':
        report = await generateMonthlyStrategic(performanceData);
        break;
      default:
        report = await generateDailyFlash(performanceData);
    }

    // Store the report
    await db
      .from('agent_metrics')
      .insert({
        agent_id: AGENT_ID,
        agent_name: AGENT_NAME,
        run_id: runId,
        metrics: report,
        execution_time_ms: Date.now() - startTime,
        tokens_used: 0,
        api_calls: 3,
        status: report.alerts?.length > 0 ? 'completed_with_alerts' : 'success',
        created_at: new Date().toISOString()
      });

    // Store report in content table if it's a comprehensive report
    if (reportType !== 'daily') {
      await db
        .from('content')
        .insert({
          type: `performance_report_${reportType}`,
          title: `${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Performance Report`,
          content: JSON.stringify(report, null, 2),
          status: 'published',
          created_by: AGENT_ID,
          created_at: new Date().toISOString()
        });
    }

    await logAgentRun(runId, 'success', {
      report_type: reportType,
      summary: report.summary
    });

    return {
      success: true,
      agent_id: AGENT_ID,
      run_id: runId,
      report_type: reportType,
      report,
      execution_time_ms: Date.now() - startTime
    };

  } catch (error) {
    console.error('Performance Manager error:', error);

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

async function fetchPerformanceData() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const lastMonth = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const lastTwoMonths = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000);

  // Fetch outreach data
  const { data: outreach, error: outreachError } = await db
    .from('outreach')
    .select('*')
    .gte('created_at', lastMonth.toISOString());

  if (outreachError) throw new Error(`Failed to fetch outreach: ${outreachError.message}`);

  // Fetch pipeline data
  const { data: pipeline, error: pipelineError } = await db
    .from('pipeline')
    .select('*');

  if (pipelineError) throw new Error(`Failed to fetch pipeline: ${pipelineError.message}`);

  // Fetch agent metrics
  const { data: agentMetrics, error: metricsError } = await db
    .from('agent_metrics')
    .select('*')
    .gte('created_at', lastMonth.toISOString())
    .order('created_at', { ascending: false });

  if (metricsError) throw new Error(`Failed to fetch metrics: ${metricsError.message}`);

  // Calculate KPIs
  const kpis = calculateKPIs(outreach || [], pipeline || [], agentMetrics || [], {
    today,
    lastWeek,
    lastMonth,
    lastTwoMonths
  });

  // Identify alerts
  const alerts = identifyAlerts(kpis);

  return {
    timestamp: now.toISOString(),
    outreach_count: outreach?.length || 0,
    pipeline_deals: pipeline?.length || 0,
    kpis,
    alerts,
    agent_health: summarizeAgentHealth(agentMetrics || [])
  };
}

function calculateKPIs(outreach, pipeline, metrics, dateRanges) {
  const { today, lastWeek, lastMonth } = dateRanges;

  // Today's outreach
  const todayOutreach = outreach.filter(o => new Date(o.created_at) >= today);

  // This week's outreach
  const weekOutreach = outreach.filter(o => new Date(o.created_at) >= lastWeek);

  // Calculate response rate
  const sentOutreach = outreach.filter(o => o.sent_at);
  const responsesReceived = sentOutreach.filter(o => o.response_at);
  const responseRate = sentOutreach.length > 0
    ? ((responsesReceived.length / sentOutreach.length) * 100).toFixed(2)
    : 0;

  // Calculate by channel
  const linkedinOutreach = sentOutreach.filter(o => o.channel === 'linkedin');
  const linkedinResponses = linkedinOutreach.filter(o => o.response_at);
  const linkedinResponseRate = linkedinOutreach.length > 0
    ? ((linkedinResponses.length / linkedinOutreach.length) * 100).toFixed(2)
    : 0;

  const emailOutreach = sentOutreach.filter(o => o.channel === 'email');
  const emailResponses = emailOutreach.filter(o => o.response_at);
  const emailResponseRate = emailOutreach.length > 0
    ? ((emailResponses.length / emailOutreach.length) * 100).toFixed(2)
    : 0;

  // Email engagement
  const emailOpens = emailOutreach.filter(o => o.opened_at);
  const emailOpenRate = emailOutreach.length > 0
    ? ((emailOpens.length / emailOutreach.length) * 100).toFixed(2)
    : 0;

  // LinkedIn engagement
  const linkedinClicks = linkedinOutreach.filter(o => o.clicked_at);
  const linkedinClickRate = linkedinOutreach.length > 0
    ? ((linkedinClicks.length / linkedinOutreach.length) * 100).toFixed(2)
    : 0;

  // Meeting conversion
  const responses = responsesReceived.length;
  const meetingsScheduled = pipeline.filter(p => p.stage === 'meeting').length;
  const meetingConversionRate = responses > 0
    ? ((meetingsScheduled / responses) * 100).toFixed(2)
    : 0;

  // Pipeline velocity
  const closedDeals = pipeline.filter(p => p.stage === 'closed_won' || p.stage === 'closed_lost');
  const avgSalesLength = closedDeals.length > 0
    ? closedDeals.reduce((sum, deal) => {
        const daysToClose = deal.closed_at && deal.created_at
          ? Math.floor((new Date(deal.closed_at) - new Date(deal.created_at)) / (1000 * 60 * 60 * 24))
          : 0;
        return sum + daysToClose;
      }, 0) / closedDeals.length
    : 0;

  // Deal metrics
  const wonDeals = closedDeals.filter(d => d.stage === 'closed_won');
  const winRate = closedDeals.length > 0
    ? ((wonDeals.length / closedDeals.length) * 100).toFixed(2)
    : 0;

  const totalDealValue = wonDeals.reduce((sum, d) => sum + (d.deal_value || 0), 0);
  const avgDealSize = wonDeals.length > 0
    ? (totalDealValue / wonDeals.length).toFixed(2)
    : 0;

  return {
    outreach: {
      today: todayOutreach.length,
      this_week: weekOutreach.length,
      total: sentOutreach.length,
      responses: responsesReceived.length,
      response_rate: `${responseRate}%`
    },
    channels: {
      linkedin: {
        sent: linkedinOutreach.length,
        responses: linkedinResponses.length,
        response_rate: `${linkedinResponseRate}%`,
        click_rate: `${linkedinClickRate}%`
      },
      email: {
        sent: emailOutreach.length,
        responses: emailResponses.length,
        response_rate: `${emailResponseRate}%`,
        open_rate: `${emailOpenRate}%`
      }
    },
    conversions: {
      meeting_conversion_rate: `${meetingConversionRate}%`,
      meetings_scheduled: meetingsScheduled
    },
    pipeline: {
      total_deals: pipeline.length,
      avg_sales_cycle_days: Math.round(avgSalesLength),
      closed_deals: closedDeals.length,
      won_deals: wonDeals.length,
      win_rate: `${winRate}%`,
      avg_deal_size: `$${avgDealSize}`
    }
  };
}

function identifyAlerts(kpis) {
  const alerts = [];

  // Parse percentage values
  const parsePercent = (str) => parseFloat(str.replace('%', ''));

  // Check response rates
  if (parsePercent(kpis.channels.linkedin.response_rate) < KPI_THRESHOLDS.linkedin_accept_rate.threshold) {
    alerts.push({
      metric: 'LinkedIn Response Rate',
      current_value: kpis.channels.linkedin.response_rate,
      threshold: `${KPI_THRESHOLDS.linkedin_accept_rate.threshold}%`,
      severity: 'high',
      recommendation: 'Review LinkedIn outreach messaging. Consider A/B testing connection requests vs. InMail.'
    });
  }

  if (parsePercent(kpis.channels.email.response_rate) < KPI_THRESHOLDS.email_open_rate.threshold) {
    alerts.push({
      metric: 'Email Open Rate',
      current_value: kpis.channels.email.open_rate,
      threshold: `${KPI_THRESHOLDS.email_open_rate.threshold}%`,
      severity: 'high',
      recommendation: 'Review email subject lines and send times. Test different subject line formats.'
    });
  }

  if (parsePercent(kpis.conversions.meeting_conversion_rate) < KPI_THRESHOLDS.meeting_conversion_rate.threshold) {
    alerts.push({
      metric: 'Meeting Conversion Rate',
      current_value: kpis.conversions.meeting_conversion_rate,
      threshold: `${KPI_THRESHOLDS.meeting_conversion_rate.threshold}%`,
      severity: 'medium',
      recommendation: 'Review response follow-up process. Ensure timely meeting scheduling attempts.'
    });
  }

  return alerts;
}

function summarizeAgentHealth(metrics) {
  const agentStats = {};

  metrics.forEach(metric => {
    if (!agentStats[metric.agent_id]) {
      agentStats[metric.agent_id] = {
        agent_name: metric.agent_name,
        runs: 0,
        errors: 0,
        last_run: metric.created_at,
        total_tokens: 0,
        total_calls: 0
      };
    }
    agentStats[metric.agent_id].runs += 1;
    if (metric.status === 'error') {
      agentStats[metric.agent_id].errors += 1;
    }
    if (metric.tokens_used) {
      agentStats[metric.agent_id].total_tokens += metric.tokens_used;
    }
    if (metric.api_calls) {
      agentStats[metric.agent_id].total_calls += metric.api_calls;
    }
    agentStats[metric.agent_id].last_run = metric.created_at;
  });

  return agentStats;
}

async function generateDailyFlash(performanceData) {
  const prompt = `
Generate a Daily Flash report (2-minute read) for the Drooid Sales Engine CEO.

Current Performance Data:
${JSON.stringify(performanceData, null, 2)}

Respond as valid JSON with this structure:
{
  "report_type": "daily_flash",
  "timestamp": "ISO timestamp",
  "headline": "one-line summary of today's status",
  "key_metrics": {
    "outreach_today": "X",
    "responses_today": "X",
    "meetings_scheduled": "X",
    "pipeline_value": "$X"
  },
  "critical_alerts": ["alert 1", "alert 2"],
  "performance_snapshot": "2-3 sentence summary",
  "next_actions": ["action 1", "action 2"],
  "summary": "executive summary paragraph"
}`;

  const content = await callGemini(
    prompt,
    SYSTEM_PROMPT,
    { temperature: 0.3, maxTokens: 1000 }
  );

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : content);
  } catch (error) {
    return {
      report_type: 'daily_flash',
      timestamp: new Date().toISOString(),
      headline: 'Daily performance snapshot',
      summary: 'See metrics above for daily performance summary'
    };
  }
}

async function generateWeeklyDashboard(performanceData) {
  const prompt = `
Generate a Weekly Dashboard report for the Drooid Sales Engine CEO.

Performance Data:
${JSON.stringify(performanceData, null, 2)}

Respond as valid JSON with this structure:
{
  "report_type": "weekly_dashboard",
  "week_ending": "ISO date",
  "headline": "Weekly performance headline",
  "kpi_summary": {
    "total_outreach": 0,
    "total_responses": 0,
    "response_rate": "X%",
    "meetings_scheduled": 0,
    "pipeline_value": "$X",
    "win_rate": "X%"
  },
  "channel_performance": {
    "linkedin": {"sent": 0, "response_rate": "X%", "trend": "↑↓→"},
    "email": {"sent": 0, "response_rate": "X%", "trend": "↑↓→"}
  },
  "agent_scores": {"agent_id": 0-100},
  "top_performers": ["agent_id"],
  "underperformers": ["agent_id"],
  "alerts": [{severity, metric, recommendation}],
  "recommendations": ["rec 1", "rec 2"],
  "summary": "Detailed weekly analysis paragraph"
}`;

  const content = await callGemini(
    prompt,
    SYSTEM_PROMPT,
    { temperature: 0.4, maxTokens: 2000 }
  );

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : content);
  } catch (error) {
    return {
      report_type: 'weekly_dashboard',
      week_ending: new Date().toISOString(),
      headline: 'Weekly performance summary',
      summary: 'See metrics above for detailed weekly analysis'
    };
  }
}

async function generateMonthlyStrategic(performanceData) {
  const prompt = `
Generate a Monthly Strategic report for the Drooid Sales Engine CEO.

Performance Data:
${JSON.stringify(performanceData, null, 2)}

Respond as valid JSON with this structure:
{
  "report_type": "monthly_strategic",
  "month": "Month Year",
  "headline": "Strategic headline for month",
  "executive_summary": "comprehensive strategic overview",
  "trend_analysis": {
    "outreach_trend": "increasing/stable/decreasing",
    "response_rate_trend": "improving/stable/declining",
    "revenue_trend": "accelerating/stable/declining"
  },
  "strategic_insights": ["insight 1", "insight 2", "insight 3"],
  "recommended_pivots": ["pivot 1", "pivot 2"],
  "resource_allocation": {"allocate_to": ["agent_id"], "reduce": ["agent_id"]},
  "market_opportunities": ["opportunity 1"],
  "risks": ["risk 1"],
  "30_day_goals": ["goal 1", "goal 2", "goal 3"],
  "summary": "Strategic narrative for month"
}`;

  const content = await callGemini(
    prompt,
    SYSTEM_PROMPT,
    { temperature: 0.5, maxTokens: 2500 }
  );

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : content);
  } catch (error) {
    return {
      report_type: 'monthly_strategic',
      month: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      headline: 'Monthly strategic review',
      summary: 'See metrics above for detailed strategic analysis'
    };
  }
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

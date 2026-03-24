#!/usr/bin/env node
// Test a single agent end-to-end: Gemini call -> process -> Supabase write
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const agentsConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'config/agents.json'), 'utf-8'));
const AgentRunner = require('./orchestrator/agent-runner');

async function testAgent() {
  const agentId = process.argv[2] || 'agent-01';

  console.log(`=== Testing ${agentId} End-to-End ===\n`);
  console.log('Supabase URL:', process.env.SUPABASE_URL || 'NOT SET');
  console.log('Gemini Key:', (process.env.GEMINI_API_KEY || 'NOT SET').substring(0, 15) + '...');
  console.log('');

  const agent = agentsConfig.find(a => a.id === agentId);
  if (!agent) {
    console.error(`${agentId} not found in config`);
    process.exit(1);
  }

  console.log('Agent:', agent.name, `(${agent.phase})`);
  console.log('Description:', agent.description);
  console.log('');

  const runner = new AgentRunner();
  console.log('Executing agent...\n');

  const result = await runner.executeAgent(agent, {
    industry: 'B2B SaaS',
    employeeCount: '100-1000',
  });

  console.log('\n=== Result ===');
  console.log('Status:', result.status);
  console.log('Duration:', result.duration, 'ms');
  console.log('Tokens Used:', result.tokensUsed);

  if (result.success) {
    console.log('\nOutput (first 800 chars):');
    const output = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
    console.log(output.substring(0, 800));
    if (output.length > 800) console.log('... (truncated)');
  } else {
    console.error('\nError:', result.error);
  }
}

testAgent().catch(err => {
  console.error('Fatal error:', err.message);
  console.error(err.stack);
});

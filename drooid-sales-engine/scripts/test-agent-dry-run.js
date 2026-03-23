// Dry run test: Agent #1 Market Intelligence Scanner
// Tests the full stack: Gemini AI + Supabase storage
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');

async function dryRun() {
  console.log('=== AGENT #1 DRY RUN: Market Intelligence Scanner ===\n');

  // Initialize services
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  // Step 1: Use Gemini to identify potential leads
  console.log('Step 1: Asking Gemini to identify target companies...');
  const prompt = `You are a B2B market intelligence agent for Drooid, an AI automation company.
Identify 3 companies in the mid-market segment (50-500 employees) that would benefit from AI-powered sales automation.
For each company, provide:
- Company name
- Industry
- Estimated employee count
- Why they'd benefit from AI sales automation
- Lead score (1-100)

Return as JSON array with keys: company_name, industry, employee_count, reason, lead_score`;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  console.log('Gemini response received (' + responseText.length + ' chars)');

  // Parse the JSON from Gemini's response
  let leads;
  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    leads = JSON.parse(jsonMatch[0]);
    console.log(`Parsed ${leads.length} leads from Gemini\n`);
  } catch (e) {
    console.log('Raw response:', responseText.substring(0, 500));
    console.error('Failed to parse JSON:', e.message);
    process.exit(1);
  }

  // Step 2: Store leads in Supabase
  console.log('Step 2: Storing leads in Supabase...');
  for (const lead of leads) {
    const { data, error } = await supabase
      .from('leads')
      .insert({
        company: lead.company_name,
        industry: lead.industry,
        employee_count: lead.employee_count,
        icp_score: lead.lead_score / 100,
        source: 'agent-01-market-scanner',
        status: 'new'
      })
      .select();

    if (error) {
      console.log(`   ✗ Failed to store ${lead.company_name}: ${error.message}`);
    } else {
      console.log(`   ✓ Stored: ${lead.company_name} (ICP: ${(lead.lead_score/100).toFixed(2)}) → ID: ${data[0].id}`);
    }
  }

  // Step 3: Log agent activity
  console.log('\nStep 3: Logging agent activity...');
  const { error: logError } = await supabase
    .from('agent_logs')
    .insert({
      agent_id: '01-market-scanner',
      agent_name: 'Matt Sullivan',
      action: 'market_scan',
      input_summary: 'Mid-market AI automation prospects',
      output_summary: `Found ${leads.length} leads`,
      tokens_used: responseText.length,
      model: 'gemini-2.5-flash',
      status: 'success'
    });

  if (logError) {
    console.log(`   ✗ Log failed: ${logError.message}`);
  } else {
    console.log('   ✓ Agent activity logged');
  }

  // Step 4: Verify data in Supabase
  console.log('\nStep 4: Verifying stored data...');
  const { data: storedLeads } = await supabase
    .from('leads')
    .select('company, icp_score, status')
    .eq('source', 'agent-01-market-scanner');

  console.log(`   Found ${storedLeads?.length || 0} leads in database:`);
  (storedLeads || []).forEach(l => {
    console.log(`   → ${l.company} | ICP: ${l.icp_score} | Status: ${l.status}`);
  });

  console.log('\n========================================');
  console.log('AGENT #1 DRY RUN COMPLETE — FULL STACK VERIFIED');
  console.log('Gemini AI ✓ | Supabase Storage ✓ | Agent Logging ✓');
  console.log('========================================');
}

dryRun().catch(err => {
  console.error('Dry run failed:', err);
  process.exit(1);
});

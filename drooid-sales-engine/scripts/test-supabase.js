// Quick test to verify Supabase connection and schema
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

async function test() {
  console.log('Testing Supabase connection...');
  console.log('URL:', process.env.SUPABASE_URL);
  console.log('Key:', process.env.SUPABASE_SERVICE_KEY?.substring(0, 20) + '...');
  console.log('');

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  // Test 1: Check connection by querying leads table
  console.log('1. Testing table access...');
  const tables = ['leads', 'contacts', 'outreach', 'pipeline', 'content', 'agent_logs', 'approvals', 'agent_metrics', 'audit_log', 'rate_limits'];

  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`   ✗ ${table}: ${error.message}`);
    } else {
      console.log(`   ✓ ${table}: accessible (${data.length} rows)`);
    }
  }

  // Test 2: Insert a test agent log
  console.log('\n2. Testing write access...');
  const { data: logData, error: logError } = await supabase
    .from('agent_logs')
    .insert({
      agent_id: 'test-connection',
      action: 'connection_test',
      status: 'success',
      output_summary: 'Connection test at ' + new Date().toISOString()
    })
    .select();

  if (logError) {
    console.log(`   ✗ Write failed: ${logError.message}`);
  } else {
    console.log(`   ✓ Write successful! Log ID: ${logData[0].id}`);

    // Clean up test record
    await supabase.from('agent_logs').delete().eq('agent_id', 'test-connection');
    console.log('   ✓ Cleanup done');
  }

  // Test 3: Check masked view
  console.log('\n3. Testing contacts_masked view...');
  const { data: viewData, error: viewError } = await supabase.from('contacts_masked').select('*').limit(1);
  if (viewError) {
    console.log(`   ✗ View error: ${viewError.message}`);
  } else {
    console.log(`   ✓ contacts_masked view accessible`);
  }

  console.log('\n========================================');
  console.log('SUPABASE CONNECTION TEST COMPLETE');
  console.log('========================================');
}

test().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

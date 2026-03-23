#!/bin/bash
# Supabase Project Setup Script for Drooid Sales Engine
# Run this after creating your Supabase project at https://supabase.com

echo "=== Drooid Sales Engine — Supabase Setup ==="
echo ""
echo "Step 1: Create a free Supabase account at https://supabase.com"
echo "Step 2: Create a new project (name: drooid-sales-engine)"
echo "Step 3: Go to Settings → API and copy:"
echo "  - Project URL (SUPABASE_URL)"
echo "  - anon public key (SUPABASE_ANON_KEY)"
echo "  - service_role key (SUPABASE_SERVICE_KEY)"
echo ""

read -p "Enter your Supabase Project URL: " SUPABASE_URL
read -p "Enter your Supabase anon key: " SUPABASE_ANON_KEY
read -p "Enter your Supabase service_role key: " SUPABASE_SERVICE_KEY

# Update .env file
sed -i "s|SUPABASE_URL=.*|SUPABASE_URL=$SUPABASE_URL|" .env
sed -i "s|SUPABASE_ANON_KEY=.*|SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY|" .env
sed -i "s|SUPABASE_SERVICE_KEY=.*|SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY|" .env

echo ""
echo "✓ .env updated with Supabase credentials"
echo ""
echo "Step 4: Go to SQL Editor in Supabase dashboard"
echo "Step 5: Paste and run the contents of supabase/schema.sql"
echo ""
echo "To run the schema via CLI (if you have supabase CLI installed):"
echo "  supabase db push --db-url postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres < supabase/schema.sql"
echo ""
echo "Setup complete! Run 'node orchestrator/scheduler.js' to start the engine."

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ORIGINAL SCHEMA FOUNDATION
-- ============================================================================

-- Create timestamp update function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Leads table
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company TEXT NOT NULL,
    domain TEXT,
    industry TEXT,
    employee_count INTEGER,
    revenue_range TEXT,
    location TEXT,
    source TEXT,
    icp_score FLOAT CHECK (icp_score >= 0 AND icp_score <= 1),
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'qualified', 'engaged', 'disqualified', 'archive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_icp_score ON leads(icp_score DESC);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX idx_leads_domain ON leads(domain);

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    title TEXT,
    email TEXT,
    linkedin_url TEXT,
    phone TEXT,
    decision_maker BOOLEAN DEFAULT FALSE,
    persona_type TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_contacts_lead_id ON contacts(lead_id);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_decision_maker ON contacts(decision_maker);

-- Outreach table
CREATE TABLE IF NOT EXISTS outreach (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('linkedin', 'email', 'phone', 'social')),
    message_type TEXT,
    content TEXT,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'sent', 'failed', 'bounced')),
    approved BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP WITH TIME ZONE,
    response_at TIMESTAMP WITH TIME ZONE,
    response_type TEXT CHECK (response_type IS NULL OR response_type IN ('positive', 'negative', 'neutral', 'no_response')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER outreach_updated_at
    BEFORE UPDATE ON outreach
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_outreach_contact_id ON outreach(contact_id);
CREATE INDEX idx_outreach_status ON outreach(status);
CREATE INDEX idx_outreach_channel ON outreach(channel);
CREATE INDEX idx_outreach_created_at ON outreach(created_at DESC);

-- Pipeline table
CREATE TABLE IF NOT EXISTS pipeline (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    stage TEXT NOT NULL CHECK (stage IN ('lead', 'qualified', 'meeting', 'proposal', 'negotiation', 'closed_won', 'closed_lost')),
    deal_value DECIMAL(15, 2),
    probability FLOAT CHECK (probability >= 0 AND probability <= 1),
    next_action TEXT,
    next_action_date TIMESTAMP WITH TIME ZONE,
    assigned_agent TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER pipeline_updated_at
    BEFORE UPDATE ON pipeline
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_pipeline_stage ON pipeline(stage);
CREATE INDEX idx_pipeline_assigned_agent ON pipeline(assigned_agent);
CREATE INDEX idx_pipeline_created_at ON pipeline(created_at DESC);
CREATE INDEX idx_pipeline_next_action_date ON pipeline(next_action_date);

-- Content table
CREATE TABLE IF NOT EXISTS content (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type TEXT NOT NULL CHECK (type IN ('blog', 'social', 'email_template', 'case_study', 'whitepaper')),
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'published', 'archived')),
    approved BOOLEAN DEFAULT FALSE,
    published_at TIMESTAMP WITH TIME ZONE,
    platform TEXT,
    engagement_metrics JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TRIGGER content_updated_at
    BEFORE UPDATE ON content
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_content_type ON content(type);
CREATE INDEX idx_content_status ON content(status);
CREATE INDEX idx_content_created_at ON content(created_at DESC);

-- Agent logs table
CREATE TABLE IF NOT EXISTS agent_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id TEXT NOT NULL,
    agent_name TEXT,
    action TEXT,
    input_summary TEXT,
    output_summary TEXT,
    tokens_used INTEGER,
    model TEXT,
    duration_ms INTEGER,
    status TEXT CHECK (status IN ('success', 'failure', 'pending')),
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_agent_logs_agent_id ON agent_logs(agent_id);
CREATE INDEX idx_agent_logs_created_at ON agent_logs(created_at DESC);
CREATE INDEX idx_agent_logs_status ON agent_logs(status);

-- Approvals table
CREATE TABLE IF NOT EXISTS approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewer_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_approvals_status ON approvals(status);
CREATE INDEX idx_approvals_agent_id ON approvals(agent_id);
CREATE INDEX idx_approvals_created_at ON approvals(created_at DESC);

-- Agent metrics table
CREATE TABLE IF NOT EXISTS agent_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    metric_value FLOAT,
    period TEXT,
    measured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_agent_metrics_agent_id ON agent_metrics(agent_id);
CREATE INDEX idx_agent_metrics_measured_at ON agent_metrics(measured_at DESC);

-- ============================================================================
-- SECURITY ENHANCEMENTS - SECTION 1: AUDIT TRAIL TABLE + TRIGGERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    record_id UUID,
    old_data JSONB,
    new_data JSONB,
    changed_by TEXT DEFAULT current_setting('request.jwt.claims', true)::json->>'sub',
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address TEXT DEFAULT current_setting('request.headers', true)::json->>'x-forwarded-for'
);

CREATE INDEX idx_audit_log_table ON audit_log(table_name, changed_at);
CREATE INDEX idx_audit_log_operation ON audit_log(operation, changed_at);

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, operation, record_id, new_data)
    VALUES (TG_TABLE_NAME, 'INSERT', NEW.id, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (table_name, operation, record_id, old_data, new_data)
    VALUES (TG_TABLE_NAME, 'UPDATE', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (table_name, operation, record_id, old_data)
    VALUES (TG_TABLE_NAME, 'DELETE', OLD.id, to_jsonb(OLD));
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach audit triggers to ALL tables
CREATE TRIGGER audit_leads AFTER INSERT OR UPDATE OR DELETE ON leads
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_contacts AFTER INSERT OR UPDATE OR DELETE ON contacts
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_outreach AFTER INSERT OR UPDATE OR DELETE ON outreach
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_pipeline AFTER INSERT OR UPDATE OR DELETE ON pipeline
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_content AFTER INSERT OR UPDATE OR DELETE ON content
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_agent_logs AFTER INSERT OR UPDATE OR DELETE ON agent_logs
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_approvals AFTER INSERT OR UPDATE OR DELETE ON approvals
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_agent_metrics AFTER INSERT OR UPDATE OR DELETE ON agent_metrics
  FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ============================================================================
-- SECURITY ENHANCEMENTS - SECTION 2: DATA VALIDATION CONSTRAINTS
-- ============================================================================

-- Email format validation
ALTER TABLE contacts ADD CONSTRAINT valid_email
  CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

-- LinkedIn URL validation
ALTER TABLE contacts ADD CONSTRAINT valid_linkedin
  CHECK (linkedin_url IS NULL OR linkedin_url ~* '^https?://(www\.)?linkedin\.com/');

-- Domain format validation
ALTER TABLE leads ADD CONSTRAINT valid_domain
  CHECK (domain IS NULL OR domain ~* '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$');

-- ICP score range (enhanced constraint - 0-100)
ALTER TABLE leads ADD CONSTRAINT valid_icp_score
  CHECK (icp_score IS NULL OR (icp_score >= 0 AND icp_score <= 100));

-- Deal value non-negative
ALTER TABLE pipeline ADD CONSTRAINT valid_deal_value
  CHECK (deal_value IS NULL OR deal_value >= 0);

-- Probability range
ALTER TABLE pipeline ADD CONSTRAINT valid_probability
  CHECK (probability IS NULL OR (probability >= 0 AND probability <= 1));

-- ============================================================================
-- SECURITY ENHANCEMENTS - SECTION 3: XSS PREVENTION AND CONTENT SANITIZATION
-- ============================================================================

-- Strip HTML tags function
CREATE OR REPLACE FUNCTION strip_html_tags(input TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN regexp_replace(input, '<[^>]*>', '', 'g');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Sanitize outreach content to prevent XSS
CREATE OR REPLACE FUNCTION sanitize_outreach_content()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.content IS NOT NULL THEN
    -- Strip script tags and event handlers
    NEW.content := regexp_replace(NEW.content, '<script[^>]*>.*?</script>', '', 'gi');
    NEW.content := regexp_replace(NEW.content, '\bon\w+\s*=', '', 'gi');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sanitize_outreach BEFORE INSERT OR UPDATE ON outreach
  FOR EACH ROW EXECUTE FUNCTION sanitize_outreach_content();

-- ============================================================================
-- SECURITY ENHANCEMENTS - SECTION 4: RATE LIMITING AT DATABASE LEVEL
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  agent_id TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT date_trunc('hour', NOW()),
  operation_count INT DEFAULT 0,
  PRIMARY KEY (agent_id, window_start)
);

CREATE INDEX idx_rate_limits_window ON rate_limits(agent_id, window_start);

-- Function to check rate limit before operations
CREATE OR REPLACE FUNCTION check_rate_limit(p_agent_id TEXT, p_max_ops INT DEFAULT 100)
RETURNS BOOLEAN AS $$
DECLARE
  current_count INT;
BEGIN
  INSERT INTO rate_limits (agent_id, window_start, operation_count)
  VALUES (p_agent_id, date_trunc('hour', NOW()), 1)
  ON CONFLICT (agent_id, window_start)
  DO UPDATE SET operation_count = rate_limits.operation_count + 1
  RETURNING operation_count INTO current_count;

  RETURN current_count <= p_max_ops;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECURITY ENHANCEMENTS - SECTION 5: SENSITIVE DATA PROTECTION (MASKING)
-- ============================================================================

-- Email masking function (for dashboard/anon views)
CREATE OR REPLACE FUNCTION mask_email(email TEXT)
RETURNS TEXT AS $$
BEGIN
  IF email IS NULL THEN RETURN NULL; END IF;
  RETURN substring(email, 1, 2) || '***@' || split_part(email, '@', 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Phone masking function
CREATE OR REPLACE FUNCTION mask_phone(phone TEXT)
RETURNS TEXT AS $$
BEGIN
  IF phone IS NULL THEN RETURN NULL; END IF;
  RETURN '***-***-' || right(phone, 4);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create masked view for dashboard (non-sensitive contact viewing)
CREATE OR REPLACE VIEW contacts_masked AS
SELECT
  id, lead_id, name, title,
  mask_email(email) as email,
  linkedin_url,
  mask_phone(phone) as phone,
  decision_maker, persona_type, created_at
FROM contacts;

-- ============================================================================
-- SECURITY ENHANCEMENTS - SECTION 6: CLEANUP AND RETENTION FUNCTIONS
-- ============================================================================

-- Auto-cleanup old audit logs (keep 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM audit_log WHERE changed_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Auto-cleanup old agent logs (keep 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_agent_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM agent_logs WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Cleanup old rate limit records daily
CREATE OR REPLACE FUNCTION cleanup_rate_limits()
RETURNS void AS $$
BEGIN
  DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SECURITY ENHANCEMENTS - SECTION 7: ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE outreach ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE content ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES - SERVICE ROLE (Backend service has full access)
-- ============================================================================

-- Leads: Service role can do everything
CREATE POLICY "service_role_all" ON leads FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Contacts: Service role can do everything
CREATE POLICY "service_role_all" ON contacts FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Outreach: Service role can do everything
CREATE POLICY "service_role_all" ON outreach FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Pipeline: Service role can do everything
CREATE POLICY "service_role_all" ON pipeline FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Content: Service role can do everything
CREATE POLICY "service_role_all" ON content FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Agent logs: Service role can do everything
CREATE POLICY "service_role_all" ON agent_logs FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Approvals: Service role can do everything
CREATE POLICY "service_role_all" ON approvals FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Agent metrics: Service role can do everything
CREATE POLICY "service_role_all" ON agent_metrics FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Audit log: Service role can do everything
CREATE POLICY "service_role_all" ON audit_log FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Rate limits: Service role can do everything
CREATE POLICY "service_role_all" ON rate_limits FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- RLS POLICIES - AUTHENTICATED ROLE (CEO Dashboard)
-- ============================================================================

-- Leads: Authenticated users can read all
CREATE POLICY "auth_read_leads" ON leads FOR SELECT USING (auth.role() = 'authenticated');

-- Contacts: Authenticated users can read all
CREATE POLICY "auth_read_contacts" ON contacts FOR SELECT USING (auth.role() = 'authenticated');

-- Pipeline: Authenticated users can read all
CREATE POLICY "auth_read_pipeline" ON pipeline FOR SELECT USING (auth.role() = 'authenticated');

-- Content: Authenticated users can read all
CREATE POLICY "auth_read_content" ON content FOR SELECT USING (auth.role() = 'authenticated');

-- Agent metrics: Authenticated users can read all
CREATE POLICY "auth_read_agent_metrics" ON agent_metrics FOR SELECT USING (auth.role() = 'authenticated');

-- Approvals: Authenticated users (CEO) can read and update only
CREATE POLICY "auth_read_approvals" ON approvals FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "auth_update_approvals" ON approvals FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Agent logs: No authenticated access (internal only)
CREATE POLICY "deny_auth_agent_logs" ON agent_logs FOR ALL USING (FALSE);

-- Outreach: No authenticated access (requires service role)
CREATE POLICY "deny_auth_outreach" ON outreach FOR ALL USING (FALSE);

-- Audit log: Authenticated users can read for compliance
CREATE POLICY "auth_read_audit" ON audit_log FOR SELECT USING (auth.role() = 'authenticated');

-- Rate limits: No authenticated access
CREATE POLICY "deny_auth_rate_limits" ON rate_limits FOR ALL USING (FALSE);

-- ============================================================================
-- RLS POLICIES - ANON ROLE (Anonymous/Public access - minimal)
-- ============================================================================

-- Anon role: read-only on non-sensitive tables
CREATE POLICY "anon_read_leads" ON leads FOR SELECT USING (auth.role() = 'anon');
CREATE POLICY "anon_read_pipeline" ON pipeline FOR SELECT USING (auth.role() = 'anon');

-- Deny all other access for anon
CREATE POLICY "deny_anon_contacts" ON contacts FOR ALL USING (FALSE);
CREATE POLICY "deny_anon_outreach" ON outreach FOR ALL USING (FALSE);
CREATE POLICY "deny_anon_content" ON content FOR ALL USING (FALSE);
CREATE POLICY "deny_anon_agent_logs" ON agent_logs FOR ALL USING (FALSE);
CREATE POLICY "deny_anon_approvals" ON approvals FOR ALL USING (FALSE);
CREATE POLICY "deny_anon_agent_metrics" ON agent_metrics FOR ALL USING (FALSE);
CREATE POLICY "deny_anon_audit_log" ON audit_log FOR ALL USING (FALSE);
CREATE POLICY "deny_anon_rate_limits" ON rate_limits FOR ALL USING (FALSE);

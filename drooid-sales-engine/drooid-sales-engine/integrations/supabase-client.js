const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const { sanitize, sanitizeObject } = require('../security/input-sanitizer');
const auditLogger = require('../security/audit-logger');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// Field validators
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validateUrl(url) {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

function validateAndSanitizeTextField(value, fieldName) {
    if (typeof value !== 'string') return value;
    const { text, sanitized } = sanitize(value, { maxLength: 10000 });
    if (sanitized) {
        auditLogger.security('field-sanitized', { field: fieldName, original: value.substring(0, 50) });
    }
    return text;
}

// Helper response shape
function formatResponse(data, error) {
    return { data, error };
}

// Insert a new lead
async function insertLead(leadData) {
    try {
        // Sanitize all text fields
        const sanitizedData = {
            ...leadData,
            company_name: validateAndSanitizeTextField(leadData.company_name, 'company_name'),
            contact_name: validateAndSanitizeTextField(leadData.contact_name, 'contact_name'),
            email: validateAndSanitizeTextField(leadData.email, 'email'),
            phone: validateAndSanitizeTextField(leadData.phone, 'phone'),
            notes: validateAndSanitizeTextField(leadData.notes, 'notes'),
        };

        // Validate email format if present
        if (sanitizedData.email && !validateEmail(sanitizedData.email)) {
            return formatResponse(null, 'Invalid email format');
        }

        auditLogger.dataOperation('insert', 'leads', { leadId: leadData.id });

        const { data, error } = await supabase.from('leads').insert([sanitizedData]).select();
        if (error) throw error;
        return formatResponse(data?.[0] || null, null);
    } catch (error) {
        auditLogger.error('insert-lead-failed', { error: error.message });
        return formatResponse(null, error.message);
    }
}

// Update an existing lead
async function updateLead(leadId, updates) {
    try {
        // Sanitize all text fields
        const sanitizedUpdates = {};
        for (const [key, value] of Object.entries(updates)) {
            if (typeof value === 'string') {
                sanitizedUpdates[key] = validateAndSanitizeTextField(value, key);
            } else {
                sanitizedUpdates[key] = value;
            }
        }

        // Validate email if present
        if (sanitizedUpdates.email && !validateEmail(sanitizedUpdates.email)) {
            return formatResponse(null, 'Invalid email format');
        }

        auditLogger.dataOperation('update', 'leads', { leadId });

        const { data, error } = await supabase
            .from('leads')
            .update(sanitizedUpdates)
            .eq('id', leadId)
            .select();
        if (error) throw error;
        return formatResponse(data?.[0] || null, null);
    } catch (error) {
        auditLogger.error('update-lead-failed', { leadId, error: error.message });
        return formatResponse(null, error.message);
    }
}

// Insert a new contact
async function insertContact(contactData) {
    try {
        // Sanitize text fields
        const sanitizedData = {
            ...contactData,
            name: validateAndSanitizeTextField(contactData.name, 'contact_name'),
            email: validateAndSanitizeTextField(contactData.email, 'contact_email'),
            phone: validateAndSanitizeTextField(contactData.phone, 'contact_phone'),
            title: validateAndSanitizeTextField(contactData.title, 'contact_title'),
            notes: validateAndSanitizeTextField(contactData.notes, 'contact_notes'),
        };

        // Validate email
        if (sanitizedData.email && !validateEmail(sanitizedData.email)) {
            return formatResponse(null, 'Invalid email format');
        }

        auditLogger.dataOperation('insert', 'contacts', { leadId: contactData.lead_id });

        const { data, error } = await supabase
            .from('contacts')
            .insert([sanitizedData])
            .select();
        if (error) throw error;
        return formatResponse(data?.[0] || null, null);
    } catch (error) {
        auditLogger.error('insert-contact-failed', { error: error.message });
        return formatResponse(null, error.message);
    }
}

// Get contacts by lead ID
async function getContactsByLeadId(leadId) {
    try {
        const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .eq('lead_id', leadId);
        if (error) throw error;
        return formatResponse(data || [], null);
    } catch (error) {
        return formatResponse([], error.message);
    }
}

// Log an agent action
async function logAgentAction(logData) {
    try {
        // Sanitize text fields in logs
        const sanitizedLog = {
            agent_id: logData.agent_id,
            agent_name: validateAndSanitizeTextField(logData.agent_name, 'agent_name'),
            action: logData.action,
            input_summary: validateAndSanitizeTextField(logData.input_summary, 'input_summary'),
            output_summary: validateAndSanitizeTextField(logData.output_summary, 'output_summary'),
            tokens_used: logData.tokens_used || 0,
            model: logData.model || 'gemini-2.5-flash',
            duration_ms: logData.duration_ms || 0,
            status: logData.status || 'pending',
            error: logData.error ? validateAndSanitizeTextField(logData.error, 'error') : null,
        };

        auditLogger.dataOperation('insert', 'agent_logs', { agentId: logData.agent_id });

        const { data, error } = await supabase
            .from('agent_logs')
            .insert([sanitizedLog])
            .select();
        if (error) throw error;
        return formatResponse(data?.[0] || null, null);
    } catch (error) {
        auditLogger.error('log-agent-action-failed', { error: error.message });
        return formatResponse(null, error.message);
    }
}

// Create an approval record
async function createApproval(approvalData) {
    try {
        const { data, error } = await supabase
            .from('approvals')
            .insert([{
                agent_id: approvalData.agent_id,
                action_type: approvalData.action_type,
                payload: approvalData.payload,
                status: 'pending',
            }])
            .select();
        if (error) throw error;
        return formatResponse(data?.[0] || null, null);
    } catch (error) {
        return formatResponse(null, error.message);
    }
}

// Get approval status
async function getApprovalStatus(approvalId) {
    try {
        const { data, error } = await supabase
            .from('approvals')
            .select('*')
            .eq('id', approvalId)
            .single();
        if (error) throw error;
        return formatResponse(data || null, null);
    } catch (error) {
        return formatResponse(null, error.message);
    }
}

// Get pending approvals for an agent
async function getPendingApprovals(agentId) {
    try {
        const { data, error } = await supabase
            .from('approvals')
            .select('*')
            .eq('agent_id', agentId)
            .eq('status', 'pending')
            .order('created_at', { ascending: true });
        if (error) throw error;
        return formatResponse(data || [], null);
    } catch (error) {
        return formatResponse([], error.message);
    }
}

// Update approval status
async function updateApprovalStatus(approvalId, status, notes = null) {
    try {
        const updateData = {
            status,
            reviewed_at: new Date().toISOString(),
        };
        if (notes) updateData.reviewer_notes = notes;

        const { data, error } = await supabase
            .from('approvals')
            .update(updateData)
            .eq('id', approvalId)
            .select();
        if (error) throw error;
        return formatResponse(data?.[0] || null, null);
    } catch (error) {
        return formatResponse(null, error.message);
    }
}

// Update pipeline stage
async function updatePipelineStage(pipelineId, updates) {
    try {
        const { data, error } = await supabase
            .from('pipeline')
            .update(updates)
            .eq('id', pipelineId)
            .select();
        if (error) throw error;
        return formatResponse(data?.[0] || null, null);
    } catch (error) {
        return formatResponse(null, error.message);
    }
}

// Get or create pipeline record
async function getOrCreatePipeline(leadId) {
    try {
        // Try to get existing
        const { data: existing, error: getError } = await supabase
            .from('pipeline')
            .select('*')
            .eq('lead_id', leadId)
            .single();

        if (existing) return formatResponse(existing, null);

        // Create new if doesn't exist
        const { data: created, error: createError } = await supabase
            .from('pipeline')
            .insert([{
                lead_id: leadId,
                stage: 'lead',
                probability: 0.1,
            }])
            .select();

        if (createError) throw createError;
        return formatResponse(created?.[0] || null, null);
    } catch (error) {
        return formatResponse(null, error.message);
    }
}

// Insert content
async function insertContent(contentData) {
    try {
        // Sanitize content text
        const sanitizedData = {
            ...contentData,
            title: validateAndSanitizeTextField(contentData.title, 'content_title'),
            body: validateAndSanitizeTextField(contentData.body, 'content_body'),
            metadata: contentData.metadata ? sanitizeObject(contentData.metadata) : null,
        };

        auditLogger.dataOperation('insert', 'content', { contentType: contentData.type });

        const { data, error } = await supabase
            .from('content')
            .insert([sanitizedData])
            .select();
        if (error) throw error;
        return formatResponse(data?.[0] || null, null);
    } catch (error) {
        auditLogger.error('insert-content-failed', { error: error.message });
        return formatResponse(null, error.message);
    }
}

// Update content
async function updateContent(contentId, updates) {
    try {
        // Sanitize text fields
        const sanitizedUpdates = {};
        for (const [key, value] of Object.entries(updates)) {
            if (typeof value === 'string') {
                sanitizedUpdates[key] = validateAndSanitizeTextField(value, key);
            } else if (typeof value === 'object') {
                sanitizedUpdates[key] = sanitizeObject(value);
            } else {
                sanitizedUpdates[key] = value;
            }
        }

        auditLogger.dataOperation('update', 'content', { contentId });

        const { data, error } = await supabase
            .from('content')
            .update(sanitizedUpdates)
            .eq('id', contentId)
            .select();
        if (error) throw error;
        return formatResponse(data?.[0] || null, null);
    } catch (error) {
        auditLogger.error('update-content-failed', { contentId, error: error.message });
        return formatResponse(null, error.message);
    }
}

// Record agent metrics
async function recordAgentMetric(agentId, metricName, metricValue, period = 'daily') {
    try {
        const { data, error } = await supabase
            .from('agent_metrics')
            .insert([{
                agent_id: agentId,
                metric_name: metricName,
                metric_value: metricValue,
                period,
            }])
            .select();
        if (error) throw error;
        return formatResponse(data?.[0] || null, null);
    } catch (error) {
        return formatResponse(null, error.message);
    }
}

// Get agent metrics
async function getAgentMetrics(agentId, limit = 100) {
    try {
        const { data, error } = await supabase
            .from('agent_metrics')
            .select('*')
            .eq('agent_id', agentId)
            .order('measured_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return formatResponse(data || [], null);
    } catch (error) {
        return formatResponse([], error.message);
    }
}

// Query leads with filters
async function queryLeads(filters = {}) {
    try {
        let query = supabase.from('leads').select('*');

        if (filters.status) query = query.eq('status', filters.status);
        if (filters.industry) query = query.eq('industry', filters.industry);
        if (filters.minIcpScore !== undefined) query = query.gte('icp_score', filters.minIcpScore);
        if (filters.maxIcpScore !== undefined) query = query.lte('icp_score', filters.maxIcpScore);
        if (filters.source) query = query.eq('source', filters.source);
        if (filters.limit) query = query.limit(filters.limit);
        if (filters.offset) query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        return formatResponse(data || [], null);
    } catch (error) {
        return formatResponse([], error.message);
    }
}

// Query pipeline with filters
async function queryPipeline(filters = {}) {
    try {
        let query = supabase.from('pipeline').select('*');

        if (filters.stage) query = query.eq('stage', filters.stage);
        if (filters.assignedAgent) query = query.eq('assigned_agent', filters.assignedAgent);
        if (filters.minProbability !== undefined) query = query.gte('probability', filters.minProbability);
        if (filters.maxProbability !== undefined) query = query.lte('probability', filters.maxProbability);
        if (filters.limit) query = query.limit(filters.limit);

        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;
        return formatResponse(data || [], null);
    } catch (error) {
        return formatResponse([], error.message);
    }
}

// Insert outreach record
async function insertOutreach(outreachData) {
    try {
        const { data, error } = await supabase
            .from('outreach')
            .insert([outreachData])
            .select();
        if (error) throw error;
        return formatResponse(data?.[0] || null, null);
    } catch (error) {
        return formatResponse(null, error.message);
    }
}

// Update outreach record
async function updateOutreach(outreachId, updates) {
    try {
        const { data, error } = await supabase
            .from('outreach')
            .update(updates)
            .eq('id', outreachId)
            .select();
        if (error) throw error;
        return formatResponse(data?.[0] || null, null);
    } catch (error) {
        return formatResponse(null, error.message);
    }
}

// Get outreach records by contact
async function getOutreachByContact(contactId) {
    try {
        const { data, error } = await supabase
            .from('outreach')
            .select('*')
            .eq('contact_id', contactId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return formatResponse(data || [], null);
    } catch (error) {
        return formatResponse([], error.message);
    }
}

module.exports = {
    insertLead,
    updateLead,
    insertContact,
    getContactsByLeadId,
    logAgentAction,
    createApproval,
    getApprovalStatus,
    getPendingApprovals,
    updateApprovalStatus,
    updatePipelineStage,
    getOrCreatePipeline,
    insertContent,
    updateContent,
    recordAgentMetric,
    getAgentMetrics,
    queryLeads,
    queryPipeline,
    insertOutreach,
    updateOutreach,
    getOutreachByContact,
};

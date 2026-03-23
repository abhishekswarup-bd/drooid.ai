# Drooid Sales Engine - 9 Autonomous Sales Agents

## Overview

This directory contains 9 production-ready OpenClaw-compatible Gemini 2.5 Flash agents that form the autonomous sales system. Each agent is a standalone Node.js module responsible for a specific phase of the B2B sales process.

## Architecture

### Directory Structure
```
agents/
├── discover/
│   ├── 01-prospect-scout.js
│   ├── 02-decision-maker-finder.js
│   └── 03-icp-profiler.js
├── engage/
│   ├── 04-linkedin-outreach.js
│   ├── 05-email-sequence-writer.js
│   ├── 06-message-crafter.js
│   ├── 07-response-handler.js
│   ├── 08-objection-handler.js
│   └── 09-meeting-scheduler.js
└── AGENTS_GUIDE.md (this file)
```

## DISCOVER PHASE - Find Qualified Prospects

### Agent 01: Prospect Scout
**File:** `discover/01-prospect-scout.js`

**Purpose:** Identifies companies matching ICP criteria and surfaces high-quality leads.

**Inputs:**
- `companies`: Array of companies scraped from web (name, domain, website content, news, funding data, tech stack, job postings)
- `icp_config`: ICP criteria (industries, revenue range $1M-$50M, employees 10-500)

**Processing:**
1. Filters out previously-processed companies
2. Sends to Gemini for ICP matching analysis
3. Scores each company (0-100) on:
   - Revenue fit (0-25)
   - Industry fit (0-25)
   - Growth signals (0-20)
   - Pain point relevance (0-15)
   - Decision-making clarity (0-15)
4. Classifies: OUTREACH (≥65), WATCH_LIST (50-64), NOT_QUALIFIED (<50)

**Outputs:**
- Inserts qualified leads into `leads` table with status='pending_approval'
- Creates approval records requiring CEO sign-off before activation
- Returns: qualified prospects count, watch list items, not qualified count

**System Prompt Highlights:**
- Expert B2B sales researcher with deep AI adoption signals understanding
- Conservative scoring (better to miss than pursue unqualified)
- Detects: recent funding, hiring AI roles, digital transformation mentions, tech stack indicators

**Approval Required:** YES - All new leads need CEO approval before entering active pipeline

---

### Agent 02: Decision Maker Finder
**File:** `discover/02-decision-maker-finder.js`

**Purpose:** Maps buying committee structure and identifies decision-makers at approved leads.

**Inputs:**
- Approved leads from `leads` table (status='approved')
- Company context: industry, size, growth signals, pain points, tech stack

**Processing:**
1. For each approved lead, analyzes organizational structure
2. Identifies likely buying committee roles:
   - Economic Buyer (CFO/COO level - budget authority)
   - Technical Evaluator (CTO/VP Eng/Head of ML - feasibility)
   - Champion (mid-level technologist - internal advocate)
   - Blocker (Legal/Security/Compliance - objection source)
   - User (Operations/data team - usability focus)
3. Sends to Gemini to identify specific contacts by title
4. Validates contact data (confidence scoring)

**Outputs:**
- Inserts contacts into `contacts` table with persona_type and confidence scores (>70)
- Updates lead with buying committee summary, champion name, decision velocity
- Returns: leads processed, total contacts found, committee breakdowns

**System Prompt Highlights:**
- Expert at mapping org structures and buying committee composition
- Company-size aware (founder-led = faster decisions, large = longer cycles)
- Persona assignment based on signals: not just title, but recent activity

**Approval Required:** NO - Data gathering only

---

### Agent 03: ICP Profiler
**File:** `discover/03-icp-profiler.js`

**Purpose:** Creates deep, actionable company profiles for hyper-personalized outreach.

**Inputs:**
- Single lead_id to profile
- Additional context: website content, recent news, technical blogs, fundraising info, team info

**Processing:**
1. Gathers comprehensive company data
2. Analyzes:
   - Company summary and market position
   - 5-7 specific, documented pain points
   - Growth signals (funding, hiring, product launches, partnerships)
   - Technology stack gaps and infrastructure challenges
   - Competitive landscape and differentiation needs
   - Personalization hooks (specific verifiable details)
   - Recommended sales approach and entry point
   - Urgency score (1-10) based on buying readiness

**Outputs:**
- Creates ICP profile record in `icp_profiles` table (JSON)
- Stores detailed breakdown: pain points, growth signals, tech stack gaps
- Includes personalization hooks, recommended approach, ROI talking points
- Returns: urgency score, key pain points, recommended entry point

**System Prompt Highlights:**
- Senior sales intelligence analyst (not generic sales person)
- Specificity-focused: "They use AI" is bad, "Published 4 ML blog posts in Q4" is good
- Business relevance: Always connect technical findings to business impact
- Decision readiness: Assesses whether ready to buy NOW vs in 6 months
- Reference matching: Suggests which case studies are relevant

**Approval Required:** NO

---

## ENGAGE PHASE - Initiate Conversations

### Agent 04: LinkedIn Outreach
**File:** `engage/04-linkedin-outreach.js`

**Purpose:** Crafts personalized LinkedIn connection request sequences.

**Inputs:**
- contact_id: Specific contact to create sequence for
- Pulls: Contact details, lead context, ICP profile

**Processing:**
1. Builds personalization context from contact and company data
2. Generates 4-message LinkedIn sequence:
   - **Message 1 (Day 0):** Connection request (max 300 chars)
     - Must reference 2+ specific details
     - Show research without being creepy
     - Never generic ("I'd like to connect")
   - **Message 2 (Day 3):** Value message (max 150 words)
     - Share insight specific to their challenge
     - No pitch, just value
   - **Message 3 (Day 7):** Soft CTA (max 150 words)
     - Introduce self/company briefly
     - Suggest casual conversation
     - Position as peer exploration
   - **Message 4 (Day 14):** Breakup (max 100 words)
     - Acknowledge busy schedule
     - Leave door open for future

**Outputs:**
- Creates outreach record in `outreach` table with channel='linkedin'
- Stores all 4 messages with timestamps (days 0, 3, 7, 14)
- Creates approval record requiring CEO sign-off
- Returns: outreach_id, personalization/authenticity scores, messages preview

**System Prompt Highlights:**
- Expert LinkedIn sales outreach specialist
- Peer-to-peer tone, never templated
- Value-first: Always lead with insight, not sales pitch
- Authenticity: Every detail verifiable and true
- Psychology: Connection requests get 45-55% acceptance, messages 60-70% open rate

**Approval Required:** YES - All outbound messages need CEO approval

---

### Agent 05: Email Sequence Writer
**File:** `engage/05-email-sequence-writer.js`

**Purpose:** Generates personalized cold email sequences (companion to LinkedIn).

**Inputs:**
- contact_id: Specific contact
- Contact details, lead context, ICP profile, LinkedIn engagement history

**Processing:**
1. Creates 4-email cold email sequence:
   - **Email 1 (Day 0):** Initial cold open
     - Cold open with relevance (why them specifically)
     - Share insight about their company
     - Ask genuine question (not selling)
     - No CTA - just value
     - Word limit: 120 words
   - **Email 2 (Day 2):** Follow-up #1
     - Assume busy (don't be hurt)
     - Additional insight/value
     - Reference growth signal
     - Word limit: 130 words
   - **Email 3 (Day 5):** Value-add / soft ask
     - Introduce self and company first mention
     - Share relevant case study/metric
     - Suggest low-commitment conversation (15min)
     - Word limit: 140 words
   - **Email 4 (Day 10):** Breakup
     - Acknowledge busy schedule
     - Leave door open for future timing
     - No guilt trip
     - Word limit: 100 words

2. Subject lines are curiosity-driven (never clickbait)
3. Objection prevention built into sequences

**Outputs:**
- Creates outreach record in `outreach` table with channel='email'
- Stores 4 emails with subjects and bodies
- Creates approval record requiring CEO sign-off
- Returns: outreach_id, personalization/value/objection scores, emails preview

**System Prompt Highlights:**
- B2B cold email copywriter (SaaS/AI services specialization)
- Never spammy - feels like real person, not sales tool
- Concise: Shorter = higher response rates
- Value-first: Every email provides value before asking
- Target response rate: 15-25% (industry-leading for cold email)

**Approval Required:** YES

---

### Agent 06: Message Crafter
**File:** `engage/06-message-crafter.js`

**Purpose:** Quality assurance layer - refines/improves outbound messages before sending.

**Inputs:**
- Draft outreach records from `outreach` table (status='draft')
- All messages (LinkedIn sequences, email sequences)

**Processing:**
1. Evaluates each message on 5 criteria (0-100):
   - **Personalization (0-25):** 2+ specific verifiable details? Recent? Company/prospect relevant?
   - **Value Proposition (0-25):** Value before ask? Relevant to their situation? Shows understanding?
   - **Tone & Authenticity (0-20):** Sounds real? Peer-to-peer? Conversational? No corporate jargon?
   - **CTA Clarity (0-15):** Clear next step? Low-pressure? Non-threatening? Commitment level clear?
   - **Length Compliance (0-15):** Within guidelines? Efficient word usage? Concise?

2. Verdict for each sequence:
   - **APPROVED** (≥80): High quality, ready to send
   - **IMPROVED_VERSION**: Agent provides improved version
   - **REVISE** (50-79): Specific feedback for improvement
   - **REJECTED** (<50): Cannot be sent (grammar, wrong company, generic, too salesy)

3. Red flags (auto-reject):
   - Misspellings or grammar errors
   - Wrong company/contact name
   - Generic language
   - Overly salesy ("Act now", "Limited time")
   - No value, just pitch
   - Spam patterns

**Outputs:**
- Updates outreach status to 'ready_for_send' (approved) or 'needs_revision' (rejected)
- Stores quality scores and feedback
- Returns: approved count, revised count, rejected count with issues

**System Prompt Highlights:**
- Senior copywriter and messaging strategist
- Quality before speed - generic messages never pass
- Improvement focus: Can often improve rather than reject
- Red flag detection: Spam patterns, platform guideline violations

**Approval Required:** NO - Pre-approval quality check

---

### Agent 07: Response Handler
**File:** `engage/07-response-handler.js`

**Purpose:** Classifies incoming prospect responses and routes them appropriately.

**Inputs:**
- Unprocessed responses from `responses` table
- Contact and lead context for each response

**Processing:**
1. Classifies responses into 9 categories:
   - **POSITIVE_INTEREST** → Warm follow-up + schedule call
   - **MEETING_REQUEST** → Route to Agent 09 (Meeting Scheduler)
   - **QUESTION** → Provide answer about Drooid services
   - **OBJECTION** → Route to Agent 08 (Objection Handler)
   - **NOT_NOW** → Set future touchpoint, nurture sequence
   - **NOT_INTERESTED** → Stop outreach, mark as dead
   - **OUT_OF_OFFICE** → Respect schedule, revisit later
   - **WRONG_PERSON** → Get referred to right contact
   - **DO_NOT_CONTACT** → STOP ALL OUTREACH (legal requirement)

2. For each response:
   - Analyzes sentiment (positive/neutral/negative)
   - Detects buying signals
   - Determines urgency level
   - Recommends next action
   - For positive responses: drafts warm follow-up

**Outputs:**
- Updates response status to 'processed'
- Stores classification, sentiment, confidence score
- Routes to appropriate agent if needed
- Creates approval records for responses going back to prospect
- Returns: classification breakdown, routing information

**System Prompt Highlights:**
- Expert at reading between lines
- Buying signal detection (timeline, process, team mentions)
- Legal compliance aware (DNC requests MUST stop outreach)
- Sentiment-first approach before classification

**Approval Required:** YES - For any reply going back to prospect

---

### Agent 08: Objection Handler
**File:** `engage/08-objection-handler.js`

**Purpose:** Handles B2B sales objections with empathy and intelligence.

**Inputs:**
- Objection responses routed from Agent 07
- Full conversation history
- Prospect context and ICP profile

**Processing:**
1. Analyzes objection to identify:
   - Type: cost, internal team, timing, competitor, etc.
   - Root concern: What are they really worried about?
   - Emotional tone: frustrated, cautious, curious, defensive?

2. Develops reframe strategy:
   - Validate their concern (they're right to raise it)
   - Ask clarifying questions to understand root issue
   - Reframe around THEIR priorities and goals
   - Provide specific evidence (case study, metric, example)
   - Suggest specific next step

3. Common objections handled:
   - "Too expensive" → ROI reframe with business impact
   - "Internal team" → Augmentation angle, force multiplier
   - "Not now" → Identify trigger that changes timing
   - "Competitor evaluation" → Differentiation on specifics
   - "Send info" → Suggest more efficient next step
   - "Need to discuss with team" → Help facilitate committee
   - "No clear champion" → Help identify internal advocate
   - "Security/legal concerns" → Take seriously, provide evidence

**Outputs:**
- Updates response status to 'handled'
- Stores objection type, root concern, strategy
- Stores draft response addressing objection
- Creates approval record for response to prospect
- Returns: objection type, root concern, strategic approach

**System Prompt Highlights:**
- Senior sales strategist (consultative, not argumentative)
- Never argues - always validates first
- Relationship over transaction
- Evidence-based: Back up reframes with case studies
- Tone: Peer-to-peer confidence, not desperate

**Approval Required:** YES - For response back to prospect

---

### Agent 09: Meeting Scheduler
**File:** `engage/09-meeting-scheduler.js`

**Purpose:** Handles meeting logistics when prospect agrees to meet.

**Inputs:**
- Meeting requests routed from Agent 07
- Contact and lead details
- ICP profile and company context

**Processing:**
1. Determines meeting type:
   - Discovery call (30 min)
   - Technical deep-dive (45 min)
   - Business case discussion (30 min)
   - Executive briefing (30 min)

2. Meeting logistics:
   - Detects prospect timezone
   - Proposes 3 time slots in prospect's timezone
   - Specifies Zoom link and meeting ID
   - Drafts confirmation message

3. Prepares comprehensive pre-meeting brief including:
   - Prospect summary (who they are, why they're talking to us)
   - Key stakeholders attending
   - Their objectives for the meeting
   - Their context: pain points, growth signals, current situation
   - Our key messages to emphasize
   - ROI/business case talking points
   - Competitive positioning if relevant
   - Potential objections to prepare for
   - Next-step options (POC, follow-up, proposal)

4. Follow-up sequence:
   - Send thank you + notes within 2 hours
   - Day 3: Send proposal/POC plan
   - Day 7: Check-in if no response

**Outputs:**
- Creates meeting record in `meetings` table
- Stores proposed times, zoom link, confirmation message
- Stores comprehensive pre-meeting brief for CEO/sales team
- Creates approval record for sending confirmation
- Returns: meeting_id, meeting type, proposed times, timezone handling

**System Prompt Highlights:**
- Professional executive assistant with sales knowledge
- Timezone accuracy is critical
- Meeting structure and clear objectives
- Preparation enables maximum impact
- Follow-up logistics are built-in

**Approval Required:** YES - CEO approves before confirmation sent

---

## Data Model Integration

### Database Tables Referenced

**leads**
- id, company_name, domain, industry
- employee_count_estimate, revenue_estimate_usd
- match_score, growth_signals[], pain_points[]
- technology_stack[], competitive_landscape
- status (pending_approval, approved, active, rejected, watch_list)
- icp_profile_id, sourcing_reasoning
- source_agent, created_at

**contacts**
- id, lead_id, full_name, title, function
- seniority_level (director_level, vp_level, c_level)
- persona_type (champion, economic_buyer, technical_evaluator, blocker, user)
- email, linkedin_url, confidence_score
- hiring_authority, budget_authority
- notes, engagement_strategy
- status (discovered, active), source_agent

**icp_profiles**
- id, lead_id, company_name, domain
- profile_json (comprehensive profile data)
- company_summary, pain_points_detailed, growth_signals_detailed
- technology_stack_detailed, competitive_analysis
- personalization_hooks, recommended_approach
- urgency_score, urgency_reasoning
- sales_cycle_prediction, profiled_at

**outreach**
- id, contact_id, lead_id, company_name
- contact_name, contact_email, contact_title
- channel (linkedin, email), sequence_type
- messages_json[] (all messages in sequence)
- status (draft, ready_for_send, needs_revision, sent, engaged)
- quality_score, quality_feedback
- total_messages, notes
- source_agent, reviewed_by_agent, created_at

**responses**
- id, contact_id, lead_id, response_text, response_date, channel
- classification, sentiment, confidence_score
- buying_signals[], urgency
- recommended_action, draft_response
- status (received, processed, handled, meeting_scheduled)
- classification_details, routed_to_agent
- handled_by_agent, handled_at

**meetings**
- id, response_id, contact_id, lead_id
- company_name, contact_name, contact_email
- meeting_type, prospect_timezone
- proposed_times[], meeting_details{}
- confirmation_message
- pre_meeting_brief (comprehensive JSON)
- follow_up_sequence
- status (scheduled_pending_approval, confirmed, completed)
- created_by_agent

**approvals**
- id, agent_id, agent_name, action_type
- resource_id, resource_type
- summary, details{}
- status (pending, approved, rejected)
- created_by, approval_deadline
- approved_by, approved_at, rejection_reason

---

## API Contract (run function)

All agents export: `{ AGENT_ID, AGENT_NAME, run }`

### run(context = {}) returns:

```javascript
{
  success: boolean,
  [agent-specific-fields]: {...},
  error?: string (if success: false)
}
```

### Execution Pattern
1. Check database for work items
2. Gather inputs and context
3. Call Gemini with detailed system prompt + user prompt
4. Parse and validate JSON response
5. Store results in appropriate database tables
6. Create approval records if needed
7. Return results with summary

### Error Handling
- Try/catch wrapping all operations
- Log all errors with context
- Return gracefully (success: false with error message)
- Partial success is acceptable (continue with remaining items)

---

## Production Deployment Checklist

### Before going live:

- [ ] Database schema created (leads, contacts, icp_profiles, outreach, responses, meetings, approvals)
- [ ] Gemini API keys configured in environment
- [ ] Supabase credentials configured
- [ ] Logger integration tested
- [ ] Approval workflow process defined
- [ ] CEO/admin review process established
- [ ] Unsubscribe/DNC compliance setup
- [ ] Email deliverability setup (DKIM, SPF, DMARC)
- [ ] Zoom/calendar integration configured
- [ ] Monitoring and alerts in place

---

## Key Design Principles

1. **Approval-Driven**: All customer-facing actions require human approval
2. **Data-First**: Every decision backed by verified data and signals
3. **Personalization-Obsessed**: Generic templates never pass QA
4. **Conversational**: All messages sound like real people, not sales machines
5. **Value-First**: Always lead with insight, not pitch
6. **Relationship-Focused**: Respect prospect needs, willing to walk away
7. **Specificity**: Generic observations rejected; verifiable details required
8. **Ethical**: Comply with GDPR, CAN-SPAM, LinkedIn guidelines, DNC requests

---

## Execution Workflow

Recommended execution order for maximum efficiency:

1. **Morning batch:** Agent 01 (Prospect Scout) - scan for new qualified leads
2. **Morning batch:** Agent 02 (Decision Maker Finder) - identify contacts at approved leads
3. **Morning batch:** Agent 03 (ICP Profiler) - deep-profile all contacts
4. **Midday:** Agent 04 (LinkedIn Outreach) + Agent 05 (Email Sequence Writer) - create sequences in parallel
5. **Midday:** Agent 06 (Message Crafter) - QA all outreach before approval
6. **Real-time:** Agent 07 (Response Handler) - process incoming responses
7. **Real-time:** Agent 08 (Objection Handler) - handle objections
8. **Real-time:** Agent 09 (Meeting Scheduler) - schedule meetings when requested

---

## Notes for CEO/Sales Leadership

These agents are designed to:
- **Scale outreach** without losing personalization
- **Maintain quality** through approval gates
- **Accelerate sales cycles** with data-driven approach
- **Preserve relationships** through empathetic communication
- **Enable your team** with prepared briefs and strategic context

Every message, sequence, and decision is transparent and approvable before execution.

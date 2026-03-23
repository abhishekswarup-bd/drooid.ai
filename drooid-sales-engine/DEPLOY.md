# Drooid Sales Engine — Deployment Guide

## 1. Deploy to Railway (5 minutes)

### Step 1: Sign in to Railway
Go to [railway.com](https://railway.com) → Sign in with GitHub

### Step 2: Create New Project
- Click **"New Project"** → **"Deploy from GitHub Repo"**
- Select the `drooid.ai` repo → set Root Directory to `drooid-sales-engine`
- Railway will auto-detect the Dockerfile

### Step 3: Set Environment Variables
In Railway dashboard → your service → **Variables** tab, add these:

```
GEMINI_API_KEY=<your-gemini-api-key>
GEMINI_API_KEY_FALLBACK=<your-gemini-fallback-key>
GEMINI_MODEL=gemini-2.5-flash
SUPABASE_URL=<your-supabase-url>
SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_SERVICE_KEY=<your-supabase-service-key>
SENDGRID_API_KEY=<your-sendgrid-key>
SENDGRID_FROM_EMAIL=outreach@drooid.org
HUNTER_API_KEY=<your-hunter-key>
APPROVAL_MODE=manual
DAILY_OUTREACH_LIMIT=25
DAILY_EMAIL_LIMIT=100
LOG_LEVEL=info
NODE_ENV=production
PORT=3000
TWILIO_ACCOUNT_SID=<from step 2 below>
TWILIO_AUTH_TOKEN=<from step 2 below>
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
CEO_WHATSAPP_NUMBER=whatsapp:+<your number>
```

### Step 4: Generate Domain
Settings → **Networking** → **Generate Domain**
This gives you a URL like `drooid-sales-engine-production.up.railway.app`

### Step 5: Verify
Visit `https://your-railway-url.up.railway.app/health`
You should see `{"status":"healthy",...}`

---

## 2. Set Up WhatsApp via Twilio (10 minutes)

### Step 1: Create Twilio Account
Go to [twilio.com/try-twilio](https://www.twilio.com/try-twilio)
- Sign up (free, no credit card needed)
- Verify your phone number

### Step 2: Get Your Credentials
After signup, go to [console.twilio.com](https://console.twilio.com)
- Copy your **Account SID** and **Auth Token** from the dashboard
- Add them to Railway environment variables

### Step 3: Activate WhatsApp Sandbox
Go to: [console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn](https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn)
- You'll see a sandbox number: `+1 (415) 523-8886`
- Send the join code (e.g., "join <word>-<word>") from your WhatsApp to that number

### Step 4: Configure Webhook
In the Twilio WhatsApp Sandbox settings:
- Set **"When a message comes in"** to:
  `https://your-railway-url.up.railway.app/whatsapp/webhook`
- Method: **POST**
- Click Save

### Step 5: Test It!
Send a WhatsApp message to the Twilio sandbox number:
- `help` — see all commands
- `agents` — list your 30 agents
- `status` — system overview
- `@BDR what leads do you have?` — talk to the BDR agent
- `leads` — see recent leads
- `run Scout` — trigger the Prospect Scout now

---

## WhatsApp Commands Reference

| Command | What it does |
|---------|-------------|
| `help` | Show all available commands |
| `agents` | List all 30 agents with status |
| `status` | System health overview |
| `leads` | Show recent leads |
| `pipeline` | Pipeline stage summary |
| `approvals` | Show pending approvals |
| `approve <id>` | Approve a pending item |
| `reject <id>` | Reject a pending item |
| `@AgentName <msg>` | Chat with a specific agent |
| `run <agent>` | Trigger an agent immediately |
| `pause` | Pause all scheduled agents |
| `resume` | Resume all agents |

Agent aliases work too: `@BDR`, `@Scout`, `@LinkedIn`, `@Email`, `@Demo`, `@Proposal`, `@ROI`, `@Competitor`, `@Social`, `@Dashboard`, etc.

---

## Architecture

```
WhatsApp → Twilio → Railway (webhook) → Gemini 2.5 Flash → WhatsApp response
                                      → Supabase (data queries)
                                      → Agent execution (on-demand)
```

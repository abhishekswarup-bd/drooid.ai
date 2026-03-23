# Drooid CEO Command Center Dashboard

A fully-featured real-time analytics dashboard for Drooid's AI sales engine, displaying live metrics from 29 agents across 7 departments.

## Features

### Core Dashboard
- **Dark Theme UI** with Drooid brand colors (teal/indigo accents)
- **Real-time Data Refresh** every 30 seconds from Supabase
- **Responsive Design** optimized for desktop and mobile
- **Live Status Indicator** showing active data connections

### KPI Cards
- **Total Leads**: Count of all leads in database
- **Active Pipeline**: Leads in qualified, engaged, or proposal stages
- **Outreach Sent Today**: Messages/outreach executed today
- **Agent Actions Today**: Total tasks executed by all agents

### Sales Pipeline Funnel
Visual representation of lead progression through stages:
- New Leads
- Qualified
- Engaged
- Proposal
- Closed Won

### Agent Activity Feed
- Real-time log of agent activities
- Displays: Agent name, action, status, timestamp
- Status badges: SUCCESS, ERROR, PENDING
- Auto-scrolling with last 20 activities

### Pending Approvals Queue
- Approval count badge
- List of pending decisions requiring CEO action
- Inline Approve/Reject buttons
- Action type and description
- Timestamps

### Department Performance Grid
Performance metrics for all 7 departments:
- **Discover**: Market Scanner, ICP Researcher, Tech Stack Analyst
- **Engage**: BDR, Prospect Researcher, Sales Writer, Objection Handler, Follow-up, Multi-channel
- **Convert**: Demo Scheduler, Proposal Generator, ROI Calculator, Negotiation Analyst, Contract Prep, Competitor Intel, Win/Loss Analyst, Customer Success
- **Create**: Thought Leadership, Case Study Writer, Social Media, Website Publisher, Events & Community
- **Innovate**: Product Feedback, Market Trends, Brand & Comms
- **Partner**: Strategic Partnerships
- **Manage**: CEO Dashboard, Performance Optimizer, Compliance Monitor

## Setup

### Environment Variables
Create a `.env` file in the project root:
```
SUPABASE_URL=https://rrtgynwurrdyhxudbesv.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
DASHBOARD_PORT=3001
NODE_ENV=production
```

### Installation
```bash
npm install
```

### Running the Server
```bash
node dashboard/server.js
```

The dashboard will be available at: `http://localhost:3001`

## API Endpoints

### GET /
Returns the main dashboard HTML page with embedded Supabase client.

### GET /health
Health check endpoint returning server status and uptime.

### GET /api/metrics
Returns current KPI metrics:
- `totalLeads`: Total count of leads
- `activePipeline`: Count of active pipeline deals
- `outreachSent`: Outreach sent today
- `agentActions`: Agent tasks executed today

### GET /api/agents
Returns agent performance data grouped by name and department.

### GET /api/pending-approvals
Returns count of pending approvals awaiting decision.

### POST /api/approvals/:id/approve
Approve a pending approval action.

**Request**:
```json
{}
```

**Response**:
```json
{
  "success": true,
  "message": "Approval processed",
  "data": { ... }
}
```

### POST /api/approvals/:id/reject
Reject a pending approval action.

**Request**:
```json
{}
```

**Response**:
```json
{
  "success": true,
  "message": "Approval rejected",
  "data": { ... }
}
```

## Architecture

### Frontend
- Single-file HTML application loaded from server
- Uses Supabase JS client (CDN loaded) for real-time data queries
- Auto-refreshes every 30 seconds
- Responsive CSS Grid layout
- No external dependencies except Supabase

### Backend
- Express.js server on port 3001
- Rate limiting on approval endpoints
- Security middleware (Helmet)
- Service role authentication for write operations
- RESTful API design

### Database Integration
Connects to Supabase tables:
- `leads` - Lead information and scoring
- `pipeline` - Deal pipeline stages and values
- `outreach` - Sent messages and engagement
- `agent_logs` - Agent execution logs
- `agent_metrics` - Performance metrics by agent
- `approvals` - Pending approval queue

## Customization

### Changing Refresh Interval
Edit line in `index.html`:
```javascript
refreshInterval = setInterval(refreshDashboard, 30000); // 30 seconds
```

### Modifying Color Scheme
Update CSS variables in `index.html`:
```css
:root {
    --bg-dark: #0f172a;
    --accent-teal: #14b8a6;
    --accent-indigo: #6366f1;
    /* ... */
}
```

### Adding New KPI Cards
Add a new card to the KPI section HTML and corresponding `loadKPIs()` function logic.

### Updating Department List
Modify the `departments` object in JavaScript section to reflect current org structure.

## Security

- Service role key required for approval write operations
- Rate limiting: 100 requests/15min general, 20 approvals/60sec
- Input validation on approval IDs
- CORS headers handled by Helmet
- Environment variables protect sensitive credentials

## Troubleshooting

### Dashboard not loading data
- Check Supabase credentials in `.env`
- Verify network connectivity to Supabase
- Check browser console for CORS errors

### Approvals not working
- Ensure `SUPABASE_SERVICE_ROLE_KEY` is set
- Verify approval record exists and status is "pending"
- Check that user has permission to update approvals table

### High CPU/Memory usage
- Increase refresh interval if too frequent
- Limit activity feed display count
- Implement pagination for large datasets

## Performance

- Lightweight CSS Grid layout
- Optimized Supabase queries
- Parallel data loading with Promise.all()
- Debounced refresh to prevent request floods
- Minimal external dependencies

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

Proprietary - Drooid Sales Engine

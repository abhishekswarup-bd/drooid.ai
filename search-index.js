/* Drooid Site-Wide Search Index
   All searchable content across pages and blog posts.
   Blog entries are appended automatically by the blog builder task.
*/
const DROOID_SEARCH_INDEX = [
  /* ── MAIN PAGES ── */
  {
    id: "home",
    title: "Home — AI-Powered Development Studio",
    url: "index.html",
    section: "Page",
    tags: ["AI development", "proof of concept", "POC", "AI studio", "agentic AI"],
    content: "AI-powered development studio. Build end-to-end with artificial intelligence. We embed with companies to prove AI works — fast, lean POCs that show real ROI before you scale. No tiger teams. No $500K consulting engagements. AI websites in a day. Mobile apps in a day. Legacy modernization. Agentic AI agents."
  },
  {
    id: "services",
    title: "Services — 9 AI-Powered Development Services",
    url: "services.html",
    section: "Services",
    tags: ["AI websites", "mobile apps", "enterprise apps", "legacy modernization", "cloud migration", "AI agents", "UI UX", "social media", "AI testing"],
    content: "AI Websites in a Day. Mobile Apps in a Day. Enterprise Web Applications. Screen Designs and UI/UX. Social Media and Content Generation. Agentic AI Agents. Legacy Modernization. Cloud Migration. AI Testing and QA. Full websites generated from a brief — layout, copy, imagery, responsive design. Native iOS and Android apps built by AI in 24 hours. COBOL RPG VB6 Fortran to modern languages with 99.5% business logic preservation."
  },
  {
    id: "industries",
    title: "Industries — AI Solutions for 10 Industries",
    url: "industries.html",
    section: "Industries",
    tags: ["capital markets", "healthcare", "legal", "sales", "banking", "fintech", "ecommerce", "manufacturing", "staffing", "HR", "transportation", "logistics"],
    content: "Capital Markets AI Copilot portfolio analytics sentiment signals ETF X-Ray Earnings Edge. Sales Command Center AI-native pipeline 3x velocity. Healthcare clinical AI patient triage medical coding HIPAA. Banking Fintech fraud detection KYC AML credit scoring. E-Commerce recommendations inventory dynamic pricing. Manufacturing logistics predictive maintenance. Staffing Agency candidate matching bench management. Human Resources recruiting onboarding attrition. Legal contract review 80% faster research drafting. Transportation routing demand forecasting."
  },
  {
    id: "solutions",
    title: "Solutions — Enterprise AI Transformation",
    url: "solutions.html",
    section: "Solutions",
    tags: ["legacy modernization", "cloud migration", "automation", "capital markets", "data analytics", "compliance", "COBOL", "mainframe"],
    content: "Capital Markets Lift and Shift trading platforms risk engines settlement systems. Legacy Code Modernization COBOL RPG VB6 Fortran PL/SQL to Java Python C# PostgreSQL 99.5% logic preservation 60-90% cost reduction. Cloud Migration on-prem to AWS Azure GCP containerization serverless Terraform. Intelligent Automation RPA document processing workflow. Data Analytics Modernization Snowflake BigQuery Tableau. Compliance Governance AML KYC regulatory reporting."
  },
  {
    id: "contact",
    title: "Contact — Get Started with an AI Proof-of-Concept",
    url: "contact.html",
    section: "Contact",
    tags: ["contact", "get started", "discovery call", "POC", "quote"],
    content: "Get in touch with Drooid to start your AI proof-of-concept. Book a discovery call or send a message. We respond within 24 hours. Contact email contact@drooid.org. Schedule a call. Start your AI project today."
  },
  {
    id: "blog",
    title: "Blog — AI Development Insights",
    url: "blog.html",
    section: "Blog",
    tags: ["blog", "articles", "insights", "AI", "case studies", "legacy modernization"],
    content: "Drooid blog covering AI development, proof-of-concept strategies, legacy modernization, case studies for ETF Junction TestMagicks CoachingPro Dental Pro, and thought leadership on AI-powered software development."
  },

  /* ── CLIENT SPOTLIGHTS ── */
  {
    id: "etfjunction",
    title: "ETF Junction — AI Capital Markets Intelligence Platform",
    url: "index.html#client",
    section: "Client",
    tags: ["ETF Junction", "capital markets", "fintech", "AI Copilot", "ETF X-Ray", "Earnings Edge"],
    content: "Drooid built the entire ETF Junction capital markets intelligence platform — AI Copilot, ETF X-Ray, Earnings Edge. 5 AI analysis engines, real-time portfolio intelligence. Delivered in weeks not months with institutional-grade quality."
  },
  {
    id: "testmagicks",
    title: "TestMagicks — Zero-Backend AI Content Production Agent",
    url: "index.html#client",
    section: "Client",
    tags: ["TestMagicks", "EdTech", "AI agent", "exam prep", "zero-backend", "LLM"],
    content: "Drooid delivered a fully browser-based AI agent for TestMagicks content production team. 60KB zero-backend app, 4 LLM providers, live .docx and .pptx output. Login, chat, scheduling — all in a single file."
  },
  {
    id: "coachingpro",
    title: "CoachingPro.ai — AI Options Trading Platform",
    url: "index.html#client",
    section: "Client",
    tags: ["CoachingPro", "fintech", "options trading", "Flutter", "mobile app", "iOS", "Android"],
    content: "Full-stack AI options trading platform. Website, Flutter mobile app, iOS, Android, and interactive flipbook. 11 app screens, 172 learning modules, real-time market data, live coaching. Live on App Stores."
  },
  {
    id: "dentalpro",
    title: "Dental Pro — AI Dental Patient Education SaaS",
    url: "index.html#client",
    section: "Client",
    tags: ["Dental Pro", "healthtech", "dental", "patient education", "multilingual", "Claude AI", "SaaS"],
    content: "Zero-backend single-file SaaS app for dental patient education. 50 conditions, 8 categories, Claude AI explanations, 20+ auto-detected languages, freemium model. 847+ dental practices, 35% case acceptance improvement. Replaces $400/yr static apps."
  },

  /* ── BLOG POSTS (added by blog builder task) ── */
  {
    id: "blog-etfjunction",
    title: "How We Built an AI Capital Markets Intelligence Platform for ETF Junction in Weeks, Not Months",
    url: "blog/etfjunction-case-study.html",
    section: "Blog · Case Study",
    tags: ["ETF Junction", "capital markets", "case study", "AI platform", "fintech"],
    content: "AI capital markets platform ETF Junction case study. AI Copilot ETF X-Ray Earnings Edge. 5 analysis engines institutional-grade quality delivered in weeks not months. POC-first approach proof of concept."
  },
  {
    id: "blog-testmagicks",
    title: "Building TestMagicks: A Zero-Backend AI Content Production Agent for Exam Prep Teams",
    url: "blog/testmagicks-case-study.html",
    section: "Blog · Case Study",
    tags: ["TestMagicks", "AI agent", "EdTech", "zero-backend", "content production"],
    content: "TestMagicks case study zero-backend AI content production agent EdTech. 60KB app 4 LLM providers live docx pptx output browser-based single file."
  },
  {
    id: "blog-coachingpro",
    title: "How Drooid Built CoachingPro — A Full-Stack AI Options Trading Platform With Flutter Mobile App",
    url: "blog/coachingpro-case-study.html",
    section: "Blog · Case Study",
    tags: ["CoachingPro", "options trading", "Flutter", "mobile", "fintech", "case study"],
    content: "CoachingPro AI options trading platform case study. Flutter mobile app iOS Android interactive flipbook. 11 screens 172 learning modules real-time market data live coaching."
  },
  {
    id: "blog-dentalpro",
    title: "Dental Pro: Replacing $400/Year Static Apps With an AI-Powered, Multilingual Patient Education SaaS",
    url: "blog/dentalpro-case-study.html",
    section: "Blog · Case Study",
    tags: ["Dental Pro", "dental", "AI SaaS", "patient education", "multilingual", "healthtech"],
    content: "Dental Pro case study AI dental patient education SaaS. 50 conditions 20 languages Claude AI 847 practices 35% case acceptance. Replaces DDS GP Dental Pal."
  },
  {
    id: "blog-poc-first",
    title: "Why Proof-of-Concept First Is the Only Responsible Way to Adopt AI",
    url: "blog/poc-first-approach.html",
    section: "Blog · AI Development",
    tags: ["proof of concept", "POC", "AI adoption", "ROI", "AI strategy"],
    content: "Why AI proof of concept first is the only responsible approach. Most AI projects fail by skipping validation spending $500K before proving it works. POC-first reduces risk shows ROI fast gets stakeholder buy-in."
  },
  {
    id: "blog-poc-2weeks",
    title: "How to Build an AI POC in 2 Weeks — The Drooid Playbook",
    url: "blog/ai-poc-in-2-weeks.html",
    section: "Blog · AI Development",
    tags: ["AI POC", "proof of concept", "2 weeks", "playbook", "embed prove measure scale"],
    content: "How to build AI POC in 2 weeks. 4-step process Embed Prove Measure Scale. Focus on one use case AI to build AI measure ROI no lock-in."
  },
  {
    id: "blog-ai-websites",
    title: "AI Websites in a Day: What's Realistic, What's Not, and How We Do It",
    url: "blog/ai-websites-in-a-day.html",
    section: "Blog · AI Development",
    tags: ["AI website", "website in a day", "AI website builder", "24 hours"],
    content: "AI websites in a day what is realistic. What AI can generate in 24 hours layout copy responsive design SEO. What still needs human judgment. The Drooid workflow."
  },
  {
    id: "blog-agentic-ai",
    title: "Agentic AI vs. Traditional Automation — What's the Difference and When to Use Each",
    url: "blog/agentic-ai-vs-automation.html",
    section: "Blog · AI Development",
    tags: ["agentic AI", "automation", "RPA", "AI agents", "workflow"],
    content: "Agentic AI vs traditional automation RPA difference. When to use agentic AI multi-step reasoning tool use decision-making vs RPA limitations."
  },
  {
    id: "blog-cobol-java",
    title: "COBOL to Java in 2026: How AI Finally Makes It Fast and Safe",
    url: "blog/cobol-to-java-2026.html",
    section: "Blog · Legacy Modernization",
    tags: ["COBOL", "Java", "legacy modernization", "migration", "mainframe"],
    content: "COBOL to Java migration 2026. AI legacy modernization 60-90% cost reduction 99.5% business logic preservation 5-10x faster. Packed decimals EBCDIC DB2 IMS."
  },
  {
    id: "blog-legacy-failures",
    title: "Why 70% of Legacy Modernization Projects Fail — and How AI Changes the Equation",
    url: "blog/legacy-modernization-failures.html",
    section: "Blog · Legacy Modernization",
    tags: ["legacy modernization", "failure", "AI migration", "COBOL", "mainframe"],
    content: "Why 70% legacy modernization projects fail. Scope creep knowledge loss testing gaps. How AI addresses each failure mode and changes the equation."
  },
  {
    id: "blog-cobol-cost",
    title: "The Real Cost of Keeping Your COBOL System Alive in 2026",
    url: "blog/cost-of-cobol-2026.html",
    section: "Blog · Legacy Modernization",
    tags: ["COBOL", "cost", "mainframe", "legacy", "modernization ROI"],
    content: "Real cost of keeping COBOL system alive 2026. Aging developer workforce maintenance vs modernization hidden costs security debt integration friction hiring difficulty."
  },
  {
    id: "blog-capital-markets",
    title: "AI in Capital Markets: 5 Use Cases You Can Prove With a POC in Under 30 Days",
    url: "blog/ai-capital-markets-poc.html",
    section: "Blog · Capital Markets",
    tags: ["capital markets", "AI", "POC", "trading", "portfolio analytics", "ETF"],
    content: "AI in capital markets 5 use cases POC in 30 days. Portfolio analytics sentiment signals ETF analysis earnings intelligence trade surveillance expected ROI."
  },
  {
    id: "blog-dental-education",
    title: "How AI Is Transforming Dental Patient Education — and What Practices Are Missing",
    url: "blog/ai-dental-patient-education.html",
    section: "Blog · Healthcare",
    tags: ["dental", "AI", "patient education", "case acceptance", "multilingual", "healthcare"],
    content: "AI transforming dental patient education case acceptance. Current tools expensive static. AI personalized explanations multilingual capabilities. What practices are missing."
  },
  {
    id: "blog-staffing",
    title: "AI for Staffing Agencies: Matching, Bench Management, and Rate Prediction",
    url: "blog/ai-staffing-agencies.html",
    section: "Blog · Staffing",
    tags: ["staffing", "AI", "candidate matching", "bench management", "rate prediction"],
    content: "AI for staffing agencies matching bench management rate prediction. Candidate matching automation rate optimization demand forecasting compliance tracking."
  },
  {
    id: "blog-legal",
    title: "Why Legal Firms Are the Last to Adopt AI — and the First to Benefit",
    url: "blog/ai-legal-firms.html",
    section: "Blog · Legal",
    tags: ["legal", "AI", "contract review", "legal research", "law firm"],
    content: "Why legal firms last to adopt AI first to benefit. Contract review 80% faster legal research document drafting litigation support risk mitigation."
  },
  {
    id: "blog-tiger-team",
    title: "The Tiger Team Trap: Why Big Consulting AI Projects Fail and Small Embedded Teams Win",
    url: "blog/tiger-team-trap.html",
    section: "Blog · Thought Leadership",
    tags: ["tiger team", "consulting", "embedded team", "AI consulting", "Drooid model"],
    content: "Tiger team trap why big consulting AI projects fail. Small embedded teams win. No context no accountability no knowledge transfer. Why embedded teams succeed the Drooid model."
  },
  {
    id: "blog-fractional-ai",
    title: "Your AI Team, Before You Need One — What Fractional AI Development Actually Means",
    url: "blog/fractional-ai-partner.html",
    section: "Blog · Thought Leadership",
    tags: ["fractional AI", "AI team", "AI partner", "embedded", "AI consulting"],
    content: "What fractional AI development means. Fractional AI partner vs hiring vs big consulting cost comparison. When it makes sense embedded work POC delivery knowledge transfer."
  },
  {
    id: "blog-ai-to-build-ai",
    title: "We Use AI to Build AI — What That Actually Looks Like in Practice",
    url: "blog/we-use-ai-to-build-ai.html",
    section: "Blog · Thought Leadership",
    tags: ["AI-powered development", "build with AI", "Drooid process", "AI tools", "AI engineering"],
    content: "We use AI to build AI what it looks like. Drooid process which AI tools are used how AI writes code designs UI generates copy human oversight speed quality outcomes."
  }
];

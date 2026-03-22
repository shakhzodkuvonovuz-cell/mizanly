import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Legal')
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller()
export class LegalController {
  @Get('privacy-policy')
  @ApiOperation({ summary: 'Privacy Policy' })
  @Header('Content-Type', 'application/json')
  getPrivacyPolicy() {
    return {
      title: 'Mizanly Privacy Policy',
      lastUpdated: '2026-03-22',
      version: '1.1',
      sections: [
        {
          heading: 'Information We Collect',
          content: `We collect information you provide directly to us, including:
• Account information: name, email, phone number, username, profile photo, date of birth
• Content you create: posts, stories, threads, reels, videos, messages, comments
• Usage data: interactions, viewing history, search queries, preferences
• Device information: device type, operating system, app version, push tokens
• Location data: only when you explicitly grant permission (for prayer times, mosque finder, local content)
• Islamic preferences: calculation method, madhab, content filter settings
• Religious data (special category — see "Special Category Data" section below)`,
        },
        {
          heading: 'Legal Basis for Processing (GDPR Article 6)',
          content: `We process your personal data on the following legal bases:
• Contract performance (Art 6(1)(b)): account creation, messaging, content hosting, payments
• Consent (Art 6(1)(a)): personalized recommendations, marketing communications, analytics tracking, AI-powered features
• Legitimate interest (Art 6(1)(f)): security, fraud prevention, service improvement, abuse detection
• Legal obligation (Art 6(1)(c)): responding to law enforcement requests, tax obligations, content moderation obligations
You may withdraw consent at any time via Settings > Privacy > Consent Management.`,
        },
        {
          heading: 'Special Category Data (GDPR Article 9)',
          content: `Mizanly processes special category data related to religious beliefs, including:
• Islamic school of thought (madhab)
• Prayer time preferences and calculation methods
• Quran reading plans and progress
• Fasting logs and dhikr sessions
• Zakat calculations
• Mosque attendance and membership
• Halal restaurant preferences
This data is processed based on your explicit consent (Art 9(2)(a)), provided when you opt into each Islamic feature. You may withdraw consent for individual features at any time via Settings > Islamic > Data Consent.`,
        },
        {
          heading: 'How We Use Your Information',
          content: `We use collected information to:
• Provide, maintain, and improve our services
• Personalize your feed and content recommendations (automated decision-making — see below)
• Send prayer time notifications and Islamic reminders
• Process transactions (donations, marketplace purchases, tips)
• Detect and prevent spam, abuse, and policy violations using AI-assisted content moderation
• Communicate with you about service updates and new features
• Generate analytics to improve user experience`,
        },
        {
          heading: 'Automated Decision-Making (GDPR Article 22)',
          content: `We use automated decision-making in the following areas:
• Feed personalization: an algorithm ranks content based on your interactions, follows, and preferences. You can switch to chronological feed at any time.
• Content moderation: AI (Anthropic Claude) analyzes text and images for policy violations. Flagged content is queued for human review before removal.
• Spam detection: automated filters flag potential spam content for review.
You have the right to request human review of any automated decision that significantly affects you. Contact privacy@mizanly.app.`,
        },
        {
          heading: 'Data Sharing and Sub-Processors',
          content: `We do NOT sell your personal data to third parties. We share data with the following sub-processors:
• Railway (US) — application hosting
• Neon (US) — database hosting (PostgreSQL)
• Cloudflare R2/Stream (US/Global) — media storage and video hosting
• Clerk (US) — authentication and user management
• Stripe (US) — payment processing
• Anthropic Claude (US) — AI content moderation and translation
• Meilisearch — full-text search indexing
• Aladhan API — prayer time calculations
• Quran.com API — Quran text and recitation
• OpenStreetMap Overpass — mosque location data
• Upstash (US) — Redis caching and job queues
Each sub-processor is bound by a Data Processing Agreement (DPA). We also share data when required by law, court order, or governmental authority, or to protect users from harm.`,
        },
        {
          heading: 'International Data Transfers (GDPR Chapter V)',
          content: `Your data is transferred to and processed in the United States and other countries where our sub-processors operate. These transfers are protected by:
• Standard Contractual Clauses (SCCs) with each US-based sub-processor
• The sub-processors' own privacy frameworks and certifications
• Transfer Impact Assessments conducted for each sub-processor
For EU/EEA users, you may request information about specific transfer safeguards by contacting privacy@mizanly.app.`,
        },
        {
          heading: 'Data Retention',
          content: `• Active account data: retained as long as your account is active
• Deleted content: removed from public view immediately; purged from backups within 30 days
• Account deletion: all personal data anonymized or deleted within 30 days of request
• Stories: automatically expire and are removed after 24 hours
• Watch history: automatically rotated every 90 days
• Screen time logs: retained for 30 days, then purged
• Anonymous analytics: retained indefinitely in aggregate form
• Messages in conversations: retained per conversation disappearing message settings
• Moderation logs: retained for 2 years for legal compliance, then purged`,
        },
        {
          heading: 'Your Rights',
          content: `You have the right to:
• Access (Art 15): request a copy of all your personal data
• Correction (Art 16): update inaccurate information
• Deletion (Art 17): delete your account and all associated data
• Export/Portability (Art 20): download your data in a portable JSON format
• Restrict (Art 18): limit how we process your data
• Object (Art 21): opt out of personalized recommendations
• Withdraw Consent (Art 7): withdraw consent for any consent-based processing
• Lodge a Complaint: with the relevant supervisory authority (see below)
To exercise these rights, use Settings > Account > Manage Data or contact privacy@mizanly.app. We will respond within 30 days.`,
        },
        {
          heading: 'Security',
          content: `We implement industry-standard security measures including:
• End-to-end encryption for direct messages (optional)
• TLS encryption for all data in transit
• Encrypted storage for sensitive data at rest
• Rate limiting and abuse prevention on all API endpoints
• Regular security audits and monitoring
• Scrypt-hashed PINs for parental controls
• Age verification at registration`,
        },
        {
          heading: 'Children and Age Verification',
          content: `Mizanly requires all users to be at least 13 years old (COPPA compliance). Age is verified at registration via date of birth. Users aged 13-17 are automatically marked as minor accounts with protective defaults:
• Direct messages restricted to followers only
• Live streaming disabled by default
• Content discovery limited to age-appropriate material
Parents may link their account to manage additional controls via Settings > Parental Controls. If you believe a child under 13 is using our service, contact us immediately at safety@mizanly.app.`,
        },
        {
          heading: 'California Residents (CCPA)',
          content: `California residents have additional rights under the California Consumer Privacy Act:
• Right to know what personal information is collected, used, and shared
• Right to delete personal information
• Right to opt-out of the sale of personal information — Mizanly does NOT sell personal information
• Right to non-discrimination for exercising privacy rights
To exercise these rights, contact privacy@mizanly.app or use Settings > Account > Manage Data.`,
        },
        {
          heading: 'Supervisory Authority',
          content: `If you are unsatisfied with our handling of your data, you have the right to lodge a complaint with:
• Australia: Office of the Australian Information Commissioner (OAIC) — oaic.gov.au
• EU: Your local Data Protection Authority (DPA)
• UK: Information Commissioner's Office (ICO) — ico.org.uk`,
        },
        {
          heading: 'Changes to This Policy',
          content: 'We may update this policy periodically. We will notify you of significant changes through the app or email. Continued use of Mizanly after changes constitutes acceptance of the updated policy. The version number and last-updated date at the top of this policy will change with each update.',
        },
        {
          heading: 'Contact & Data Protection Officer',
          content: `For privacy questions or concerns:
• Privacy inquiries: privacy@mizanly.app
• Data Protection Officer: dpo@mizanly.app
• Child safety: safety@mizanly.app
• Legal inquiries: legal@mizanly.app
• Postal: Mizanly Pty Ltd, Surry Hills, NSW 2010, Australia`,
        },
      ],
    };
  }

  @Get('terms-of-service')
  @ApiOperation({ summary: 'Terms of Service' })
  @Header('Content-Type', 'application/json')
  getTermsOfService() {
    return {
      title: 'Mizanly Terms of Service',
      lastUpdated: '2026-03-22',
      version: '1.1',
      sections: [
        {
          heading: 'Acceptance of Terms',
          content: 'By creating an account on Mizanly, you actively accept these Terms of Service and our Privacy Policy. Your acceptance is recorded with a timestamp. If you do not agree, do not use the service.',
        },
        {
          heading: 'Eligibility',
          content: `You must be at least 13 years old to use Mizanly. Age is verified at registration via date of birth. Users under 18 are subject to additional protective measures:
• DMs restricted to followers only by default
• Live streaming disabled by default
• Parental linking available for additional oversight
Users under 18 may require parental consent depending on jurisdiction (e.g., GDPR Article 8 requires parental consent for users under 16 in some EU member states).`,
        },
        {
          heading: 'User Responsibilities',
          content: `You agree to:
• Provide accurate account information, including your true date of birth
• Maintain the security of your account credentials
• Not impersonate others or misrepresent your identity
• Comply with all applicable laws and regulations
• Respect other users and engage in constructive dialogue
• Not use the platform for commercial spam or unauthorized advertising
• Report illegal content immediately, especially child sexual abuse material (CSAM)`,
        },
        {
          heading: 'Content Policy',
          content: `The following content is strictly prohibited:
• Child sexual abuse material (CSAM) — reported to NCMEC and law enforcement immediately
• Nudity, sexually explicit, or pornographic content
• Graphic violence, gore, or content promoting self-harm
• Terrorist content, extremist propaganda, or radicalization material — subject to 1-hour removal
• Hate speech, discrimination, or harassment
• Non-consensual intimate images (image-based abuse)
• Spam, scams, phishing, or misleading content
• Content that mocks, ridicules, or disrespects any religion
• Impersonation of scholars, institutions, or public figures
• Content illegal under applicable law
Violations may result in content removal, account suspension, or permanent ban. Repeat infringers will be permanently banned.`,
        },
        {
          heading: 'Copyright and DMCA',
          content: `Mizanly respects intellectual property rights and complies with the Digital Millennium Copyright Act (DMCA):
• You retain ownership of content you create and post on Mizanly
• By posting, you grant Mizanly a non-exclusive, worldwide license to display, distribute, and promote your content within the platform
• You must not post content that infringes on others' intellectual property rights
• To report copyright infringement, submit a DMCA takedown notice to: dmca@mizanly.app with: (1) identification of the copyrighted work, (2) URL of the infringing content, (3) your contact information, (4) a statement of good faith belief, (5) a statement of accuracy under penalty of perjury, (6) your electronic or physical signature
• Counter-notifications may be filed by the accused party within 10 business days
• Repeat infringer policy: accounts with 3 or more valid DMCA strikes will be permanently terminated
• Mizanly's designated DMCA agent: legal@mizanly.app`,
        },
        {
          heading: 'Monetization & Payments',
          content: `• All financial transactions are processed through Stripe
• Virtual currency (coins, diamonds) has no cash value outside the platform
• Creator earnings are subject to Stripe's terms and applicable tax laws
• Zakat calculations are provided as guidance only — consult a qualified scholar for religious rulings
• Charity donations are processed through verified payment processors`,
        },
        {
          heading: 'Marketplace and Consumer Protection',
          content: `The Mizanly marketplace connects buyers and sellers. When using the marketplace:
• Sellers must provide accurate product descriptions and pricing
• Buyers have a 14-day cooling-off period for online purchases (as required by Australian Consumer Law and EU Consumer Rights Directive)
• Disputes between buyers and sellers can be raised via the in-app dispute resolution system
• Mizanly acts as a platform facilitator, not a party to marketplace transactions
• Products must comply with all applicable consumer safety laws
• Australian Consumer Law guarantees apply to transactions involving Australian consumers
• Refunds and returns are managed between buyer and seller, with Mizanly arbitration available`,
        },
        {
          heading: 'Dispute Resolution',
          content: `If you disagree with a content moderation decision:
• You may appeal any moderation action within 30 days
• Appeals are reviewed by a different moderator than the one who made the original decision
• You will receive a response within 7 business days
• If you are unsatisfied with the appeal outcome, you may escalate to an independent dispute resolution body
• For EU users: you may refer disputes to an out-of-court dispute settlement body certified under the Digital Services Act (Article 21)
• For Australian users: disputes may be referred to the Australian Communications and Media Authority (ACMA)`,
        },
        {
          heading: 'Limitation of Liability',
          content: `Mizanly is provided "as is" without warranties of any kind. We are not liable for:
• Content posted by users
• Accuracy of prayer times, Qibla direction, or Islamic content (always verify with local authorities)
• Service interruptions, data loss, or security breaches beyond our reasonable control
Nothing in these terms excludes or limits any consumer guarantee under the Australian Consumer Law or any other applicable mandatory consumer protection legislation.`,
        },
        {
          heading: 'Account Termination',
          content: `• You may delete your account at any time through Settings > Account > Delete Account
• Account deletion requests are processed within 30 days (with a grace period for cancellation)
• We may suspend or terminate accounts that violate these terms
• Upon termination, your data will be handled per our Privacy Policy`,
        },
        {
          heading: 'Law Enforcement',
          content: `Mizanly cooperates with law enforcement agencies in accordance with applicable law:
• We will comply with valid warrants, subpoenas, and court orders
• We may preserve user data when legally required
• Government data requests are tracked and reported in our transparency reports
• Emergency disclosure: we may voluntarily disclose information when there is an imminent threat to life or serious physical injury
• Law enforcement requests should be directed to: lawenforcement@mizanly.app`,
        },
        {
          heading: 'Governing Law',
          content: 'These terms are governed by the laws of the Commonwealth of Australia and the State of New South Wales. Any disputes will be subject to the exclusive jurisdiction of the courts of New South Wales, Australia.',
        },
        {
          heading: 'Changes to Terms',
          content: 'We reserve the right to modify these terms. Material changes will be communicated through the app with at least 30 days notice. Continued use after the notice period constitutes acceptance. Users may be asked to re-accept updated terms.',
        },
        {
          heading: 'Contact',
          content: `For questions about these terms:
• General: legal@mizanly.app
• DMCA notices: dmca@mizanly.app
• Privacy: privacy@mizanly.app
• Child safety: safety@mizanly.app
• Law enforcement: lawenforcement@mizanly.app
• Postal: Mizanly Pty Ltd, Surry Hills, NSW 2010, Australia`,
        },
      ],
    };
  }
}

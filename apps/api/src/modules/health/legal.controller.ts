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
      lastUpdated: '2026-03-20',
      version: '1.0',
      sections: [
        {
          heading: 'Information We Collect',
          content: `We collect information you provide directly to us, including:
• Account information: name, email, phone number, username, profile photo
• Content you create: posts, stories, threads, reels, videos, messages, comments
• Usage data: interactions, viewing history, search queries, preferences
• Device information: device type, operating system, app version, push tokens
• Location data: only when you explicitly grant permission (for prayer times, mosque finder, local content)
• Islamic preferences: calculation method, madhab, content filter settings`,
        },
        {
          heading: 'How We Use Your Information',
          content: `We use collected information to:
• Provide, maintain, and improve our services
• Personalize your feed and content recommendations
• Send prayer time notifications and Islamic reminders
• Process transactions (donations, marketplace purchases, tips)
• Detect and prevent spam, abuse, and policy violations
• Communicate with you about service updates and new features
• Generate analytics to improve user experience`,
        },
        {
          heading: 'Data Sharing',
          content: `We do NOT sell your personal data to third parties. We may share data with:
• Service providers: hosting (Railway), storage (Cloudflare R2), authentication (Clerk), payments (Stripe), search (Meilisearch)
• Legal compliance: when required by law, court order, or governmental authority
• Safety: to protect users from harm, enforce policies, or prevent fraud
• With your consent: when you explicitly choose to share (e.g., public posts, shared collections)`,
        },
        {
          heading: 'Data Retention',
          content: `• Active account data: retained as long as your account is active
• Deleted content: removed from public view immediately; purged from backups within 30 days
• Account deletion: all personal data deleted within 30 days of request
• Anonymous analytics: retained indefinitely in aggregate form
• Messages in conversations: retained per conversation disappearing message settings`,
        },
        {
          heading: 'Your Rights',
          content: `You have the right to:
• Access: request a copy of your personal data
• Correction: update inaccurate information
• Deletion: delete your account and all associated data
• Export: download your data in a portable format
• Restrict: limit how we process your data
• Object: opt out of personalized recommendations
To exercise these rights, use Settings > Account > Manage Data or contact privacy@mizanly.app`,
        },
        {
          heading: 'Security',
          content: `We implement industry-standard security measures including:
• End-to-end encryption for direct messages (optional)
• TLS encryption for all data in transit
• Encrypted storage for sensitive data at rest
• Rate limiting and abuse prevention
• Regular security audits and monitoring`,
        },
        {
          heading: 'Children',
          content: `Mizanly is not intended for children under 13. We do not knowingly collect data from children under 13. If you believe a child under 13 is using our service, contact us at privacy@mizanly.app.`,
        },
        {
          heading: 'Changes to This Policy',
          content: 'We may update this policy periodically. We will notify you of significant changes through the app or email. Continued use of Mizanly after changes constitutes acceptance of the updated policy.',
        },
        {
          heading: 'Contact',
          content: 'For privacy questions or concerns, contact: privacy@mizanly.app',
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
      lastUpdated: '2026-03-20',
      version: '1.0',
      sections: [
        {
          heading: 'Acceptance of Terms',
          content: 'By accessing or using Mizanly, you agree to be bound by these Terms of Service. If you do not agree, do not use the service.',
        },
        {
          heading: 'Eligibility',
          content: 'You must be at least 13 years old to use Mizanly. By using the service, you represent that you meet this requirement. Users under 18 require parental consent.',
        },
        {
          heading: 'User Responsibilities',
          content: `You agree to:
• Provide accurate account information
• Maintain the security of your account credentials
• Not impersonate others or misrepresent your identity
• Comply with all applicable laws and regulations
• Respect other users and engage in constructive dialogue
• Not use the platform for commercial spam or unauthorized advertising`,
        },
        {
          heading: 'Content Policy',
          content: `The following content is prohibited:
• Nudity, sexually explicit, or pornographic content
• Graphic violence, gore, or content promoting self-harm
• Hate speech, discrimination, or harassment
• Extremist content, terrorism promotion, or radicalization
• Spam, scams, phishing, or misleading content
• Content that mocks, ridicules, or disrespects any religion
• Impersonation of scholars, institutions, or public figures
• Content illegal under applicable law
Violations may result in content removal, account suspension, or permanent ban.`,
        },
        {
          heading: 'Intellectual Property',
          content: `• You retain ownership of content you create and post on Mizanly
• By posting, you grant Mizanly a non-exclusive, worldwide license to display, distribute, and promote your content within the platform
• You must not post content that infringes on others' intellectual property rights
• Mizanly's name, logo, and branding are our intellectual property`,
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
          heading: 'Limitation of Liability',
          content: `Mizanly is provided "as is" without warranties of any kind. We are not liable for:
• Content posted by users
• Accuracy of prayer times, Qibla direction, or Islamic content (always verify with local authorities)
• Service interruptions, data loss, or security breaches beyond our reasonable control
• Financial losses from marketplace transactions between users`,
        },
        {
          heading: 'Account Termination',
          content: `• You may delete your account at any time through Settings > Account > Delete Account
• We may suspend or terminate accounts that violate these terms
• Upon termination, your data will be handled per our Privacy Policy`,
        },
        {
          heading: 'Governing Law',
          content: 'These terms are governed by the laws of Australia. Any disputes will be resolved through arbitration in accordance with Australian law.',
        },
        {
          heading: 'Changes to Terms',
          content: 'We reserve the right to modify these terms. Material changes will be communicated through the app. Continued use after changes constitutes acceptance.',
        },
        {
          heading: 'Contact',
          content: 'For questions about these terms, contact: legal@mizanly.app',
        },
      ],
    };
  }
}

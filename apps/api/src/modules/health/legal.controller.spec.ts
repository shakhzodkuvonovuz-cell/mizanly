import { Test, TestingModule } from '@nestjs/testing';
import { LegalController } from './legal.controller';
import { globalMockProviders } from '../../common/test/mock-providers';

describe('LegalController', () => {
  let controller: LegalController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LegalController],
      providers: [...globalMockProviders],
    }).compile();

    controller = module.get(LegalController);
  });

  describe('getPrivacyPolicy', () => {
    it('should return privacy policy with correct title and version', () => {
      const result = controller.getPrivacyPolicy();

      expect(result.title).toBe('Mizanly Privacy Policy');
      expect(result.version).toBe('1.0');
      expect(result.lastUpdated).toBeDefined();
    });

    it('should include all required sections', () => {
      const result = controller.getPrivacyPolicy();

      const headings = result.sections.map((s: any) => s.heading);
      expect(headings).toContain('Information We Collect');
      expect(headings).toContain('How We Use Your Information');
      expect(headings).toContain('Data Sharing');
      expect(headings).toContain('Your Rights');
      expect(headings).toContain('Security');
      expect(headings).toContain('Children');
      expect(headings).toContain('Contact');
    });

    it('should have non-empty content in each section', () => {
      const result = controller.getPrivacyPolicy();

      for (const section of result.sections) {
        expect((section as any).content.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getTermsOfService', () => {
    it('should return terms of service with correct title and version', () => {
      const result = controller.getTermsOfService();

      expect(result.title).toBe('Mizanly Terms of Service');
      expect(result.version).toBe('1.0');
      expect(result.lastUpdated).toBeDefined();
    });

    it('should include all required sections', () => {
      const result = controller.getTermsOfService();

      const headings = result.sections.map((s: any) => s.heading);
      expect(headings).toContain('Acceptance of Terms');
      expect(headings).toContain('Eligibility');
      expect(headings).toContain('Content Policy');
      expect(headings).toContain('Intellectual Property');
      expect(headings).toContain('Limitation of Liability');
      expect(headings).toContain('Account Termination');
      expect(headings).toContain('Governing Law');
    });

    it('should have non-empty content in each section', () => {
      const result = controller.getTermsOfService();

      for (const section of result.sections) {
        expect((section as any).content.length).toBeGreaterThan(0);
      }
    });
  });
});

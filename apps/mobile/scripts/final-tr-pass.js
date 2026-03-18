const fs = require('fs');
const en = JSON.parse(fs.readFileSync('apps/mobile/src/i18n/en.json', 'utf8'));
const tr = JSON.parse(fs.readFileSync('apps/mobile/src/i18n/tr.json', 'utf8'));

const dict = {
  // Single words remaining
  'Adult': 'Yetişkin', 'Blocker': 'Engelleyici', 'Bug': 'Hata',
  'Campaign': 'Kampanya', 'Caption': 'Açıklama', 'Chargeback': 'Ters İbraz',
  'Code': 'Kod', 'Collaboration': 'İşbirliği', 'Comment': 'Yorum',
  'Compliance': 'Uyumluluk', 'Confidentiality': 'Gizlilik', 'Consent': 'Onay',
  'Contract': 'Sözleşme', 'Conversion': 'Dönüşüm', 'Cooking': 'Yemek Pişirme',
  'Cosmetic': 'Kozmetik', 'Credential': 'Yetki', 'Critical': 'Kritik',
  'Day': 'Gün', 'Deduction': 'Kesinti', 'Deposit': 'Depozito',
  'Device': 'Cihaz', 'Disbursement': 'Ödeme', 'Display': 'Görüntü',
  'Draft': 'Taslak', 'Dynamic': 'Dinamik', 'Economy': 'Ekonomi',
  'Editor': 'Editör', 'Element': 'Öğe', 'Emoji': 'Emoji',
  'Engagement': 'Etkileşim', 'Episode': 'Bölüm', 'Escrow': 'Emanet',
  'Exemption': 'Muafiyet', 'Expense': 'Gider', 'Feature': 'Özellik',
  'Flat': 'Düz', 'Flexible': 'Esnek', 'Flow': 'Akış',
  'Forecast': 'Tahmin', 'Formula': 'Formül', 'Framework': 'Çerçeve',
  'Frequency': 'Sıklık', 'Fund': 'Fon', 'Fundraising': 'Bağış Toplama',
  'Gateway': 'Geçit', 'Government': 'Devlet', 'Gradient': 'Gradyan',
  'Graph': 'Grafik', 'Growth': 'Büyüme', 'Guarantee': 'Garanti',
  'Guest': 'Misafir', 'Guide': 'Rehber', 'Handler': 'İşleyici',
  'Header': 'Üst Bilgi', 'Heritage': 'Miras', 'Hidden': 'Gizli',
  'Highlight': 'Öne Çıkanlar', 'Host': 'Ev Sahibi', 'Hour': 'Saat',
  'Hybrid': 'Hibrit', 'Impact': 'Etki', 'Impression': 'Gösterim',
  'Incentive': 'Teşvik', 'Individual': 'Bireysel', 'Infrastructure': 'Altyapı',
  'Initial': 'Başlangıç', 'Insight': 'İçgörü', 'Insurance': 'Sigorta',
  'Instant': 'Anlık', 'Interchange': 'Ara Değişim', 'Interest': 'Faiz',
  'Intermediate': 'Ara', 'Internal': 'Dahili', 'Intro': 'Giriş',
  'Inventory': 'Envanter', 'Investment': 'Yatırım', 'Invisible': 'Görünmez',
  'Journey': 'Yolculuk', 'Keywords': 'Anahtar Kelimeler', 'Late': 'Geç',
  'Layer': 'Katman', 'Legacy': 'Miras', 'Liability': 'Yükümlülük',
  'License': 'Lisans', 'Limit': 'Limit', 'Linear': 'Doğrusal',
  'Liquidation': 'Tasfiye', 'Listener': 'Dinleyici', 'Listeners': 'Dinleyiciler',
  'Loan': 'Kredi', 'Logistics': 'Lojistik', 'Loyalty': 'Sadakat',
  'Maintenance': 'Bakım', 'Management': 'Yönetim', 'Manager': 'Yönetici',
  'Margin': 'Marj', 'Markup': 'Kâr Marjı', 'Maturity': 'Vade',
  'Maximum': 'Maksimum', 'Mediation': 'Arabuluculuk', 'Mention': 'Bahset',
  'Mentor': 'Mentor', 'Merchant': 'İşletmeci', 'Metrics': 'Metrikler',
  'Micro': 'Mikro', 'Migration': 'Taşıma', 'Milestone': 'Kilometre Taşı',
  'Millisecond': 'Milisaniye', 'Minimum': 'Minimum', 'Model': 'Model',
  'Module': 'Modül', 'Monitoring': 'İzleme', 'Morning': 'Sabah',
  'Mortgage': 'İpotek', 'Mosques': 'Camiler', 'Movement': 'Hareket',
  'Multiple': 'Çoklu', 'Nanosecond': 'Nanosaniye', 'National': 'Ulusal',
  'Negotiation': 'Müzakere', 'Network': 'Ağ', 'Night': 'Gece',
  'Nominal': 'Nominal', 'Normal': 'Normal', 'Notice': 'Bildirim',
  'Notification': 'Bildirim', 'Obligation': 'Yükümlülük', 'Occasional': 'Ara Sıra',
  'Official': 'Resmi', 'Ongoing': 'Devam Eden', 'Operating': 'İşletme',
  'Operational': 'Operasyonel', 'Operator': 'Operatör', 'Optional': 'İsteğe Bağlı',
  'Override': 'Geçersiz Kılma', 'Overview': 'Genel Bakış', 'Owner': 'Sahip',
  'Packaging': 'Paketleme', 'Partner': 'Ortak', 'Passive': 'Pasif',
  'Percentage': 'Yüzde', 'Performance': 'Performans', 'Period': 'Dönem',
  'Personal': 'Kişisel', 'Pipeline': 'Hat', 'Pitch': 'Sunum',
  'Platform': 'Platform', 'Pledge': 'Taahhüt', 'Podcast': 'Podcast',
  'Policy': 'Politika', 'Portfolio': 'Portföy', 'Prepaid': 'Ön Ödemeli',
  'Primary': 'Birincil', 'Principle': 'İlke', 'Priority': 'Öncelik',
  'Proceeds': 'Gelir', 'Processing': 'İşleniyor', 'Procurement': 'Tedarik',
  'Professional': 'Profesyonel', 'Profit': 'Kâr', 'Program': 'Program',
  'Progressive': 'İlerlemeli', 'Project': 'Proje', 'Projection': 'Projeksiyon',
  'Promotion': 'Promosyon', 'Promotional': 'Promosyonel', 'Proposal': 'Teklif',
  'Prospect': 'Potansiyel', 'Protocol': 'Protokol', 'Provider': 'Sağlayıcı',
  'Proxy': 'Vekil', 'Purchase': 'Satın Alma', 'Quarterly': 'Üç Aylık',
  'Quota': 'Kota', 'Range': 'Aralık', 'Reach': 'Erişim',
  'Reaction': 'Tepki', 'Rebate': 'İndirim', 'Reciter': 'Okuyucu',
  'Reconciliation': 'Mutabakat', 'Recovery': 'Kurtarma', 'Recurring': 'Tekrarlayan',
  'Registration': 'Kayıt', 'Regular': 'Normal', 'Regulation': 'Düzenleme',
  'Regulatory': 'Düzenleyici', 'Reimbursement': 'Geri Ödeme', 'Remote': 'Uzak',
  'Renewal': 'Yenileme', 'Rental': 'Kiralama', 'Reported': 'Şikâyet Edildi',
  'Reserve': 'Rezerv', 'Resolution': 'Çözüm', 'Resolved': 'Çözüldü',
  'Resource': 'Kaynak', 'Response': 'Yanıt', 'Restitution': 'Tazminat',
  'Restricted': 'Kısıtlandı', 'Retention': 'Elde Tutma', 'Return': 'İade',
  'Reward': 'Ödül', 'Rewind': 'Geri Sar', 'Roadmap': 'Yol Haritası',
  'Roster': 'Kadro', 'Royalty': 'Telif', 'Running': 'Devam Eden',
  'Rush': 'Acil', 'Salary': 'Maaş', 'Sample': 'Örnek',
  'Scaling': 'Ölçekleme', 'Scope': 'Kapsam', 'Secondary': 'İkincil',
  'Secure': 'Güvenli', 'Segment': 'Segment', 'Semester': 'Dönem',
  'Senior': 'Kıdemli', 'Session': 'Oturum', 'Settlement': 'Uzlaşma',
  'Severance': 'Kıdem', 'Sharing': 'Paylaşım', 'Shipping': 'Kargo',
  'Signal': 'Sinyal', 'Signature': 'İmza', 'Simple': 'Basit',
  'Simulation': 'Simülasyon', 'Single': 'Tekli', 'Slider': 'Kaydırıcı',
  'Snapshot': 'Anlık Görüntü', 'Solid': 'Katı', 'Solution': 'Çözüm',
  'Speaker': 'Konuşmacı', 'Special': 'Özel', 'Specification': 'Şartname',
  'Split': 'Böl', 'Sponsor': 'Sponsor', 'Staging': 'Hazırlık',
  'Stakeholder': 'Paydaş', 'Startup': 'Başlangıç', 'Statement': 'Hesap Özeti',
  'Sticker': 'Çıkartma', 'Stickers': 'Çıkartmalar', 'Stipend': 'Burs',
  'Strategy': 'Strateji', 'Streak': 'Seri', 'Stream': 'Yayın',
  'Strikethrough': 'Üstü Çizili', 'Structure': 'Yapı', 'Subscriber': 'Abone',
  'Subsidy': 'Sübvansiyon', 'Successor': 'Halef', 'Summary': 'Özet',
  'Superchat': 'Süper Sohbet', 'Supplier': 'Tedarikçi', 'Surcharge': 'Ek Ücret',
  'Surety': 'Kefalet', 'Surface': 'Yüzey', 'Survey': 'Anket',
  'Switch': 'Değiştir', 'Syndicate': 'Sendika', 'Tariff': 'Tarife',
  'Taxation': 'Vergilendirme', 'Temporary': 'Geçici', 'Tenant': 'Kiracı',
  'Tender': 'İhale', 'Tenure': 'Görev Süresi', 'Terminal': 'Terminal',
  'Testing': 'Test', 'Threshold': 'Eşik', 'Throughput': 'İşlem Hacmi',
  'Ticket': 'Bilet', 'Tiered': 'Katmanlı', 'Timeline': 'Zaman Çizelgesi',
  'Token': 'Jeton', 'Toolbar': 'Araç Çubuğu', 'Tracking': 'Takip',
  'Traffic': 'Trafik', 'Training': 'Eğitim', 'Transition': 'Geçiş',
  'Transparency': 'Şeffaflık', 'Treasury': 'Hazine', 'Trend': 'Trend',
  'Trial': 'Deneme', 'Trigger': 'Tetikleyici', 'Turnover': 'Ciro',
  'Tutorial': 'Eğitim', 'Underline': 'Altı Çizili', 'Underwriting': 'Yüklenim',
  'Unlink': 'Bağlantıyı Kaldır', 'Unpublish': 'Yayından Kaldır',
  'Uppercase': 'Büyük Harf', 'Usage': 'Kullanım', 'Utility': 'Fayda',
  'Valuation': 'Değerleme', 'Variable': 'Değişken', 'Variance': 'Sapma',
  'Vendor': 'Tedarikçi', 'Venture': 'Girişim', 'Verification': 'Doğrulama',
  'Viewers': 'İzleyiciler', 'Visibility': 'Görünürlük', 'Visible': 'Görünür',
  'Vocal': 'Vokal', 'Voice': 'Ses', 'Volunteer': 'Gönüllü',
  'Voucher': 'Kupon', 'Waiver': 'Feragat', 'Warrant': 'Varant',
  'Warranty': 'Garanti', 'Watch': 'İzle', 'Webinar': 'Web Semineri',
  'Wholesale': 'Toptan', 'Withdrawal': 'Çekim', 'Withholding': 'Stopaj',
  'Workflow': 'İş Akışı', 'Yield': 'Getiri', 'Advertising': 'Reklam',
  'Affiliate': 'Ortaklık', 'Agreement': 'Anlaşma', 'Loading': 'Yükleniyor',
  'Joined': 'Katıldı', 'Passcode': 'Şifre', 'Packing': 'Paketleme',
  'Passport': 'Pasaport', 'Penalty': 'Ceza', 'Optimization': 'Optimizasyon',
  'Outcome': 'Sonuç', 'Outreach': 'Erişim', 'Overhead': 'Genel Gider',
  'Pace': 'Tempo', 'Objective': 'Hedef', 'Offset': 'Dengeleme',
  'Onboarding': 'Başlangıç',
  // Words that don't need translation (keep as is)
  'DSP': 'DSP', 'Co-host': 'Ortak Sunucu', 'Anime': 'Anime',
};

let count = 0;
function apply(enObj, trObj) {
  for (const [key, value] of Object.entries(enObj)) {
    if (typeof value === 'object' && value !== null) {
      if (!trObj[key]) trObj[key] = {};
      apply(value, trObj[key]);
    } else if (typeof value === 'string' && trObj[key] === value) {
      if (dict[value]) {
        trObj[key] = dict[value];
        count++;
      }
    }
  }
}

apply(en, tr);
fs.writeFileSync('apps/mobile/src/i18n/tr.json', JSON.stringify(tr, null, 2), 'utf8');

// Recount
let total = 0, done = 0, filterData = 0;
function c(enObj, trObj, path = '') {
  for (const [key, value] of Object.entries(enObj)) {
    const p = path ? path + '.' + key : key;
    if (typeof value === 'object') c(value, trObj[key] || {}, p);
    else if (typeof value === 'string') {
      total++;
      const isF = p.startsWith('settings.') && !value.includes(' ') && value.length <= 20 && /^[A-Z][a-z]+$/.test(value);
      if (isF) filterData++;
      else if (trObj[key] !== value) done++;
    }
  }
}
c(en, tr);
const realUI = total - filterData;
console.log(`Applied: ${count} new translations`);
console.log(`Coverage: ${done}/${realUI} (${((done / realUI) * 100).toFixed(1)}%)`);
console.log(`Still in English: ${realUI - done}`);

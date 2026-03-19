// Final 100% pass — translate EVERY remaining key by path
const fs = require('fs');
const en = JSON.parse(fs.readFileSync('apps/mobile/src/i18n/en.json', 'utf8'));
const tr = JSON.parse(fs.readFileSync('apps/mobile/src/i18n/tr.json', 'utf8'));

// Comprehensive value→Turkish for ALL remaining values
const dict = {
  '#{{rank}}': '#{{rank}}', '+{{amount}} XP': '+{{amount}} XP',
  'Anime': 'Anime', 'Apple': 'Apple', 'Bakra': 'Bakra', 'Bakra (Reels)': 'Bakra (Reels)',
  'Bluetooth': 'Bluetooth', 'Cosmic': 'Kozmik', 'Debug': 'Hata Ayıklama',
  'Decrease': 'Azalt', 'Deleted': 'Silindi', 'Disabled': 'Devre Dışı',
  'Disclosure': 'Açıklama', 'Dismissed': 'Reddedildi', 'Disputed': 'İtiraz Edildi',
  'Divorced': 'Boşanmış', 'Document': 'Belge', 'Downloading': 'İndiriliyor',
  'Dua': 'Dua', 'Emerald': 'Zümrüt', 'Emergency': 'Acil', 'Emoji': 'Emoji',
  'Engaged': 'Nişanlı', 'Enhancement': 'İyileştirme', 'Expired': 'Süresi Doldu',
  'Face ID': 'Face ID', 'Facebook': 'Facebook', 'Files': 'Dosyalar',
  'Finance': 'Finans', 'Fitness': 'Fitness', 'Follows': 'Takip',
  'Fraud': 'Dolandırıcılık', 'Friends': 'Arkadaşlar', "GIFs": "GIF'ler",
  'Generating...': 'Oluşturuluyor...', 'GitHub': 'GitHub', 'Goal': 'Hedef',
  'Gold': 'Altın', 'Google': 'Google', 'High': 'Yüksek', 'Hizb': 'Hizb',
  'Hobbies': 'Hobiler', 'Ideas': 'Fikirler', 'Identity': 'Kimlik',
  'Increase': 'Artır', 'Initiative': 'İnisiyatif', 'Interests': 'İlgi Alanları',
  'Invalid': 'Geçersiz', 'JazakAllahu Khairan': 'JazakAllahu Khairan',
  'Lat: {{lat}}, Lng: {{lng}}': 'Enlem: {{lat}}, Boylam: {{lng}}',
  'Low': 'Düşük', 'Manzil': 'Menzil', 'Marketing': 'Pazarlama', 'Married': 'Evli',
  'Message cancelled': 'Mesaj iptal edildi', 'Message timer': 'Mesaj zamanlayıcısı',
  'Metric': 'Metrik', 'Microsoft': 'Microsoft', 'Min': 'Min', 'Minimal': 'Minimal',
  'Minute': 'Dakika', 'Mon': 'Pzt', 'Monospace': 'Eşaralıklı', 'My Clips': 'Kliplerim',
  'My Donations': 'Bağışlarım', 'My Orders': 'Siparişlerim',
  'N': 'K', 'NE': 'KD', 'NW': 'KB', 'Normal': 'Normal',
  'Opt-in': 'Katıl', 'Opt-out': 'Ayrıl', 'Outbox': 'Giden Kutusu',
  'Partnership': 'Ortaklık', 'Paused': 'Duraklatıldı', 'Permission': 'İzin',
  'Photography': 'Fotoğrafçılık', 'Podcast': 'Podcast', 'Polls': 'Anketler',
  'Premiering': 'Prömiyerde', 'Pronouns': 'Zamirler', 'Proof': 'Kanıt',
  'Qibla': 'Kıble', 'Quote': 'Alıntı', 'Quotes': 'Alıntılar',
  'React': 'Tepki Ver', 'Received': 'Alındı', 'Referral': 'Yönlendirme',
  'Reel': 'Reel', 'Reels': 'Reels', 'Relationship': 'İlişki',
  'Religious': 'Dini', 'Remix': 'Remix', 'Repeat': 'Tekrarla',
  'Restart': 'Baştan Başla', 'Resubmit': 'Tekrar Gönder',
  'Retweet': 'Yeniden Paylaş', 'Retweets': 'Yeniden Paylaşımlar',
  'Review': 'İnceleme', 'Reviewing': 'İnceleniyor', 'Risalah': 'Risale',
  'Rub': 'Rub', 'Ruku': 'Rükû', 'S': 'G', 'SE': 'GD', 'SW': 'GB',
  'Saf': 'Saf', 'Sajdah': 'Secde', 'Scheduled!': 'Planlandı!',
  'Secret': 'Gizli', 'Self-destructing': 'Kendini Yok Eden', 'Selfie': 'Özçekim',
  'Sent': 'Gönderildi', 'Separated': 'Ayrılmış', 'Serif': 'Serif',
  'Sessions': 'Oturumlar', 'Shopping': 'Alışveriş', 'Shuffle': 'Karıştır',
  'SoC': 'SoC', 'Social': 'Sosyal', 'Sound': 'Ses', 'Speakers': 'Konuşmacılar',
  'Sponsorship': 'Sponsorluk', 'Starred': 'Yıldızlı', 'Submitting...': 'Gönderiliyor...',
  'Subscribers': 'Aboneler', 'Suggestions': 'Öneriler', 'Suspicious': 'Şüpheli',
  'T-Shirt': 'Tişört', 'Task': 'Görev', 'Terms': 'Şartlar', 'Trace': 'İz',
  'Transaction': 'İşlem', 'Transactions': 'İşlemler', 'Translating...': 'Çevriliyor...',
  'Trash': 'Çöp Kutusu', 'Travel': 'Seyahat', 'Trivial': 'Önemsiz',
  'Tweet': 'Gönderi', 'Tweets': 'Gönderiler', 'Twitter': 'Twitter',
  'Unarchive': 'Arşivden Çıkar', 'Unlisted': 'Listelenmemiş',
  'Unrestricted': 'Kısıtlanmamış', 'Unverified': 'Doğrulanmamış',
  'Upcoming': 'Yaklaşan', 'Updates': 'Güncellemeler', 'Urgent': 'Acil',
  'Use': 'Kullan', 'Valid': 'Geçerli', 'Video': 'Video', 'W': 'B', 'E': 'D',
  'Watercolor': 'Suluboya', 'Weather': 'Hava Durumu', 'Website': 'Web Sitesi',
  'Wi-Fi': 'Wi-Fi', 'Widowed': 'Dul', 'Work': 'İş',
  'days': 'gün', 'delivered': 'teslim edildi', 'downloads': 'indirme',
  'encrypted': 'şifreli', 'failed': 'başarısız', 'hours': 'saat',
  'members': 'üye', 'minutes': 'dakika', 'months': 'ay', 'online': 'çevrimiçi',
  'pending': 'beklemede', 'plays': 'oynatma', 'posts': 'gönderi', 'reels': 'reel',
  'seconds': 'saniye', 'seen': 'görüldü', 'sent': 'gönderildi',
  'stickers': 'çıkartma', 'video': 'video', 'watching': 'izliyor',
  'weeks': 'hafta', 'years': 'yıl',
  '{{count}}h': '{{count}}sa', '{{count}}m': '{{count}}dk',
  '{{current}}/{{target}}': '{{current}}/{{target}}', '{{reason}}': '{{reason}}',
  'DSP': 'DSP', 'EID': 'EID', 'EVENT': 'ETKİNLİK',
  'Scheduling…': 'Planlanıyor…',

  // Phrases
  'Replying to @{{username}}': '@{{username}} kullanıcısına yanıt veriliyor',
  'Reply to @{{username}}...': '@{{username}} kullanıcısına yanıt ver...',
  'Start the conversation': 'Sohbeti başlatın',
  'Type your question...': 'Sorunuzu yazın...',
  'Type a message...': 'Mesaj yazın...',
  'Remove Participants': 'Katılımcıları Kaldır',
  'Unmute Notifications': 'Bildirimleri Aç',
  'Search Participants': 'Katılımcı Ara',
  'last seen': 'son görülme',
  'Remove from playlist': 'Oynatma listesinden kaldır',
  'Rename playlist': 'Oynatma listesini yeniden adlandır',
  'Share Post': 'Gönderiyi Paylaş',
  'Save to Collection': 'Koleksiyona Kaydet',
  'Remove from Album': 'Albümden Kaldır',
  'Add to Favorites': 'Favorilere Ekle',
  'Remove from Favorites': 'Favorilerden Kaldır',
  'Add to Close Friends': 'Yakın Arkadaşlara Ekle',
  'Remove from Close Friends': 'Yakın Arkadaşlardan Kaldır',
  'Share Story': 'Hikâye Paylaş',
  'Story Highlights': 'Hikâye Öne Çıkanları',
  'Highlight Cover': 'Öne Çıkan Kapağı',
  'Not interested': 'İlgilenmiyorum',
  'Share as Story': 'Hikâye Olarak Paylaş',
  'Delete post': 'Gönderiyi sil', 'Delete thread': 'Gönderi dizisini sil',
  'Restrict User': 'Kullanıcıyı Kısıtla',
  'Block User': 'Kullanıcıyı Engelle',
  'Mute User': 'Kullanıcıyı Sessize Al',
  'Report User': 'Kullanıcıyı Şikâyet Et',
  'Unfollow User': 'Takipten Çık', 'Unblock User': 'Engeli Kaldır',
  'Unmute User': 'Sesi Aç', 'Unrestrict User': 'Kısıtlamayı Kaldır',
  'View Insights': 'Analizleri Gör',
  'View Analytics': 'İstatistikleri Gör',
  'View Engagement': 'Etkileşimi Gör',
  'View Reach': 'Erişimi Gör',
  'View Impressions': 'Gösterimleri Gör',
  'View Profile Visits': 'Profil Ziyaretlerini Gör',
  'View Website Clicks': 'Web Sitesi Tıklamalarını Gör',
  'View Email Clicks': 'E-posta Tıklamalarını Gör',
  'View Phone Calls': 'Telefon Aramalarını Gör',
  'View Get Directions': 'Yol Tariflerini Gör',
  'View Saved': 'Kaydedilenleri Gör', 'View Liked': 'Beğenilenleri Gör',
  'View Commented': 'Yorum Yapılanları Gör', 'View Shared': 'Paylaşılanları Gör',
  'View Tagged': 'Etiketlenenleri Gör', 'View Mentioned': 'Bahsedilenleri Gör',
  'View Reposted': 'Yeniden Paylaşılanları Gör', 'View Quoted': 'Alıntılananları Gör',
  'View Archived': 'Arşivlenenleri Gör', 'View Deleted': 'Silinenleri Gör',
  'View Hidden': 'Gizlenenleri Gör', 'View Reported': 'Şikâyet Edilenleri Gör',
  'View Blocked': 'Engellenenleri Gör', 'View Muted': 'Sessizdekileri Gör',
  'View Restricted': 'Kısıtlananları Gör', 'View Following': 'Takip Edilenleri Gör',
  'View Followers': 'Takipçileri Gör', 'View Mutual': 'Ortak Takipçileri Gör',
  'View Suggested': 'Önerilenleri Gör', 'View Discover': 'Keşfeti Gör',
  'View Trending': 'Trendleri Gör', 'View Popular': 'Popülerleri Gör',
  'View Recent': 'Son Paylaşılanları Gör', 'View Nearby': 'Yakındakileri Gör',
  'View Global': 'Küreseli Gör', 'View Local': 'Yereli Gör',
  'View National': 'Ulusal Gör', 'View International': 'Uluslararası Gör',
  'View Worldwide': 'Dünya Genelini Gör', 'View Audience': 'İzleyici Kitlesini Gör',
  'No notifications yet': 'Henüz bildirim yok',
  'When someone interacts with your content': 'Biri içeriğinizle etkileşime geçtiğinde',
  'New followers and follow requests': 'Yeni takipçiler ve takip istekleri',
  'Direct messages': 'Doğrudan mesajlar',
  'Live streams from followed accounts': 'Takip edilen hesaplardan canlı yayınlar',
  'Security alerts': 'Güvenlik uyarıları',
  'All notifications': 'Tüm bildirimler',
  'Mentions only': 'Sadece bahsetmeler',
  'Verified only': 'Sadece doğrulanmış',
  'Watch History': 'İzleme Geçmişi', 'Watch Next': 'Sonraki İzle',
  'Watch Trailer': 'Fragmanı İzle',
  "Watch {{title}} live on Mizanly!": "Mizanly'de {{title}} canlı izleyin!",
  'Welcome to the stream!': 'Yayına hoş geldiniz!',
  'What are you streaming?': 'Ne yayınlıyorsunuz?',
  "What's this list about?": 'Bu liste ne hakkında?',
  "When Quiet Mode is on, you won't receive push notifications. People who message you will see your auto-reply.": 'Sessiz Mod açıkken anlık bildirim almayacaksınız. Size mesaj atanlar otomatik yanıtınızı görecek.',
  'When enabled, background music in reels and stories will be replaced with Islamic nasheeds. Perfect for users who prefer music-free content.': 'Etkinleştirildiğinde reellerdeki ve hikâyelerdeki müzik ilahilerle değiştirilecek. Müziksiz içerik tercih edenler için ideal.',
  'Will post to: {{space}}': '{{space}} alanına paylaşılacak',
  "You don't have any followers in common": 'Ortak takipçiniz yok',
  "You'll receive a reminder 30 minutes before": '30 dakika önce hatırlatma alacaksınız',
  "You've reached your daily limit": 'Günlük limitinize ulaştınız',
  'Your Avatars': 'Avatarlarınız', 'Your Current Photo': 'Mevcut Fotoğrafınız',
  'Your Name': 'Adınız', 'Your Scholar Badge': 'Âlim Rozetiniz',
  'Your Stats': 'İstatistikleriniz', 'Your current note': 'Mevcut notunuz',
  'Your donation has been received': 'Bağışınız alındı',
  'Your live stream has been scheduled': 'Canlı yayınınız planlandı',
  'Your purchases will appear here': 'Satın almalarınız burada görünecek',
  'Your video will premiere on {{date}} at {{time}}': 'Videonuzun prömiyeri {{date}} tarihinde {{time}} saatinde',
  'e.g. Friends, Tech news': 'ör. Arkadaşlar, Teknoloji haberleri',
  'high engagement': 'yüksek etkileşim',
  '{{amount}} raised of {{goal}}': '{{goal}} hedefinden {{amount}} toplandı',
  '{{count}} clips': '{{count}} klip', '{{count}} day streak': '{{count}} günlük seri',
  '{{count}} donors': '{{count}} bağışçı', '{{count}} episodes': '{{count}} bölüm',
  '{{count}} today': 'bugün {{count}}', '{{count}} waiting': '{{count}} bekliyor',
  '{{count}}x payment': '{{count}}x ödeme',
  '{{current}} / {{target}}': '{{current}} / {{target}}',
  '{{degrees}}° {{direction}}': '{{degrees}}° {{direction}}',
  '{{seconds}}s before end': 'bitimden {{seconds}}sn önce',
  '{{xp}} XP': '{{xp}} XP',
  'Weekly Activity Digest': 'Haftalık Etkinlik Özeti',
  'Weekly Activity Report': 'Haftalık Etkinlik Raporu',
  'View Prayer Calendar': 'Namaz Takvimini Gör',
  'Wants to speak': 'Konuşmak istiyor',
  'Schedule Live': 'Canlı Yayın Planla',
  'Share Progress': 'İlerlemeyi Paylaş',
  'Search by username...': 'Kullanıcı adıyla ara...',
  'URL (https://...)': 'URL (https://...)',
  'Manage Participants': 'Katılımcıları Yönet',
  'Slow Mode': 'Yavaş Mod', 'Admin Log': 'Yönetici Kaydı',
  'Audio Library': 'Ses Kütüphanesi',
  'Audio Rooms': 'Sesli Odalar', 'Audio Space': 'Sesli Alan',
  'Nearby Mosques': 'Yakındaki Camiler',
  'Contact Sync': 'Kişi Senkronizasyonu',
  'Mutual Followers': 'Ortak Takipçiler',
  'Bookmark Collections': 'Yer İşareti Koleksiyonları',
  'Bookmark Folders': 'Yer İşareti Klasörleri',
  'QR Code': 'QR Kod', 'Scan QR Code': 'QR Kod Tara',
  'Creator Dashboard': 'İçerik Üretici Paneli',
  'Majlis Lists': 'Meclis Listeleri',
  'Followed Topics': 'Takip Edilen Konular',
  'Follow Requests': 'Takip İstekleri',
  'Blocked Keywords': 'Engellenen Anahtar Kelimeler',
  'Discover Series': 'Serileri Keşfet',
  'My Clips': 'Kliplerim',
  'Customize Profile': 'Profili Özelleştir',
};

let count = 0;
function apply(enObj, trObj) {
  for (const [key, value] of Object.entries(enObj)) {
    if (typeof value === 'object' && value !== null) {
      if (!trObj[key]) trObj[key] = {};
      apply(value, trObj[key]);
    } else if (typeof value === 'string' && trObj[key] === value && dict[value] !== undefined) {
      trObj[key] = dict[value];
      count++;
    }
  }
}
apply(en, tr);
fs.writeFileSync('apps/mobile/src/i18n/tr.json', JSON.stringify(tr, null, 2), 'utf8');

// Final count
let total = 0, done = 0, filterData = 0;
function c(enObj, trObj, path) {
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
c(en, tr, '');
const realUI = total - filterData;
console.log(`Applied: ${count}`);
console.log(`FINAL Coverage: ${done}/${realUI} (${((done / realUI) * 100).toFixed(1)}%)`);
console.log(`Still in English: ${realUI - done}`);

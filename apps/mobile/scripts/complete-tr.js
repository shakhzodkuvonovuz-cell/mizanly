// Complete Turkish translation — handles ALL 585 remaining keys
const fs = require('fs');
const en = JSON.parse(fs.readFileSync('apps/mobile/src/i18n/en.json', 'utf8'));
const tr = JSON.parse(fs.readFileSync('apps/mobile/src/i18n/tr.json', 'utf8'));
const remaining = JSON.parse(fs.readFileSync('apps/mobile/scripts/remaining-final.json', 'utf8'));

// Complete value→Turkish mapping for ALL remaining values
const dict = {
  // Brand names / tech terms — keep as-is
  'Min': 'Min', 'Bluetooth': 'Bluetooth', 'Wi-Fi': 'Wi-Fi',
  'Google': 'Google', 'Apple': 'Apple', 'Facebook': 'Facebook',
  'Twitter': 'Twitter', 'GitHub': 'GitHub', 'Microsoft': 'Microsoft',
  'Saf': 'Saf', 'Bakra': 'Bakra', 'Majlis': 'Meclis', 'Risalah': 'Risale', 'Minbar': 'Minber',
  'Video': 'Video', 'Reel': 'Reel', 'Reels': 'Reels', 'Remix': 'Remix',
  'Emoji': 'Emoji', 'Anime': 'Anime', 'Serif': 'Serif', 'Podcast': 'Podcast',
  'DSP': 'DSP', 'SoC': 'SoC', '#{{rank}}': '#{{rank}}',
  '{{current}}/{{target}}': '{{current}}/{{target}}', '{{reason}}': '{{reason}}',

  // "View X" patterns
  'Share Post': 'Gönderiyi Paylaş', 'Save to Collection': 'Koleksiyona Kaydet',
  'Remove from Album': 'Albümden Kaldır',
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

  // Notification types
  'invited you to a circle': 'sizi bir çevreye davet etti',
  'joined your circle': 'çevrenize katıldı',
  'sent you a message': 'size mesaj gönderdi',
  'posted in a channel you follow': 'takip ettiğiniz kanalda paylaşım yaptı',
  'went live': 'canlı yayına başladı',
  'interacted with your content': 'içeriğinizle etkileşime geçti',
  'someone': 'Birisi', 'others': 'diğer kişi',
  'Today': 'Bugün', 'Yesterday': 'Dün', 'This Week': 'Bu Hafta', 'Earlier': 'Daha Önce',
  'All notifications': 'Tüm bildirimler', 'Mentions only': 'Sadece bahsetmeler',
  'Verified only': 'Sadece doğrulanmış',
  'No notifications yet': 'Henüz bildirim yok',
  'When someone interacts with your content': 'Biri içeriğinizle etkileşime geçtiğinde',
  'New followers and follow requests': 'Yeni takipçiler ve takip istekleri',
  'Direct messages': 'Doğrudan mesajlar',
  'Live streams from followed accounts': 'Takip edilen hesaplardan canlı yayınlar',
  'Security alerts': 'Güvenlik uyarıları',

  // Islamic section
  'Dhikr Counter': 'Zikir Sayacı', 'Surah': 'Sure', 'Ayah': 'Ayet',
  'Hizb': 'Hizb', 'Manzil': 'Menzil', 'Rub': 'Rub',
  'Quran Reading Plan': "Kur'an Okuma Planı",
  'Islamic Calendar': 'Hicri Takvim', 'Qibla Compass': 'Kıble Pusulası',
  'Mosque Finder': 'Cami Bulucu', 'Prayer Reminders': 'Namaz Hatırlatıcıları',
  'Zakat Calculator': 'Zekât Hesaplayıcı',
  'Fajr': 'Fecr', 'Dhuhr': 'Öğle', 'Asr': 'İkindi',
  'Maghrib': 'Akşam', 'Isha': 'Yatsı', 'Sunrise': 'Güneş Doğuşu',
  'Hajj Companion': 'Hac Rehberi', 'Quran Room': "Kur'an Odası",
  'Quran Share': "Kur'an Paylaşımı",
  'Ruku': 'Rükû', 'Sajdah': 'Secde', 'Dhikr': 'Zikir', 'Dua': 'Dua',
  'Eid': 'Bayram', 'Qibla': 'Kıble',

  // Profile section
  'Call': 'Ara', 'Video Call': 'Görüntülü Arama', 'Voice Call': 'Sesli Arama',
  'Restrict': 'Kısıtla', 'Unrestrict': 'Kısıtlamayı Kaldır',
  'View Insights': 'Analizleri Gör', 'View Analytics': 'İstatistikleri Gör',
  'View Engagement': 'Etkileşimi Gör', 'View Reach': 'Erişimi Gör',
  'View Impressions': 'Gösterimleri Gör', 'View Profile Visits': 'Profil Ziyaretlerini Gör',
  'Add to Contacts': 'Kişilere Ekle', 'Remove from Contacts': 'Kişilerden Kaldır',

  // Bakra section
  'Hashtags': 'Hashtagler', 'Sounds': 'Sesler', 'Effects': 'Efektler',
  'Filters': 'Filtreler', 'Duet': 'Düet', 'Stitch': 'Birleştir',
  'Original audio': 'Orijinal ses',
  'Share Sound': 'Sesi Paylaş', 'Use Sound': 'Sesi Kullan',
  'View Sound Page': 'Ses Sayfasını Gör', 'Sound Page': 'Ses Sayfası',
  'Trending Sounds': 'Trend Sesler', 'Sound Details': 'Ses Detayları',

  // Risalah section
  'React': 'Tepki Ver', 'Star': 'Yıldızla', 'Unstar': 'Yıldızı Kaldır',
  'Group Info': 'Grup Bilgisi', 'Contact Info': 'Kişi Bilgisi',
  'Media': 'Medya', 'Links': 'Bağlantılar', 'Docs': 'Belgeler',
  'Search Messages': 'Mesaj Ara', 'Wallpaper': 'Duvar Kağıdı',
  'Encryption Info': 'Şifreleme Bilgisi', 'Disappearing Messages': 'Kaybolan Mesajlar',
  'Group Name': 'Grup Adı', 'Group Description': 'Grup Açıklaması',
  'Add Members': 'Üye Ekle', 'Leave Group': 'Gruptan Ayrıl',
  'Slow Mode': 'Yavaş Mod', 'Admin Log': 'Yönetici Kaydı',

  // Minbar section
  'Shorts': 'Kısa Videolar', 'Bell': 'Bildirim',
  'Personalized': 'Kişiselleştirilmiş',
  'Dislike': 'Beğenme', 'Clip': 'Klip',
  'Theater mode': 'Sinema modu', 'Picture-in-picture': 'Resim İçinde Resim',
  'Stats for nerds': 'Teknik istatistikler', 'Autoplay': 'Otomatik Oynat',
  'Play all': 'Tümünü Oynat', 'Add to queue': 'Sıraya ekle',
  'Remove from queue': 'Sıradan kaldır', 'Save queue': 'Sırayı kaydet',
  'Clear queue': 'Sırayı temizle', 'Play next': 'Sonraki oynat',
  'Play later': 'Sonra oynat', 'Repeat': 'Tekrarla', 'Repeat one': 'Bir Tekrarla',
  'Shuffle': 'Karıştır', 'views': 'görüntülenme',
  'Published': 'Yayınlandı', 'Scheduled': 'Planlandı',
  'Premiering': 'Prömiyerde', 'Live now': 'Şu anda canlı',
  'Ended': 'Sona erdi', 'Upcoming': 'Yaklaşan',
  'Watch': 'İzle', 'Resume': 'Devam Et', 'Restart': 'Baştan Başla',
  'Next': 'İleri', 'Previous': 'Önceki',
  'Age restricted': 'Yaş kısıtlamalı', 'Content rating': 'İçerik derecelendirmesi',
  'Family friendly': 'Aile dostu', 'Educational': 'Eğitici',
  'Inspirational': 'İlham Verici', 'Religious': 'Dini',

  // Gamification
  'Posting Streak': 'Paylaşım Serisi', 'Engagement Streak': 'Etkileşim Serisi',
  'Quran Streak': "Kur'an Serisi", 'Dhikr Streak': 'Zikir Serisi',
  'Learning Streak': 'Öğrenme Serisi',
  'Keep it going!': 'Devam edin!',
  'Streak broken — start again today': 'Seri kırıldı — bugün yeniden başlayın',

  // AI
  'AI Assistant': 'Yapay Zekâ Asistanı', 'AI Avatar': 'Yapay Zekâ Avatarı',
  'Translate': 'Çevir', 'Summarize': 'Özetle', 'Suggest': 'Öner',
  'Auto-translate': 'Otomatik Çeviri', 'Smart Reply': 'Akıllı Yanıt',
  'Content Assistant': 'İçerik Asistanı', 'Caption Generator': 'Açıklama Oluşturucu',
  'Hashtag Suggestions': 'Hashtag Önerileri', 'Topic Ideas': 'Konu Fikirleri',
  'Generate': 'Oluştur', 'Analyze': 'Analiz Et',
  'Describe your post or paste your draft...': 'Gönderinizi açıklayın veya taslağınızı yapıştırın...',
  'Enter your post content...': 'Gönderi içeriğinizi girin...',
  'Enter your content and tap Generate': 'İçeriğinizi girin ve Oluştur düğmesine dokunun',

  // Auth
  'Save Backup Codes': 'Yedek Kodları Kaydet',
  'Phone Number': 'Telefon Numarası',
  'Verification Code': 'Doğrulama Kodu',

  // Parental Controls
  'Parental Controls': 'Ebeveyn Kontrolleri',
  'Enter PIN': 'PIN Girin', 'Set a PIN': 'PIN Belirleyin',
  'Confirm PIN': 'PIN Onayı', 'Change PIN': 'PIN Değiştir',
  'Enter Current PIN': 'Mevcut PIN Girin', 'Enter New PIN': 'Yeni PIN Girin',
  'Child Account': 'Çocuk Hesabı', 'Link Child Account': 'Çocuk Hesabını Bağla',
  'Create a 4-digit PIN for parental access': 'Ebeveyn erişimi için 4 haneli PIN oluşturun',
  'Enter your 4-digit parental PIN': '4 haneli ebeveyn PIN kodunuzu girin',
  'Age-appropriate content': 'Yaşa uygun içerik',
  'Content Restrictions': 'İçerik Kısıtlamaları',
  'Screen Time Limit': 'Ekran Süresi Limiti',

  // End Screens
  'End Screens': 'Bitiş Ekranları', 'Add End Screen': 'Bitiş Ekranı Ekle',
  'Subscribe Card': 'Abone Kartı', 'Video Card': 'Video Kartı',
  'Playlist Card': 'Oynatma Listesi Kartı', 'Link Card': 'Bağlantı Kartı',
  'Channel Card': 'Kanal Kartı', 'Item': 'Öğe',
  'Maximum 4 end screens': 'En fazla 4 bitiş ekranı',
  'Every end screen needs a label': 'Her bitiş ekranının bir etiketi olmalı',

  // Settings
  'Data Usage': 'Veri Kullanımı',
  'End-User License Agreement': 'Son Kullanıcı Lisans Sözleşmesi',
  'Service Level Agreement': 'Hizmet Düzeyi Anlaşması',
  'Acceptable Use Policy': 'Kabul Edilebilir Kullanım Politikası',
  'Code of Conduct': 'Davranış Kuralları',
  'Machine Gun': 'Makineli Tüfek', 'Submachine Gun': 'Hafif Makineli Tüfek',
  'Assault Rifle': 'Taarruz Tüfeği', 'Sniper Rifle': 'Keskin Nişancı Tüfeği',
  'Tank Top': 'Atlet', 'Protective Wear': 'Koruyucu Giysi',
  'Safety Gear': 'Güvenlik Ekipmanı', 'Live Stream': 'Canlı Yayın',
  'Fast Forward': 'Hızlı İleri', 'Screen Capture': 'Ekran Görüntüsü',
  'Screen Recording': 'Ekran Kaydı', 'Screen Cast': 'Ekran Yansıtma',
  'Middle Ground': 'Orta Yol', 'Vantage Point': 'Bakış Açısı',

  // Premiere
  'Premiere': 'Prömiyer', 'Schedule Premiere': 'Prömiyer Planla',
  'LIVE NOW': 'CANLI', 'Remind Me': 'Hatırlat',
  'Chat before premiere...': 'Prömiyer öncesi sohbet...',
  'Allow viewers to chat during countdown': 'İzleyicilerin geri sayım sırasında sohbet etmesine izin ver',

  // Monetization
  'Send Tip': 'Bahşiş Gönder', 'Pending Review': 'İncelemede',
  'Under Review': 'İnceleniyor', 'Needs Action': 'İşlem Gerekiyor',
  'Action Required': 'İşlem Gerekli', 'Completed Action': 'Tamamlanan İşlem',
  'Missing Information': 'Eksik Bilgi', 'Incorrect Information': 'Yanlış Bilgi',
  'Application Status': 'Başvuru Durumu',
  'Application already submitted': 'Başvuru zaten gönderildi',
  'Tips': 'Bahşişler', 'Membership': 'Üyelik', 'Subscription': 'Abonelik',
  'Donation': 'Bağış', 'Payment': 'Ödeme', 'Revenue': 'Gelir',
  'Earnings': 'Kazançlar', 'Payout': 'Ödeme', 'Balance': 'Bakiye',
  'Withdraw': 'Çekim', 'Transfer': 'Transfer', 'Invoice': 'Fatura',
  'Receipt': 'Makbuz', 'Refund': 'İade', 'Tax': 'Vergi', 'Fee': 'Ücret',
  'Commission': 'Komisyon', 'Discount': 'İndirim', 'Coupon': 'Kupon',
  'Promo': 'Promosyon', 'Apply': 'Başvur', 'Approved': 'Onaylandı',
  'Rejected': 'Reddedildi', 'Billing': 'Faturalandırma',
  'Amount': 'Tutar', 'Total': 'Toplam',
  'Monthly': 'Aylık', 'Yearly': 'Yıllık', 'Weekly': 'Haftalık',
  'Daily': 'Günlük', 'Free': 'Ücretsiz', 'Premium': 'Premium',
  'Pro': 'Pro', 'Basic': 'Temel', 'Standard': 'Standart',
  'Custom': 'Özel', 'Price': 'Fiyat', 'Currency': 'Para Birimi',

  // Charity
  'Sadaqah': 'Sadaka', 'Donate': 'Bağış Yap', 'Donate Now': 'Şimdi Bağış Yap',
  'Charity Campaigns': 'Hayır Kampanyaları',
  'My Donations': 'Bağışlarım',

  // Dhikr
  'Join Challenge': 'Meydan Okumaya Katıl', 'Contribute': 'Katkıda Bulun',
  'Challenge Title': 'Meydan Okuma Başlığı', 'Phrase': 'İfade',
  'Target Total': 'Hedef Toplam',

  // Screen Time
  'Screen Time': 'Ekran Süresi', 'Daily Average': 'Günlük Ortalama',
  'Total Sessions': 'Toplam Oturum', 'Most Used Space': 'En Çok Kullanılan Alan',
  'Daily Breakdown': 'Günlük Dağılım',

  // Quiet Mode
  'Quiet Mode': 'Sessiz Mod', 'Schedule': 'Zamanlama',
  'End Time': 'Bitiş Saati',
  'Auto-reply Message': 'Otomatik Yanıt Mesajı',
  'Automatically enable during set hours': 'Belirlenen saatlerde otomatik etkinleştir',

  // Channel Trailer
  'Channel Trailer': 'Kanal Fragmanı', 'Current Trailer': 'Mevcut Fragman',
  'No trailer set': 'Fragman ayarlanmadı',
  "Non-subscribers will see this video on your channel": 'Abone olmayanlar kanalınızda bu videoyu görecek',

  // Channel
  "This channel may have been removed or doesn't exist": 'Bu kanal kaldırılmış veya mevcut değil',
  "This channel hasn't uploaded any videos": 'Bu kanal henüz video yüklememiş',
  'No playlists yet': 'Henüz oynatma listesi yok',
  "This channel hasn't created any playlists": 'Bu kanal henüz oynatma listesi oluşturmamış',
  'Joined': 'Katıldı',

  // Quran Room
  'Currently Reciting': 'Şu anda okuyor', 'Leave Room': 'Odadan Ayrıl',
  'Host Controls': 'Sunucu Kontrolleri',

  // Hajj
  'Duas & Supplications': 'Dualar ve Yakarışlar', 'Checklist': 'Kontrol Listesi',
  'Mark Step Complete': 'Adımı Tamamla',

  // DM Notes
  'DM Note': 'DM Notu', 'Expires in': 'Süre dolumu',
  '1 hour': '1 saat', '4 hours': '4 saat', '12 hours': '12 saat',

  // Downloads
  'Complete': 'Tamamlandı', 'Failed': 'Başarısız',
  'View Original': 'Orijinali Gör',

  // Clips
  'Creating clip...': 'Klip oluşturuluyor...',
  'View Full Video': 'Tam Videoyu İzle', 'Duration': 'Süre',

  // Nasheed
  'Nasheed Mode': 'İlahi Modu',
  'Music in reels and stories will be replaced with nasheeds when available': 'Mevcut olduğunda reellerdeki ve hikâyelerdeki müzik ilahilerle değiştirilecek',

  // Quran Plan
  'Choose Your Plan': 'Planınızı Seçin',
  '{{count}} pages/day': '{{count}} sayfa/gün',

  // Scholar
  'Scholar Verification': 'Âlim Doğrulama',
  'Institution / University': 'Kurum / Üniversite',

  // Content Filter
  'Relaxed': 'Rahat', 'Family': 'Aile',

  // Biometric
  'App Lock': 'Uygulama Kilidi', 'Face ID': 'Face ID',
  'Fingerprint': 'Parmak İzi', 'Test Authentication': 'Kimlik Doğrulamayı Test Et',
  'No biometrics enrolled. Set up Face ID or fingerprint in device settings.': 'Biyometrik kayıt yok. Cihaz ayarlarında Face ID veya parmak izi ayarlayın.',

  // Hide Reply
  'Unhide reply': 'Yanıtı göster', 'View hidden replies': 'Gizli yanıtları gör',
  'No hidden replies': 'Gizli yanıt yok',

  // Cross Post
  'Cross-post': 'Çapraz Paylaşım',
  'Majlis (Threads)': 'Meclis (Gönderi Dizileri)',

  // Collab Playlist
  'Collaborative Playlist': 'İşbirlikçi Oynatma Listesi',
  "Let others add videos to this playlist": 'Başkalarının bu oynatma listesine video eklemesine izin ver',

  // Share Receive
  'Saf — Photo & Feed': 'Saf — Fotoğraf ve Akış',
  'Bakra — Short Video': 'Bakra — Kısa Video',

  // Widgets
  'Add widgets from your home screen': 'Ana ekranınızdan widget ekleyin',
  '{{minutes}} min': '{{minutes}} dk',

  // Edit Profile
  'URL (https://...)': 'URL (https://...)',

  // Create Video
  'Consistent volume levels': 'Tutarlı ses seviyeleri',

  // Qibla
  'You are facing the Qibla': 'Kıbleye dönüksünüz',

  // Eid Cards
  'Choose Occasion': 'Vesile Seçin',

  // Tafsir
  'Tafsir not available for this verse': 'Bu ayet için tefsir mevcut değil',

  // Undo Send
  'Undo': 'Geri Al',

  // Mute Conversation
  "You won't receive notifications for this conversation": 'Bu sohbet için bildirim almayacaksınız',

  // Mini Player
  'Swipe down to dismiss': 'Kapatmak için aşağı kaydırın',

  // Screens section - big batch
  'Explore Hashtags': 'Hashtagleri Keşfet',
  'Search hashtags...': 'Hashtag ara...',
  'Popular': 'Popüler', 'Recent': 'Son',
  'No trending hashtags': 'Trend hashtag yok',
  'Try searching for something else': 'Başka bir şey aramayı deneyin',
  'Check back later': 'Daha sonra tekrar kontrol edin',
  "Couldn't load hashtags": 'Hashtagler yüklenemedi',
  'Check your connection and try again': 'Bağlantınızı kontrol edin ve tekrar deneyin',
  'Search…': 'Ara…', 'Enter a search term': 'Arama terimi girin',
  'Type at least 2 characters': 'En az 2 karakter yazın',
  'People': 'Kişiler', 'Posts': 'Gönderiler', 'Threads': 'Gönderi Dizileri',
  'followers': 'takipçi', 'No people found': 'Kişi bulunamadı',
  'Try a different search term': 'Farklı bir arama terimi deneyin',
  'No posts found': 'Gönderi bulunamadı', 'No threads found': 'Gönderi dizisi bulunamadı',
  'No reels found': 'Reel bulunamadı', 'No hashtags found': 'Hashtag bulunamadı',
  'Search failed': 'Arama başarısız', 'Please try again': 'Lütfen tekrar deneyin',
  'Why are you reporting this {{type}}?': 'Bu {{type}} için neden şikâyet ediyorsunuz?',
  'Spam': 'Spam', 'Harassment': 'Taciz', 'Hate speech': 'Nefret söylemi',
  'Nudity': 'Müstehcenlik', 'Violence': 'Şiddet', 'Misinformation': 'Yanlış bilgi',
  'Impersonation': 'Kimliğe bürünme', 'Other': 'Diğer',
  'Additional details (optional)': 'Ek ayrıntılar (isteğe bağlı)',
  'Provide more information...': 'Daha fazla bilgi verin...',
  'Submit Report': 'Şikâyeti Gönder', 'Please select a reason': 'Lütfen bir neden seçin',
  'Report Submitted': 'Şikâyet Gönderildi',
  'Thank you. We will review this content.': 'Teşekkürler. Bu içeriği inceleyeceğiz.',
  'Playlist': 'Oynatma Listesi', 'Playlist not found': 'Oynatma listesi bulunamadı',
  'video': 'video', 'videos': 'video',
  'No videos yet': 'Henüz video yok',
  'Videos added to this playlist will appear here': 'Bu oynatma listesine eklenen videolar burada görünecek',
  'Something went wrong': 'Bir hata oluştu',
  'Could not load playlist. Please try again.': 'Oynatma listesi yüklenemedi. Lütfen tekrar deneyin.',
  'Go back': 'Geri Dön', 'Please pull to refresh': 'Yenilemek için çekin',
  'Could not load videos': 'Videolar yüklenemedi',
  'Saved': 'Kaydedilenler', 'No saved posts': 'Kaydedilen gönderi yok',
  'Posts you save will appear here': 'Kaydettiğiniz gönderiler burada görünecek',
  'No saved videos': 'Kaydedilen video yok',
  'Videos you save will appear here': 'Kaydettiğiniz videolar burada görünecek',
  'No saved reels': 'Kaydedilen reel yok',
  'No saved threads': 'Kaydedilen gönderi dizisi yok',
  'Blocked': 'Engellendi', 'No blocked accounts': 'Engellenen hesap yok',
  'Accounts you block will appear here': 'Engellediğiniz hesaplar burada görünecek',
  'Muted': 'Sessize Alındı', 'No muted accounts': 'Sessize alınan hesap yok',
  'Accounts you mute will appear here': 'Sessize aldığınız hesaplar burada görünecek',
  'Restricted': 'Kısıtlandı', 'No restricted accounts': 'Kısıtlanan hesap yok',
  'Accounts you restrict will appear here': 'Kısıtladığınız hesaplar burada görünecek',
  'Mosques': 'Camiler', 'No mosques found': 'Cami bulunamadı',
  'Starred Messages': 'Yıldızlanan Mesajlar',
  'No starred messages': 'Yıldızlanan mesaj yok',
  'Your starred messages will appear here': 'Yıldızlanan mesajlarınız burada görünecek',
  'Pinned Messages': 'Sabitlenmiş Mesajlar', 'No pinned messages': 'Sabitlenmiş mesaj yok',
  'Call History': 'Arama Geçmişi', 'No calls yet': 'Henüz arama yok',
  'Broadcast Channels': 'Yayın Kanalları', 'No broadcast channels': 'Yayın kanalı yok',
  'Close Friends': 'Yakın Arkadaşlar', 'No close friends added': 'Yakın arkadaş eklenmedi',
  'Circles': 'Çevreler', 'Your Circles': 'Çevreleriniz',
  'Follow Requests': 'Takip İstekleri', 'No requests': 'İstek yok',
  'Followed Topics': 'Takip Edilen Konular',
  'Drafts': 'Taslaklar', 'No drafts': 'Taslak yok',
  'Archive': 'Arşiv', 'No archived posts': 'Arşivlenmiş gönderi yok',
  'Posts you archive will appear here': 'Arşivlediğiniz gönderiler burada görünecek',
  'Blocked Keywords': 'Engellenen Anahtar Kelimeler',
  'No blocked keywords': 'Engellenen anahtar kelime yok',
  'My Reports': 'Şikâyetlerim', 'Your reports': 'Şikâyetleriniz',
  'No reports': 'Şikâyet yok',
  'No watch history': 'İzleme geçmişi yok',
  'Watch history empty': 'İzleme geçmişi boş',
  'Your watch history will appear here': 'İzleme geçmişiniz burada görünecek',
  'Watch history cleared': 'İzleme geçmişi temizlendi',
  'Clear Watch History': 'İzleme Geçmişini Temizle',
  'Downloads': 'İndirilenler', 'No downloads yet': 'Henüz indirme yok',
  'Bookmark Collections': 'Yer İşareti Koleksiyonları',
  'Bookmark Folders': 'Yer İşareti Klasörleri',
  'No bookmarks': 'Yer işareti yok',
  'Analytics': 'Analitik', 'Creator Dashboard': 'İçerik Üretici Paneli',
  'Majlis Lists': 'Meclis Listeleri', 'My Lists': 'Listelerim',
  'No lists yet': 'Henüz liste yok',
  'Your lists will appear here': 'Listeleriniz burada görünecek',
  'Audio Library': 'Ses Kütüphanesi', 'Audio Rooms': 'Sesli Odalar',
  'Audio Space': 'Sesli Alan',
  'Mutual Followers': 'Ortak Takipçiler', 'No mutual followers': 'Ortak takipçi yok',
  'Contact Sync': 'Kişi Senkronizasyonu', 'Find Friends': 'Arkadaşları Bul',
  'QR Code': 'QR Kod', 'Scan QR Code': 'QR Kod Tara',
  'Share Profile': 'Profili Paylaş',

  // Misc remaining
  '{{count}} days': '{{count}} gün', '{{count}} followers': '{{count}} takipçi',
  '{{count}} follower': '{{count}} takipçi', '{{count}} participants': '{{count}} katılımcı',
  '{{count}} members': '{{count}} üye', '{{count}} listeners': '{{count}} dinleyici',
  '{{count}} videos': '{{count}} video', '{{count}} reviews': '{{count}} değerlendirme',
  '{{count}} days left': '{{count}} gün kaldı', '{{count}} selected': '{{count}} seçildi',
  '(need {{count}} more)': '({{count}} daha gerekli)',
  '{{count}}h': '{{count}}sa', '{{count}}m': '{{count}}dk',
  "View {{name}}'s profile": '{{name}} profilini gör',
  'No followers yet': 'Henüz takipçi yok',
  'Share your profile to grow your community': 'Topluluğunuzu büyütmek için profilinizi paylaşın',
  'Not following anyone yet': 'Henüz kimseyi takip etmiyor',
  'Explore and follow people who inspire you': 'Sizi ilham veren kişileri keşfedin ve takip edin',
  'Saved Messages': 'Kaydedilmiş Mesajlar', 'No saved messages': 'Kaydedilmiş mesaj yok',
  'Forward messages here or type a note below': 'Mesajları buraya iletin veya aşağıya bir not yazın',
  'Search saved messages...': 'Kaydedilmiş mesajları ara...',
  'Type a note...': 'Bir not yazın...',
  'Edit Folder': 'Klasörü Düzenle', 'Delete Folder': 'Klasörü Sil',
  'Delete for Everyone': 'Herkes İçin Sil',
  'Saved Messages': 'Kaydedilmiş Mesajlar',
  'episodes': 'bölüm', 'days': 'gün', 'hours': 'saat', 'minutes': 'dakika',
  'seconds': 'saniye', 'weeks': 'hafta', 'months': 'ay', 'years': 'yıl',
  'posts': 'gönderi', 'reels': 'reel', 'stickers': 'çıkartma',
  'members': 'üye', 'online': 'çevrimiçi', 'watching': 'izliyor',
  'pending': 'beklemede', 'delivered': 'teslim edildi', 'sent': 'gönderildi',
  'seen': 'görüldü', 'encrypted': 'şifreli', 'failed': 'başarısız',
  'downloads': 'indirme', 'plays': 'oynatma',
  'Majlis — Discussion': 'Meclis — Tartışma',
  'Minbar — Long Video': 'Minber — Uzun Video',
  'Bakra (Reels)': 'Bakra (Reels)',
  'EID': 'EID', 'EVENT': 'ETKİNLİK', 'LIVE': 'CANLI',
};

// Apply
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

// Count
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

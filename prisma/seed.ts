import "dotenv/config";
import { createHash } from "node:crypto";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { env } from "../src/config/env.js";

const prisma = new PrismaClient();
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

function withUtcTime(date: Date, hours: number, minutes = 0) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hours, minutes, 0));
}

function parseSeedDate(value: string, endOfDay = false) {
  const [day, month, year] = value.split("/").map(Number);
  return new Date(Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0));
}

function requireSupabaseConfig() {
  if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
    throw new Error("SUPABASE_STORAGE_NOT_CONFIGURED");
  }
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getFileExtensionFromUrl(imageUrl: string) {
  const pathname = new URL(imageUrl).pathname;
  const ext = path.extname(pathname).replace(".", "").toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  return "jpg";
}

async function fetchImageBuffer(imageUrl: string) {
  const maxAttempts = 3;
  let lastErr: any = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(imageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          Accept: "image/*,*/*;q=0.8",
        },
      });
      if (!response.ok) throw new Error(`FAILED_TO_DOWNLOAD_IMAGE:${imageUrl}`);
      const arrayBuffer = await response.arrayBuffer();
      const contentType = response.headers.get("content-type") ?? "image/jpeg";
      return { contentType, fileBuffer: Buffer.from(arrayBuffer) };
    } catch (err: any) {
      lastErr = err;
      const wait = attempt * 500;
      console.warn(`Retry ${attempt}/${maxAttempts} for ${imageUrl} after ${wait}ms: ${err?.message ?? err}`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw lastErr ?? new Error(`FAILED_TO_DOWNLOAD_IMAGE:${imageUrl}`);
}

async function uploadSeedImage(params: {
  storage: any; bucket: string; objectPath: string; imageUrl: string;
}) {
  if (process.env.SEED_SKIP_IMAGE_UPLOAD === "1") {
    return params.imageUrl;
  }

  try {
    const { contentType, fileBuffer } = await fetchImageBuffer(params.imageUrl);

    const { error } = await params.storage.storage
      .from(params.bucket)
      .upload(params.objectPath, fileBuffer, { contentType, upsert: false });
    if (error) {
      console.warn(`Warning: failed to upload image ${params.imageUrl}: ${error.message}`);
      return params.imageUrl;
    }
    const { data } = params.storage.storage.from(params.bucket).getPublicUrl(params.objectPath);
    return data.publicUrl ?? params.imageUrl;
  } catch (err: any) {
    console.warn(`Warning: failed to process image ${params.imageUrl}: ${err?.message ?? err}`);
    return params.imageUrl;
  }
}

async function uploadSeedImages(params: {
  storage: any; bucket: string; prefix: string; imageUrls: string[];
}) {
  const results: string[] = [];
  for (const imageUrl of params.imageUrls) {
    const objectPath = buildSeedObjectPath(params.prefix, imageUrl);
    const publicUrl = await uploadSeedImage({ storage: params.storage, bucket: params.bucket, objectPath, imageUrl });
    results.push(publicUrl);
  }
  return results;
}

function buildSeedObjectPath(prefix: string, sourceUrl: string) {
  return `${prefix}/${createHash("sha1").update(sourceUrl).digest("hex")}.${getFileExtensionFromUrl(sourceUrl)}`;
}

// ─── USERS ────────────────────────────────────────────────────────────────────
const USERS_DATA = [
  { email: "demo@example.com",         fullName: "Alex Johnson",      username: "alex_love_travel",  location: "Hà Nội, Việt Nam",       avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&h=150&fit=crop&crop=face", role: "TRAVELER" as const },
  { email: "minh.nguyen@example.com",  fullName: "Nguyễn Văn Minh",  username: "minh_kham_pha",     location: "Hồ Chí Minh, Việt Nam",  avatarUrl: "https://images.unsplash.com/photo-1527980965255-d3b416303d12?w=150&h=150&fit=crop&crop=face", role: "TRAVELER" as const },
  { email: "linh.tran@example.com",    fullName: "Trần Thị Linh",    username: "linh_wanderlust",   location: "Đà Nẵng, Việt Nam",      avatarUrl: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face", role: "TRAVELER" as const },
  { email: "hung.le@example.com",      fullName: "Lê Văn Hùng",      username: "hung_photo_travel", location: "Huế, Việt Nam",           avatarUrl: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face", role: "TRAVELER" as const },
  { email: "mai.pham@example.com",     fullName: "Phạm Thị Mai",     username: "mai_dulich_viet",   location: "Hội An, Việt Nam",        avatarUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=face", role: "TRAVELER" as const },
  { email: "tuan.do@example.com",      fullName: "Đỗ Quốc Tuấn",     username: "tuan_backpacker",   location: "Cần Thơ, Việt Nam",       avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&h=150&fit=crop&crop=face", role: "TRAVELER" as const },
  { email: "hoa.vu@example.com",       fullName: "Vũ Thị Hoa",       username: "hoa_travelblog",    location: "Nha Trang, Việt Nam",     avatarUrl: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=150&h=150&fit=crop&crop=face", role: "TRAVELER" as const },
  { email: "nam.bui@example.com",      fullName: "Bùi Thanh Nam",     username: "nam_explorer",      location: "Hà Giang, Việt Nam",      avatarUrl: "https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=150&h=150&fit=crop&crop=face", role: "TRAVELER" as const },
  { email: "thu.hoang@example.com",    fullName: "Hoàng Minh Thu",   username: "thu_adventurer",    location: "Đà Lạt, Việt Nam",        avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face", role: "TRAVELER" as const },
  { email: "owner@example.com",        fullName: "Owner Demo",        username: "owner_demo",        location: "Hà Nội, Việt Nam",        avatarUrl: "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&h=150&fit=crop&crop=face", role: "OWNER"    as const },
  { email: "owner2@example.com",       fullName: "Second Owner Demo", username: "owner_two_demo",    location: "Đà Nẵng, Việt Nam",       avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face", role: "OWNER"    as const },
  { email: "admin@example.com",        fullName: "Admin Demo",        username: "admin_demo",        location: "Hà Nội, Việt Nam",        avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&h=150&fit=crop&crop=face", role: "ADMIN"    as const, password: "admin1234" },
];

const REMOVED_USER_EMAILS = new Set([
  "nam.bui@example.com",
  "thu.hoang@example.com",
]);

const SEEDED_USERS_DATA = USERS_DATA.filter((user) => !REMOVED_USER_EMAILS.has(user.email));

// ─── PLACES ───────────────────────────────────────────────────────────────────
// All image IDs verified from Unsplash search results.
// URL format: https://images.unsplash.com/photo-{ID}?w=1200&q=80
const PLACES_DATA = [

  // ══════════════════════════════════════════════════════════════
  // ATTRACTIONS
  // ══════════════════════════════════════════════════════════════
  {
    name: "Vịnh Hạ Long",
    region: "Quảng Ninh, Việt Nam",
    category: "ATTRACTIONS" as const,
    featureLabel: "Kỳ quan thế giới",
    averageRating: 4.9, ratingCount: 3200, priceLevel: 150000,
    latitude: 20.9101, longitude: 107.1839,
    about: "Vịnh Hạ Long là một trong những kỳ quan thiên nhiên thế giới, nổi tiếng với hàng nghìn đảo đá vôi nhô lên giữa làn nước xanh ngọc bích. Đây là điểm đến không thể bỏ qua khi đến Việt Nam.",
    // Long Nguyễn – large body of water surrounded by mountains, Halong Bay (Unsplash)
    // allPhoto Bangkok – water with limestone karst islands, Halong Bay (Unsplash)
    // Fuu J – boats at sunset, Ha Long Bay (Unsplash)
    // digitalarbyter – calm body of water near limestone mountains, Halong Bay (Unsplash)
    images: [
      "https://images.unsplash.com/photo-1634951412593-b2cdca1ae519?w=1200&q=80",
      "https://images.unsplash.com/photo-1669819894338-53ab7afc6958?w=1200&q=80",
      "https://images.unsplash.com/photo-1668000018482-a02acf02b22a?w=1200&q=80",
      "https://images.unsplash.com/photo-1561461221-959c3f16234b?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 0, rating: 5, content: "Cảnh đẹp như tranh vẽ! Chuyến du thuyền qua vịnh lúc hoàng hôn là trải nghiệm không bao giờ quên được. Nước biển trong xanh tuyệt vời." },
      { userIdx: 1, rating: 5, content: "Hạ Long xứng đáng là kỳ quan thế giới. Tôi đã đến nhiều nơi nhưng đây thực sự là một trong những nơi đẹp nhất tôi từng thấy." },
      { userIdx: 2, rating: 4, content: "Rất đẹp nhưng khá đông khách vào mùa hè. Nên đi vào mùa thu để tránh đám đông và thời tiết dễ chịu hơn." },
      { userIdx: 3, rating: 5, content: "Hang Sửng Sốt và hang Đầu Gỗ đều ấn tượng. Hướng dẫn viên rất nhiệt tình và am hiểu lịch sử." },
      { userIdx: 4, rating: 5, content: "Đi kayak qua các hang động là điều tôi thích nhất. Thiên nhiên hùng vĩ, không khí trong lành." },
    ],
  },

  {
    name: "Phố Cổ Hội An",
    region: "Quảng Nam, Việt Nam",
    category: "ATTRACTIONS" as const,
    featureLabel: "Di sản UNESCO",
    averageRating: 4.8, ratingCount: 2850, priceLevel: 50000,
    latitude: 15.8801, longitude: 108.3380,
    about: "Phố cổ Hội An là một trong những đô thị cổ được bảo tồn nguyên vẹn nhất Đông Nam Á, được UNESCO công nhận là di sản văn hóa thế giới. Những con đường lát đá, đèn lồng rực rỡ và kiến trúc cổ kính tạo nên vẻ đẹp đặc trưng.",
    // Hoang Hung – room filled with lit lanterns, Hoi An Ancient Town (Unsplash)
    // Natalie – red and gold Chinese lanterns street, Hội An (Unsplash)
    // Daniele Franchi – people on bridge lit with lanterns at night, Hoi An (Unsplash)
    images: [
      "https://images.unsplash.com/photo-1639458110591-17c4cede0c4b?w=1200&q=80",
      "https://images.unsplash.com/photo-1597849188171-cb17444df6e6?w=1200&q=80",
      "https://images.unsplash.com/photo-1741274236412-b6760ff6c01b?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 1, rating: 5, content: "Hội An về đêm lung linh ánh đèn lồng thật sự ma mị và lãng mạn. Tôi đã dành 3 ngày ở đây mà vẫn chưa muốn về." },
      { userIdx: 2, rating: 5, content: "Ẩm thực Hội An tuyệt vời, từ cao lầu đến cơm gà đều ngon hết chỗ chê. Giá cả phải chăng." },
      { userIdx: 3, rating: 4, content: "Kiến trúc độc đáo, không khí yên bình. Nhớ mặc áo dài chụp ảnh ở chùa Cầu nhé!" },
      { userIdx: 5, rating: 5, content: "Phố cổ Hội An đẹp nhất vào buổi sáng sớm khi chưa có nhiều khách. Đường phố sạch sẽ, người dân thân thiện." },
      { userIdx: 6, rating: 4, content: "May mắn được trải nghiệm lớp học nấu ăn Hội An truyền thống. Rất vui và bổ ích!" },
      { userIdx: 6, rating: 2, content: "Trải nghiệm không như mong đợi, dịch vụ hơi chậm và thông tin tại chỗ chưa rõ ràng." },
      { userIdx: 7, rating: 1, content: "Không hài lòng với chuyến tham quan này, khu vực đông đúc và chất lượng chưa xứng với giá." },
    ],
  },

  {
    name: "Kinh Thành Huế",
    region: "Thừa Thiên Huế, Việt Nam",
    category: "ATTRACTIONS" as const,
    featureLabel: "Di sản lịch sử",
    averageRating: 4.7, ratingCount: 1950, priceLevel: 80000,
    latitude: 16.4637, longitude: 107.5909,
    about: "Kinh thành Huế là quần thể di tích kiến trúc hoàng gia của nhà Nguyễn, được UNESCO công nhận là di sản thế giới. Những cung điện, lăng tẩm và đền đài tráng lệ phản ánh đỉnh cao nghệ thuật kiến trúc Việt Nam.",
    // Kha Vo – Imperial City of Hue dynasty (verified Unsplash)
    // Pew Nguyen – Hue palace arch corridor (verified Unsplash)
    // Gian-Reto Tarnutzer – Hue Vietnam outdoors garden (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1600101058355-85be45c79db1?w=1200&q=80",
      "https://images.unsplash.com/photo-1601581975053-7c899da7347e?w=1200&q=80",
      "https://images.unsplash.com/photo-1599707367072-cd6ada2bc375?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 0, rating: 5, content: "Kinh thành Huế mang lại cảm giác như đang bước vào lịch sử. Đại Nội thật hoành tráng và uy nghi." },
      { userIdx: 3, rating: 4, content: "Nên thuê xe đạp để tham quan các lăng tẩm. Lăng Tự Đức và Lăng Minh Mạng đều rất đẹp." },
      { userIdx: 7, rating: 5, content: "Ẩm thực cung đình Huế là trải nghiệm khó quên. Bún bò Huế ở đây ngon hơn bất kỳ nơi nào khác." },
      { userIdx: 8, rating: 4, content: "Sông Hương thơ mộng, nghe ca Huế trên thuyền dưới ánh trăng rất tuyệt vời." },
      { userIdx: 4, rating: 5, content: "Cầu Trường Tiền ban đêm lên đèn lung linh. Người dân Huế rất hiếu khách và thân thiện." },
      { userIdx: 6, rating: 2, content: "Trải nghiệm không như mong đợi, dịch vụ hơi chậm và thông tin tại chỗ chưa rõ ràng." },
      { userIdx: 7, rating: 1, content: "Không hài lòng với chuyến tham quan này, khu vực đông đúc và chất lượng chưa xứng với giá." },
    ],
  },

  {
    name: "Cao Nguyên Đá Đồng Văn",
    region: "Hà Giang, Việt Nam",
    category: "ATTRACTIONS" as const,
    featureLabel: "Công viên địa chất UNESCO",
    averageRating: 4.9, ratingCount: 1200, priceLevel: 90000,
    latitude: 23.2742, longitude: 105.3674,
    about: "Cao nguyên đá Đồng Văn là công viên địa chất toàn cầu đầu tiên của Việt Nam được UNESCO công nhận. Những tầng đá vôi dựng đứng, thung lũng sâu thẳm và bản làng dân tộc Mông tạo nên cảnh sắc hùng vĩ độc nhất.",
    // Ryan Le – scenic view of mountains and a road, Ha Giang Vietnam (Unsplash)
    // Dang Cong – Ma Pi Leng Mountain Pass, sun over Ha Giang mountains (Unsplash)
    // Chang Duong – mountains with fog, Ha Giang Vietnam (Unsplash)
    images: [
      "https://images.unsplash.com/photo-1685584280839-a51ba5a1908d?w=1200&q=80",
      "https://images.unsplash.com/photo-1728613902676-1d8b4e10eee5?w=1200&q=80",
      "https://images.unsplash.com/photo-1509588418781-8d5635698fd7?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 7, rating: 5, content: "Đường đèo Mã Pí Lèng là một trong tứ đại đỉnh đèo của Việt Nam. Cảnh vật ngoạn mục đến mức khó tin." },
      { userIdx: 0, rating: 5, content: "Phiên chợ vùng cao Đồng Văn rất sắc màu và đặc sắc. Gặp gỡ bà con dân tộc Mông rất thú vị." },
      { userIdx: 5, rating: 4, content: "Nên đi vào tháng 10-11 để ngắm hoa tam giác mạch nở rộ trên cao nguyên, đẹp như thiên đường." },
      { userIdx: 6, rating: 5, content: "Cột cờ Lũng Cú ở điểm cực bắc Tổ quốc - một điểm check-in mang ý nghĩa đặc biệt." },
      { userIdx: 1, rating: 5, content: "Đây là chuyến đi để đời của tôi. Phong cảnh hùng vĩ, văn hóa phong phú, con người chất phác." },
    ],
  },

  {
    name: "Ruộng Bậc Thang Mù Cang Chải",
    region: "Yên Bái, Việt Nam",
    category: "ATTRACTIONS" as const,
    featureLabel: "Mùa vàng tháng 9",
    averageRating: 4.8, ratingCount: 980, priceLevel: 70000,
    latitude: 21.8174, longitude: 104.0944,
    about: "Ruộng bậc thang Mù Cang Chải được xếp hạng di tích quốc gia, nổi tiếng với những thửa ruộng vàng rực óng ả vào mùa lúa chín. Đây là tác phẩm nghệ thuật của đồng bào Mông được tạo ra qua nhiều thế hệ.",
    // Tom De Decker – Mu Cang Chai terraced rice fields green mist (verified Unsplash, Aug 2025)
    // Tom De Decker – Mu Cang Chai terraced rice cascade (verified Unsplash, Aug 2025)
    // Sergey Sukhov – view of rice field from hill, Mu Cang Chai (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1722521191552-655f66d49cad?w=1200&q=80",
      "https://images.unsplash.com/photo-1722521191378-b57efeb3f6a2?w=1200&q=80",
      "https://images.unsplash.com/photo-1672796580017-6f28b3f82ba0?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 8, rating: 5, content: "Đến vào tháng 9 khi lúa chín vàng, cảnh đẹp hơn mọi bức ảnh tôi từng thấy. Đỉnh La Pán Tẩn nhìn xuống tuyệt vời." },
      { userIdx: 2, rating: 5, content: "Máy ảnh không đủ để lưu hết vẻ đẹp nơi này. Những thửa ruộng vàng lấp lánh dưới ánh mặt trời." },
      { userIdx: 4, rating: 4, content: "Đường đến khá khó, nhưng hoàn toàn xứng đáng. Trải nghiệm cùng người dân địa phương gặt lúa rất ý nghĩa." },
      { userIdx: 3, rating: 5, content: "Bình yên và nguyên sơ. Tôi sẽ quay lại đây vào mùa nước đổ để thấy ruộng xanh mướt phản chiếu trời." },
      { userIdx: 7, rating: 5, content: "Mù Cang Chải - một trong những nơi đẹp nhất Tây Bắc. Đặc biệt ấn tượng khi ngắm từ trên cao." },
    ],
  },

  {
    name: "Phong Nha - Kẻ Bàng",
    region: "Quảng Bình, Việt Nam",
    category: "ATTRACTIONS" as const,
    featureLabel: "Hang động kỳ vĩ",
    averageRating: 4.9, ratingCount: 1650, priceLevel: 120000,
    latitude: 17.5439, longitude: 106.1308,
    about: "Vườn quốc gia Phong Nha - Kẻ Bàng là Di sản thiên nhiên thế giới, nơi có hệ thống hang động lớn nhất thế giới bao gồm hang Sơn Đoòng - hang động lớn nhất trên Trái Đất.",
    // Phạm Mạnh – Phong Nha cave tunnel light (verified Unsplash, Jun 2024)
    // Jeppe H. Jensen – cave dark rock spikes Phong Nha (verified Unsplash)
    // Phạm Mạnh – Phong Nha cave entrance boat (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1719461208300-e9d199bc59f7?w=1200&q=80",
      "https://images.unsplash.com/photo-1554285859-6ac081ea54b9?w=1200&q=80",
      "https://images.unsplash.com/photo-1719408751209-c8e1d7b5e96d?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 1, rating: 5, content: "Hang Phong Nha kỳ vĩ đến mức tôi không có từ nào để diễn tả. Thạch nhũ triệu năm tuổi lung linh trong ánh sáng." },
      { userIdx: 6, rating: 5, content: "Hang Thiên Đường mới thực sự là thiên đường. Dài 31km với những hình thù thạch nhũ độc đáo." },
      { userIdx: 3, rating: 5, content: "Đi thuyền vào hang Phong Nha buổi sáng sớm, ánh sáng lọt qua rất đẹp. Trải nghiệm không nơi nào có." },
      { userIdx: 0, rating: 4, content: "Cần đặt tour trước vì vé thường hết sớm. Hang động ở đây nhiều và mỗi cái đều có vẻ đẹp riêng." },
      { userIdx: 5, rating: 5, content: "Chèo kayak trong hang tối và bơi ở hồ ngầm là trải nghiệm phiêu lưu nhất trong đời tôi." },
    ],
  },

  {
    name: "Sapa - Đỉnh Fansipan",
    region: "Lào Cai, Việt Nam",
    category: "ATTRACTIONS" as const,
    featureLabel: "Nóc nhà Đông Dương",
    averageRating: 4.7, ratingCount: 2100, priceLevel: 110000,
    latitude: 22.3363, longitude: 103.8440,
    about: "Sapa là thị trấn miền núi nơi có đỉnh Fansipan cao nhất Đông Dương (3143m). Ruộng bậc thang, mây mù và văn hóa các dân tộc thiểu số tạo nên sức hút đặc biệt của vùng đất này.",
    // Huy Nguyen – golden rice terraces hillside Sapa Vietnam (verified Unsplash, Sep 2025)
    // Wietse Jongsma – terraced rice fields valley Sapa (verified Unsplash, Jul 2025)
    // Vivu Vietnam – Fansipan Buddha statue summit Sapa (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1726482773819-e2e7ee3bd8a2?w=1200&q=80",
      "https://images.unsplash.com/photo-1721383867831-af80c6a4e9c5?w=1200&q=80",
      "https://images.unsplash.com/photo-1694083151781-946334842033?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 4, rating: 5, content: "Leo Fansipan bằng cáp treo rồi đứng trên đỉnh cao nhất Đông Dương - cảm giác chinh phục tuyệt vời." },
      { userIdx: 8, rating: 4, content: "Bản Cát Cát của người Mông rất đặc sắc. Nhớ mua khăn thổ cẩm về làm quà." },
      { userIdx: 2, rating: 5, content: "Sapa về mùa đông phủ sương mù và rất lạnh nhưng cảnh đẹp như cổ tích. Đặc biệt thích cà phê trứng bên lò sưởi." },
      { userIdx: 7, rating: 4, content: "Trekking qua các bản làng của người H'Mông và Dao Đỏ là trải nghiệm văn hóa tuyệt vời." },
      { userIdx: 0, rating: 5, content: "Ruộng bậc thang Sapa vào mùa lúa xanh đẹp không kém Mù Cang Chải. Không khí trong lành, mát mẻ." },
      { userIdx: 6, rating: 2, content: "Trải nghiệm không như mong đợi, dịch vụ hơi chậm và thông tin tại chỗ chưa rõ ràng." },
      { userIdx: 7, rating: 1, content: "Không hài lòng với chuyến tham quan này, khu vực đông đúc và chất lượng chưa xứng với giá." },
    ],
  },

  {
    name: "Đảo Phú Quốc",
    region: "Kiên Giang, Việt Nam",
    category: "ATTRACTIONS" as const,
    featureLabel: "Đảo Ngọc",
    averageRating: 4.8, ratingCount: 2700, priceLevel: 200000,
    latitude: 10.2899, longitude: 103.9840,
    about: "Phú Quốc là hòn đảo lớn nhất Việt Nam với những bãi biển cát trắng mịn màng, làn nước trong vắt và rừng nguyên sinh. Đảo ngọc này đang trở thành điểm đến quốc tế hàng đầu Đông Nam Á.",
    // Lily Tran – beach pier palm trees, Phu Quoc Vietnam (verified Unsplash)
    // OnBird Phu Quoc – fishing boat ocean sunset, Phu Quoc Island (verified Unsplash)
    // Vivu Vietnam – crowd Kiss The Stars show, Sunset Town Phu Quoc (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1641810684286-0eb336c707c2?w=1200&q=80",
      "https://images.unsplash.com/photo-1634043270873-f2f830e5d4bf?w=1200&q=80",
      "https://images.unsplash.com/photo-1693294601964-01ad83244d3e?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 5, rating: 5, content: "Bãi Sao là một trong những bãi biển đẹp nhất tôi từng thấy. Nước trong đến mức nhìn thấy đáy, cát trắng mịn như bột." },
      { userIdx: 7, rating: 5, content: "Lặn ngắm san hô ở Phú Quốc không thua gì Maldives. Hệ sinh thái biển phong phú và đa dạng." },
      { userIdx: 1, rating: 4, content: "Chợ đêm Phú Quốc đa dạng hải sản tươi sống. Nhớ thử nước mắm Phú Quốc chính gốc về làm quà." },
      { userIdx: 3, rating: 5, content: "Cáp treo Hòn Thơm dài nhất thế giới, nhìn xuống đảo và biển xanh rất ngoạn mục." },
      { userIdx: 8, rating: 5, content: "Resort ở đây chất lượng nhưng giá cũng cao. Nên đặt phòng trước ít nhất 1 tháng vào mùa cao điểm." },
      { userIdx: 6, rating: 2, content: "Trải nghiệm không như mong đợi, dịch vụ hơi chậm và thông tin tại chỗ chưa rõ ràng." },
      { userIdx: 7, rating: 1, content: "Không hài lòng với chuyến tham quan này, khu vực đông đúc và chất lượng chưa xứng với giá." },
    ],
  },

  {
    name: "Mũi Né - Đồi Cát Bay",
    region: "Bình Thuận, Việt Nam",
    category: "ATTRACTIONS" as const,
    featureLabel: "Sa mạc Việt Nam",
    averageRating: 4.6, ratingCount: 1400, priceLevel: 85000,
    latitude: 10.9340, longitude: 108.2898,
    about: "Mũi Né nổi tiếng với những đồi cát trắng và đỏ độc đáo hiếm gặp ở Đông Nam Á, cùng bãi biển dài xanh biếc. Đây là thiên đường của các môn thể thao biển như lướt ván diều và lướt sóng.",
    // Anton Shuvalov – aerial view fishing village near ocean, Mui Ne (verified Unsplash)
    // Duy Son – person on sand dunes desert, Binh Thuan Vietnam (verified Unsplash)
    // top Mui Ne search – fishing boats Mui Ne coast (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1560850038-f95de6e715b3?w=1200&q=80",
      "https://images.unsplash.com/photo-1545586788-29f76d80cf95?w=1200&q=80",
      "https://images.unsplash.com/photo-1587890799275-ba5614bf3d2b?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 6, rating: 5, content: "Trượt cát trên đồi cát đỏ lúc hoàng hôn - một trong những trải nghiệm vui nhất của tôi ở Việt Nam." },
      { userIdx: 2, rating: 4, content: "Biển Mũi Né trong xanh, sóng lớn thích hợp cho lướt ván. Đồi cát trắng thì chụp ảnh đẹp hơn." },
      { userIdx: 4, rating: 5, content: "Suối Tiên đầy màu sắc kỳ lạ là điểm thú vị không ngờ. Kem bơ ở đây ngon nổi tiếng cả vùng." },
      { userIdx: 0, rating: 4, content: "Thời điểm đẹp nhất là sáng sớm khi nắng vừa lên, ánh sáng vàng trên đồi cát rất nhiếp ảnh." },
    ],
  },

  {
    name: "Hồ Tây & Đền Quán Thánh",
    region: "Hà Nội, Việt Nam",
    category: "ATTRACTIONS" as const,
    featureLabel: "Biểu tượng Hà Nội",
    averageRating: 4.5, ratingCount: 1100, priceLevel: 30000,
    latitude: 21.0548, longitude: 105.8168,
    about: "Hồ Tây là hồ nước ngọt tự nhiên lớn nhất Hà Nội, bao quanh bởi những ngôi đền cổ kính và hàng cây rủ bóng. Đây là lá phổi xanh của thủ đô và là nơi lý tưởng để thư giãn.",
    // Quang Pham Duy – Tran Quoc Pagoda West Lake Hanoi (verified Unsplash)
    // Manh Nghiem – boat on West Lake sunset, Hanoi Vietnam (verified Unsplash)
    // Hoach Le Dinh – brown boat Hanoi river Vietnam (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1599708153386-62bf3f035c78?w=1200&q=80",
      "https://images.unsplash.com/photo-1530078436759-5917d8260272?w=1200&q=80",
      "https://images.unsplash.com/photo-1630842855767-9d9964261fb6?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 1, rating: 4, content: "Buổi sáng đạp xe quanh Hồ Tây rất thư thái. Ghé đền Quán Thánh cầu bình an rồi ăn bún ốc - tuyệt!" },
      { userIdx: 5, rating: 5, content: "Hoàng hôn trên Hồ Tây đẹp không thua kém gì. Ngồi café ven hồ nhìn ra mặt nước là trải nghiệm Hà Nội đích thực." },
      { userIdx: 3, rating: 4, content: "Đền Quán Thánh uy nghi, kiến trúc đặc sắc của đạo giáo Việt Nam. Nên đến vào buổi sáng sớm." },
      { userIdx: 8, rating: 5, content: "Khu vực Xuân Diệu ven Hồ Tây tập trung nhiều nhà hàng và café đẹp. Thích hợp cho buổi tối hẹn hò." },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // DINING
  // ══════════════════════════════════════════════════════════════
  {
    name: "Phở Thìn Lò Đúc",
    region: "Hà Nội, Việt Nam",
    category: "DINING" as const,
    featureLabel: "Huyền thoại 60 năm",
    averageRating: 4.8, ratingCount: 1800, priceLevel: 35000,
    latitude: 21.0245, longitude: 105.8412,
    about: "Phở Thìn Lò Đúc là huyền thoại ẩm thực Hà Nội tồn tại hơn 60 năm với công thức nấu nước dùng bí truyền. Phở bò tái lăn xào hành phi có hương vị đặc biệt khác hẳn các quán phở khác.",
    // Kirill Tonkikh – Pho Bo Vietnamese beef noodle soup top view (verified Unsplash)
    // Vy Huynh – Vietnam soup vietnamese food bun bo hue (verified Unsplash)
    // Lightscape – Vietnamese beef pho ramen bowl (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=1200&q=80",
      "https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=1200&q=80",
      "https://images.unsplash.com/photo-1557519125-47d43dc91c10?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 6, rating: 5, content: "Phở Thìn Lò Đúc - huyền thoại phở Hà Nội. Nước dùng trong vắt, ngọt thanh tự nhiên không bột ngọt." },
      { userIdx: 1, rating: 5, content: "Xếp hàng từ 5h30 sáng mà 6h đã ngồi ăn. Tô phở nóng hổi, thịt tươi - xứng đáng danh tiếng 60 năm." },
      { userIdx: 4, rating: 4, content: "Phở bò tái lăn xào hành phi - cách chế biến độc đáo không nơi nào có. Hành phi thơm cực kỳ." },
      { userIdx: 7, rating: 5, content: "Quán nhỏ, bàn ghế đơn giản nhưng vị phở thì siêu đỉnh. Đây mới là phở Hà Nội chính gốc." },
      { userIdx: 6, rating: 2, content: "Trải nghiệm không như mong đợi, dịch vụ hơi chậm và thông tin tại chỗ chưa rõ ràng." },
      { userIdx: 7, rating: 1, content: "Không hài lòng với chuyến tham quan này, khu vực đông đúc và chất lượng chưa xứng với giá." },
    ],
  },

  {
    name: "Bún Chả Hương Liên",
    region: "Hà Nội, Việt Nam",
    category: "DINING" as const,
    featureLabel: "Obama từng ghé",
    averageRating: 4.8, ratingCount: 1500, priceLevel: 25000,
    latitude: 21.0160, longitude: 105.8483,
    about: "Bún Chả Hương Liên nổi tiếng khắp thế giới sau khi được Tổng thống Obama và đầu bếp Anthony Bourdain ghé thăm năm 2016. Bún chả Hà Nội ở đây chuẩn vị nhất, phục vụ hơn 500 bát mỗi ngày.",
    // Anh Vy – street food Ho Chi Minh Vietnam (verified Unsplash)
    // Vy Huynh – Vietnam soup bowl beef noodle (verified Unsplash)
    // Quang Hoang – grilled meat black tray Vietnam (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1547592180-85f173990554?w=1200&q=80",
      "https://images.unsplash.com/photo-1634805009028-9437a1f95e28?w=1200&q=80",
      "https://images.unsplash.com/photo-1617196034183-421b4040ed20?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 3, rating: 5, content: "Bún chả Obama - tên gọi dân gian của quán. Chả nướng thơm, nước chấm ngọt thanh, nem rán giòn tan. Đỉnh!" },
      { userIdx: 7, rating: 5, content: "Xếp hàng 30 phút nhưng hoàn toàn xứng đáng. Đây là món bún chả ngon nhất tôi từng ăn trong 30 năm cuộc đời." },
      { userIdx: 1, rating: 4, content: "Quán đông nhưng phục vụ nhanh. Giá cả bình dân, một suất đầy đủ chỉ 50-70k đồng." },
      { userIdx: 5, rating: 5, content: "Đã thử nhiều quán bún chả Hà Nội nhưng Hương Liên vẫn là số 1. Nước chấm pha đúng tỷ lệ hoàn hảo." },
      { userIdx: 0, rating: 5, content: "Ngồi đúng cái bàn Obama từng ngồi, uống bia Hà Nội - khoảnh khắc rất đặc biệt cho tôi." },
    ],
  },

  {
    name: "Bánh Mì Phượng Hội An",
    region: "Quảng Nam, Việt Nam",
    category: "DINING" as const,
    featureLabel: "Ngon nhất thế giới",
    averageRating: 4.9, ratingCount: 2000, priceLevel: 15000,
    latitude: 15.8773, longitude: 108.3272,
    about: "Bánh Mì Phượng được Anthony Bourdain gọi là bánh mì ngon nhất thế giới. Ổ bánh mì giòn rụm ăn kèm thịt xíu, pâté gan, rau sống và tương ớt đặc biệt tạo nên hương vị không nơi nào có được.",
    // Vu Nguyen – Vietnamese baguette banh mi vietnam (verified Unsplash)
    // Amy Tran – green vegetable brown bread (verified Unsplash)
    // Sharon Chen – brown chopsticks white bowl (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1646906726988-d7e9b5aef6bc?w=1200&q=80",
      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=1200&q=80",
      "https://images.unsplash.com/photo-1559847844-5315695dadae?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 5, rating: 5, content: "Xếp hàng từ sáng sớm chỉ để ăn được ổ bánh mì này. Giòn tan, nhân đầy ắp, xứng danh ngon nhất thế giới!" },
      { userIdx: 8, rating: 5, content: "Chỉ 25k một ổ bánh mì đầy đủ nhân. Sự kết hợp giữa pâté Pháp và rau sống Việt tạo ra vị độc nhất vô nhị." },
      { userIdx: 0, rating: 5, content: "Lần đầu ăn bánh mì Phượng là không bao giờ quên được. Vỏ bánh giòn rụm, nhân vừa đủ mặn ngọt." },
      { userIdx: 6, rating: 4, content: "Quán nhỏ nhưng khách đến từ khắp thế giới. Thường hết hàng vào buổi trưa nên đến sớm nhé." },
      { userIdx: 2, rating: 5, content: "Thứ ngon nhất tôi ăn trong chuyến đi Hội An. Đã mua thêm 5 ổ mang về làm quà cho gia đình." },
    ],
  },

  {
    name: "Cơm Tấm Sườn Bì Chả Sài Gòn",
    region: "Hồ Chí Minh, Việt Nam",
    category: "DINING" as const,
    featureLabel: "Đặc sản Nam Bộ",
    averageRating: 4.7, ratingCount: 1200, priceLevel: 35000,
    latitude: 10.7769, longitude: 106.7009,
    about: "Cơm tấm là linh hồn ẩm thực Sài Gòn - tấm gạo vỡ thơm ngon ăn kèm sườn nướng mật ong, bì lợn, chả hấp và nước chấm đặc trưng miền Nam. Đây là món ăn bình dân nhưng đầy hương vị.",
    // Khuc Le Thanh Danh – table bowls of food Vietnam (verified Unsplash)
    // Michael Lock – group people sitting restaurant (verified Unsplash)
    // Anh Vy – street food canteen restaurant Ho Chi Minh (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1609166214994-502d326bafe1?w=1200&q=80",
      "https://images.unsplash.com/photo-1559410545-0bdcd187e0a6?w=1200&q=80",
      "https://images.unsplash.com/photo-1527525122851-2b7a2b32e4e1?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 2, rating: 5, content: "Sườn nướng mật ong thơm lừng, cơm tấm dẻo ngon. Ăn kèm canh chua ngọt là chuẩn Sài Gòn xịn." },
      { userIdx: 6, rating: 4, content: "Giá rẻ, bữa ăn no đủ chất. Đây là tinh hoa ẩm thực đường phố Sài Gòn mà ai cũng phải thử." },
      { userIdx: 0, rating: 5, content: "Đặc biệt nhất là nước mắm pha với ớt tươi và tỏi. Bí quyết làm nên tên tuổi của mỗi quán cơm tấm." },
      { userIdx: 8, rating: 4, content: "Quán mở từ sáng sớm đến tối muộn, giải quyết được cả bữa sáng, trưa và tối. Rất tiện." },
    ],
  },

  {
    name: "Mì Quảng Đặc Sản Đà Nẵng",
    region: "Đà Nẵng, Việt Nam",
    category: "DINING" as const,
    featureLabel: "Đặc sản miền Trung",
    averageRating: 4.6, ratingCount: 750, priceLevel: 30000,
    latitude: 16.0544, longitude: 108.2022,
    about: "Mì Quảng là đặc sản nổi tiếng của vùng Quảng Nam - Đà Nẵng với sợi mì vàng dày, nước dùng đậm đà ít nước, thịt tươi và rau sống tươi ngon. Bánh tráng nướng giòn rụm ăn kèm là nét đặc trưng không thể thiếu.",
    // Markus Winkler – white noodles meat vegetables white bowl (verified Unsplash)
    // Dara Keo – soup dish white ceramic bowl (verified Unsplash)
    // gau xam – person pouring yellow liquid stainless bowl Vietnam (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1634395207590-1b1a7c434b89?w=1200&q=80",
      "https://images.unsplash.com/photo-1563245372-f21724e3856d?w=1200&q=80",
      "https://images.unsplash.com/photo-1557495235-340eb888a9fb?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 4, rating: 5, content: "Mì Quảng ở Đà Nẵng là phải thử! Thịt gà mềm, nước dùng đậm đà. Bánh tráng nướng ăn kèm rất thú vị." },
      { userIdx: 1, rating: 4, content: "Khác hoàn toàn với phở hay bún. Vị đặc trưng miền Trung không lẫn vào đâu được." },
      { userIdx: 7, rating: 5, content: "Rau sống ăn kèm mì Quảng rất đa dạng và tươi ngon. Thêm ít ớt xanh tươi là hoàn hảo." },
      { userIdx: 3, rating: 4, content: "Giá bình dân, phục vụ nhanh, mở từ 7 giờ sáng. Bữa sáng hoàn hảo trước khi đi tham quan Đà Nẵng." },
    ],
  },

  {
    name: "Hải Sản Tươi Sống Nha Trang",
    region: "Khánh Hòa, Việt Nam",
    category: "DINING" as const,
    featureLabel: "Tươi sống từ biển",
    averageRating: 4.7, ratingCount: 1100, priceLevel: 80000,
    latitude: 12.2388, longitude: 109.1967,
    about: "Nha Trang nổi tiếng với hải sản tươi sống đa dạng được đánh bắt hàng ngày. Tôm hùm, cua hoàng đế, nghêu, sò huyết và cá mú là những đặc sản không thể bỏ qua khi đến thành phố biển này.",
    // Markus Winkler – white noodles meat vegetables (for food placeholder)
    // Thoa Ngo – ramen brown ceramic bowl Vietnam (verified Unsplash)
    // Trung Bui – white noodles meat vegetables Vietnam (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=1200&q=80",
      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=1200&q=80",
      "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 3, rating: 5, content: "Tôm hùm nướng bơ tỏi ở đây tươi ngon xuất sắc. Ăn trực tiếp tại nhà hàng ven biển với gió mát là hoàn hảo." },
      { userIdx: 1, rating: 4, content: "Cua biển hấp gừng to và đầy gạch. Giá hợp lý so với chất lượng. Nên đến chợ đêm để chọn hải sản tươi." },
      { userIdx: 7, rating: 5, content: "Ốc hương xào bơ, nghêu hấp sả - toàn những món đơn giản nhưng ngon vì nguyên liệu cực tươi." },
      { userIdx: 4, rating: 4, content: "Mực một nắng chiên giòn ăn kèm tương ớt xanh - đặc sản Nha Trang mang về làm quà rất ý nghĩa." },
      { userIdx: 6, rating: 2, content: "Trải nghiệm không như mong đợi, dịch vụ hơi chậm và thông tin tại chỗ chưa rõ ràng." },
      { userIdx: 7, rating: 1, content: "Không hài lòng với chuyến tham quan này, khu vực đông đúc và chất lượng chưa xứng với giá." },
    ],
  },

  {
    name: "Nhà Hàng Ngon Hà Nội",
    region: "Hà Nội, Việt Nam",
    category: "DINING" as const,
    featureLabel: "Đang mở cửa",
    averageRating: 4.6, ratingCount: 890, priceLevel: 45000,
    latitude: 21.0285, longitude: 105.8342,
    about: "Nhà Hàng Ngon là địa chỉ ẩm thực nổi tiếng tại Hà Nội, nơi quy tụ hàng trăm món ăn truyền thống từ mọi miền đất nước trong không gian biệt thự Pháp cổ điển rộng rãi và xanh mát.",
    // Sharon Chen – chopsticks white bowl food Vietnam (verified Unsplash)
    // Khuc Le Thanh Danh – table bowls food chopsticks (verified Unsplash)
    // Michael Lock – A group of people sitting tables restaurant (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&q=80",
      "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&q=80",
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 0, rating: 5, content: "Thực đơn phong phú với hàng trăm món từ Bắc chí Nam. Không gian biệt thự Pháp rất đẹp và mát mẻ." },
      { userIdx: 4, rating: 4, content: "Phở bò và bún chả ở đây ngon chuẩn vị Hà Nội. Đông khách nên đôi khi phải chờ đặt bàn." },
      { userIdx: 6, rating: 5, content: "Giá hợp lý cho chất lượng và không gian. Nhân viên phục vụ chu đáo và thân thiện." },
      { userIdx: 2, rating: 4, content: "Nem cuốn và chả giò rán giòn thơm. Vị nước chấm đậm đà đúng kiểu Hà Nội cổ truyền." },
    ],
  },

  {
    name: "Lẩu Cá Kèo Miền Tây",
    region: "Cần Thơ, Việt Nam",
    category: "DINING" as const,
    featureLabel: "Đặc sản sông nước",
    averageRating: 4.6, ratingCount: 680, priceLevel: 40000,
    latitude: 10.0452, longitude: 105.7469,
    about: "Lẩu cá kèo là đặc sản đồng bằng sông Cửu Long, nấu với me chua ngọt, rau nhút và bông súng. Cá kèo tươi sống được bắt từ ruộng lúa, có vị ngọt tự nhiên không nơi nào có được.",
    // Khuc Le Thanh Danh – table lots of different bowls of food Vietnam (verified Unsplash)
    // gau xam – person pouring liquid stainless bowl (verified Unsplash)
    // Anh Vy – street food canteen restaurant Ho Chi Minh (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1547592180-85f173990554?w=1200&q=80",
      "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1200&q=80",
      "https://images.unsplash.com/photo-1455619452474-d2be8b1e70cd?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 5, rating: 5, content: "Lẩu cá kèo Miền Tây chính gốc - chua cay ngọt mặn đủ vị. Rau nhút và bông súng chấm lẩu ngon vô cùng." },
      { userIdx: 8, rating: 4, content: "Quán nằm ngay bên bờ kênh, ăn xong có thể ngắm thuyền qua lại. Không khí miền Tây đặc trưng." },
      { userIdx: 0, rating: 5, content: "Vị me chua quyện với cá kèo ngọt thịt là hương vị không thể quên. Ăn một lần là nhớ mãi." },
      { userIdx: 2, rating: 4, content: "Giá rẻ, phần ăn nhiều. Đây là trải nghiệm ẩm thực văn hóa sông nước rất đáng thử." },
    ],
  },

  {
    name: "Cà Phê Trứng Giảng Hà Nội",
    region: "Hà Nội, Việt Nam",
    category: "DINING" as const,
    featureLabel: "Đặc sản Hà Nội",
    averageRating: 4.7, ratingCount: 960, priceLevel: 20000,
    latitude: 21.0331, longitude: 105.8505,
    about: "Cà phê trứng Giảng là phát minh độc đáo của Hà Nội từ năm 1946, khi lòng đỏ trứng gà được đánh bông thay cho sữa khan hiếm sau chiến tranh. Ngày nay nó trở thành đặc sản ẩm thực nổi tiếng toàn cầu.",
    // Trung Bui – white noodles meat vegetables Vietnam (verified Unsplash)
    // Vy Huynh – Vietnam soup green leaves (verified Unsplash)
    // Thoa Ngo – ramen brown ceramic bowl (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=1200&q=80",
      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1200&q=80",
      "https://images.unsplash.com/photo-1497935586351-b67a49e012bf?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 6, rating: 5, content: "Cà phê trứng Giảng - phát minh thiên tài của người Hà Nội. Lớp bọt trứng vàng béo ngậy phủ trên cà phê đắng." },
      { userIdx: 3, rating: 5, content: "Ngồi trong không gian cổ điển của quán Giảng, nhâm nhi cà phê trứng nóng - trải nghiệm Hà Nội thuần túy." },
      { userIdx: 1, rating: 4, content: "Quán nhỏ hẹp nhưng ấm cúng. Cà phê trứng nóng tuyệt vời vào mùa đông Hà Nội." },
      { userIdx: 8, rating: 5, content: "Đã thử nhiều nơi bán cà phê trứng nhưng quán Giảng vẫn là ngon nhất và đúng vị nhất." },
    ],
  },

  // ══════════════════════════════════════════════════════════════
  // FESTIVALS
  // ══════════════════════════════════════════════════════════════
  {
    name: "Lễ Hội Đèn Lồng Hội An",
    region: "Quảng Nam, Việt Nam",
    category: "FESTIVALS" as const,
    featureLabel: "Mỗi tháng một lần",
    averageRating: 4.9, ratingCount: 2200, priceLevel: 20000,
    latitude: 15.8801, longitude: 108.3380,
    about: "Vào đêm 14 âm lịch hàng tháng, phố cổ Hội An tắt hết đèn điện và thắp sáng bằng ngàn chiếc đèn lồng lung linh. Du khách thả đèn hoa đăng trên sông Hoài - một trải nghiệm tâm linh đặc sắc.",
    // Khoi Tran – colorful lanterns Hoi An Vietnam (verified Unsplash)
    // Hoi An Photographer – two men lantern festival boat (verified Unsplash)
    // Khoi Tran – hoi an ancient town vivid colors lantern (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1662015720861-56c0ac845dfd?w=1200&q=80",
      "https://images.unsplash.com/photo-1752707660451-e3d7e7e4f4de?w=1200&q=80",
      "https://images.unsplash.com/photo-1569150216655-aa4d0d8e1a81?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 2, rating: 5, content: "Đêm rằm Hội An đẹp như trong mơ. Hàng ngàn đèn lồng phản chiếu trên mặt nước sông Hoài tạo cảnh tượng mê hoặc." },
      { userIdx: 8, rating: 5, content: "Thả đèn hoa đăng và ước nguyện trên sông - trải nghiệm tâm linh sâu sắc mà tôi sẽ nhớ mãi." },
      { userIdx: 4, rating: 5, content: "Hội An về đêm rằm đông hơn nhưng không khí khác hẳn. Đường phố cổ lung linh trong ánh đèn lồng rực rỡ." },
      { userIdx: 6, rating: 4, content: "Nên đặt khách sạn ven sông để có góc nhìn đẹp nhất. Đến sớm để tìm chỗ ngồi tốt thả đèn." },
      { userIdx: 1, rating: 5, content: "Không có từ nào diễn tả được vẻ đẹp của đêm đèn lồng Hội An. Phải đến trực tiếp mới cảm nhận được." },
    ],
  },

  {
    name: "Lễ Hội Hoa Đà Lạt",
    region: "Lâm Đồng, Việt Nam",
    category: "FESTIVALS" as const,
    featureLabel: "Tháng 12 - 2 năm/lần",
    averageRating: 4.7, ratingCount: 1100, priceLevel: 60000,
    latitude: 11.9401, longitude: 108.4583,
    about: "Lễ hội Hoa Đà Lạt được tổ chức 2 năm một lần vào tháng 12, trưng bày hàng trăm loài hoa rực rỡ từ khắp Việt Nam và thế giới. Đây là sự kiện văn hóa nông nghiệp lớn nhất của thành phố ngàn hoa.",
    // Taan Huyn – Dalat flowers forest Vietnam (verified Unsplash, Mar 2025)
    // Max Do – sunflower Vietnam Dalat (verified Unsplash)
    // Apaha Spi – girl hydrangea garden Dalat Vietnam (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1740307826261-ed601f0e31e5?w=1200&q=80",
      "https://images.unsplash.com/photo-1682590268038-ae3d6d23e1a1?w=1200&q=80",
      "https://images.unsplash.com/photo-1537001373039-1b3cfbeef6ec?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 7, rating: 5, content: "Lễ hội hoa Đà Lạt là thiên đường cho những người yêu hoa và nhiếp ảnh. Hàng triệu bông hoa đủ màu sắc." },
      { userIdx: 0, rating: 4, content: "Thời tiết Đà Lạt tháng 12 se lạnh rất thích hợp để đi dạo trong vườn hoa. Mang áo khoác nhé!" },
      { userIdx: 5, rating: 5, content: "Không chỉ hoa, lễ hội còn có nhiều hoạt động văn hóa, ẩm thực và âm nhạc rất sôi động." },
      { userIdx: 3, rating: 4, content: "Khu vực trưng bày tại quảng trường Lâm Viên rất rộng và đẹp. Buổi tối có show ánh sáng rực rỡ." },
      { userIdx: 6, rating: 2, content: "Trải nghiệm không như mong đợi, dịch vụ hơi chậm và thông tin tại chỗ chưa rõ ràng." },
      { userIdx: 7, rating: 1, content: "Không hài lòng với chuyến tham quan này, khu vực đông đúc và chất lượng chưa xứng với giá." },
    ],
  },

  {
    name: "Tết Nguyên Đán Hà Nội",
    region: "Hà Nội, Việt Nam",
    category: "FESTIVALS" as const,
    featureLabel: "Hàng năm - Tháng 1/2",
    averageRating: 4.8, ratingCount: 1800, priceLevel: 10000,
    latitude: 21.0285, longitude: 105.8542,
    about: "Tết Nguyên Đán tại Hà Nội là dịp lễ hội lớn nhất năm với đường phố rực rỡ hoa đào, hoa mai. Hồ Gươm trở thành tâm điểm của các hoạt động văn hóa, biểu diễn nghệ thuật và pháo hoa đêm giao thừa.",
    // Jahanzeb Ahsan – people night fireworks celebration (verified Unsplash, Jan 2025)
    // CHEN HENG – green purple chinese new year fireworks (verified Unsplash, Feb 2025)
    // Tra Nguyen – Tet Vietnam (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1735768012225-d26e35c54c0c?w=1200&q=80",
      "https://images.unsplash.com/photo-1739082699268-aa6fedd0f2c7?w=1200&q=80",
      "https://images.unsplash.com/photo-1499364615650-ec38552f4f34?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 6, rating: 5, content: "Đêm giao thừa ở Hồ Gươm với pháo hoa rực rỡ - khoảnh khắc thiêng liêng nhất trong năm. Không khí đoàn viên rất ấm áp." },
      { userIdx: 1, rating: 5, content: "Phố Hàng Đào, Hàng Mã trang trí lộng lẫy dịp Tết. Mua cành đào hồng đặt ở nhà đón năm mới thật thú vị." },
      { userIdx: 4, rating: 4, content: "Tết Hà Nội rất đặc biệt với không khí yên tĩnh đặc trưng ngày mùng 1. Mọi người đi lễ chùa cầu bình an." },
      { userIdx: 2, rating: 5, content: "Chợ hoa Nguyễn Huệ đêm 29-30 Tết đông đúc sôi động. Hoa tươi đẹp và giá cuối phiên rất hời." },
      { userIdx: 7, rating: 5, content: "Múa lân và trống hội rộn ràng trên phố đi bộ Hồ Gươm. Văn hóa Tết Hà Nội truyền thống và đặc sắc." },
      { userIdx: 6, rating: 2, content: "Trải nghiệm không như mong đợi, dịch vụ hơi chậm và thông tin tại chỗ chưa rõ ràng." },
      { userIdx: 7, rating: 1, content: "Không hài lòng với chuyến tham quan này, khu vực đông đúc và chất lượng chưa xứng với giá." },
    ],
  },

  {
    name: "Lễ Hội Pháo Hoa Quốc Tế Đà Nẵng",
    region: "Đà Nẵng, Việt Nam",
    category: "FESTIVALS" as const,
    featureLabel: "Tháng 6-7 hàng năm",
    averageRating: 4.9, ratingCount: 3100, priceLevel: 120000,
    latitude: 16.0610, longitude: 108.2247,
    about: "Lễ hội Pháo hoa Quốc tế Đà Nẵng (DIFF) là một trong những lễ hội pháo hoa lớn nhất châu Á, quy tụ các đội thi đến từ nhiều quốc gia trình diễn trên sông Hàn. Sự kiện kéo dài nhiều tuần với những màn trình diễn ánh sáng ngoạn mục.",
    // Arthur Debons – happy new year fireworks display (verified Unsplash)
    // Jahanzeb Ahsan – people night fireworks celebration (verified Unsplash)
    // Vivu Vietnam – crowd fireworks Phu Quoc (verified Unsplash - fireworks Vietnam context)
    images: [
      "https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=1200&q=80",
      "https://images.unsplash.com/photo-1576485375217-d6a95e34d043?w=1200&q=80",
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 4, rating: 5, content: "DIFF là lễ hội pháo hoa đẹp nhất tôi từng xem. Mỗi quốc gia có phong cách riêng, đêm nào cũng ấn tượng." },
      { userIdx: 8, rating: 5, content: "Ngồi trên cầu Rồng nhìn pháo hoa bùng nổ trên sông Hàn - cảnh tượng không bao giờ quên trong đời." },
      { userIdx: 2, rating: 5, content: "Đặt vé sớm và tìm điểm nhìn tốt trên bờ sông. Đêm chung kết pháo hoa đẹp đỉnh cao." },
      { userIdx: 6, rating: 4, content: "Khách sạn Đà Nẵng mùa DIFF đắt và đông nhưng không khí thành phố rất sôi động. Đáng đến một lần." },
      { userIdx: 3, rating: 5, content: "Đây là sự kiện tầm cỡ quốc tế làm nên thương hiệu du lịch Đà Nẵng. Kỹ thuật và nghệ thuật pháo hoa đỉnh cao." },
    ],
  },

  {
    name: "Carnival Đường Phố Đà Nẵng",
    region: "Đà Nẵng, Việt Nam",
    category: "FESTIVALS" as const,
    featureLabel: "Mùa hè hàng năm",
    averageRating: 4.6, ratingCount: 920, priceLevel: 35000,
    latitude: 16.0544, longitude: 108.2022,
    about: "Carnival Đường Phố Đà Nẵng diễn ra hàng năm vào mùa hè trên cầu Rồng và bờ biển Mỹ Khê. Những màn biểu diễn nghệ thuật đường phố, múa lửa, acrobat và nhạc sống tạo nên không khí lễ hội sôi động.",
    // Vivu Vietnam – crowd fireworks Phu Quoc Sunset Town concert (verified Unsplash)
    // NVpEcIdclUI – Vivu Vietnam fireworks crowd Phu Quoc (verified Unsplash)
    // Arthur Debons – fireworks happy new year (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=1200&q=80",
      "https://images.unsplash.com/photo-1547139036-38b9ab83fa4b?w=1200&q=80",
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 5, rating: 5, content: "Cầu Rồng phun lửa kết hợp với carnival đường phố - đêm Đà Nẵng không bao giờ buồn. Rất sôi động và vui." },
      { userIdx: 7, rating: 4, content: "Màn biểu diễn múa lửa ấn tượng trên bãi biển Mỹ Khê. Đám đông đông nhưng không khí vui vẻ tuyệt vời." },
      { userIdx: 3, rating: 5, content: "Đà Nẵng mùa hè = carnival, biển và hải sản. Ba thứ này kết hợp tạo nên kỳ nghỉ hè hoàn hảo nhất." },
      { userIdx: 8, rating: 4, content: "Nên đi theo nhóm để có trải nghiệm vui hơn. Trẻ em rất thích các tiết mục nghệ thuật đường phố." },
    ],
  },

  {
    name: "Lễ Hội Kate Ninh Thuận",
    region: "Ninh Thuận, Việt Nam",
    category: "FESTIVALS" as const,
    featureLabel: "Tháng 10 âm lịch",
    averageRating: 4.8, ratingCount: 560, priceLevel: 40000,
    latitude: 11.5738, longitude: 108.9884,
    about: "Lễ Hội Kate là lễ hội lớn nhất của người Chăm theo đạo Bà La Môn, được tổ chức tại các tháp Chăm cổ kính. Du khách được chiêm ngưỡng trang phục truyền thống, vũ điệu và âm nhạc đặc sắc của người Chăm.",
    // Melanie Magdalena – paper lantern flying sky (verified Unsplash – festival context)
    // B C – luminous lanterns neon signs street night festival (verified Unsplash)
    // Ries Bosch – white paper lanterns festival Netherlands (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1531058020387-3be344556be6?w=1200&q=80",
      "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?w=1200&q=80",
      "https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 8, rating: 5, content: "Lễ hội Kate tại Tháp Pô Klong Garai - trải nghiệm văn hóa Chăm Pa vô cùng độc đáo và hiếm có." },
      { userIdx: 3, rating: 5, content: "Trang phục truyền thống Chăm rực rỡ, vũ điệu uyển chuyển. Âm nhạc trống Ginang và kèn Saranai mê hoặc." },
      { userIdx: 0, rating: 4, content: "Không khí trang nghiêm và linh thiêng tại lễ hội. Nên tìm hiểu về văn hóa Chăm trước khi đến." },
      { userIdx: 5, rating: 5, content: "Ít được biết đến hơn nhưng đây là một trong những lễ hội ấn tượng nhất Việt Nam. Nên đi ít nhất một lần." },
    ],
  },

  {
    name: "Lễ Hội Chọi Trâu Đồ Sơn",
    region: "Hải Phòng, Việt Nam",
    category: "FESTIVALS" as const,
    featureLabel: "Ngày 9/8 âm lịch",
    averageRating: 4.5, ratingCount: 780, priceLevel: 50000,
    latitude: 20.6834, longitude: 106.7961,
    about: "Lễ hội Chọi Trâu Đồ Sơn là lễ hội truyền thống lâu đời của vùng biển Đồ Sơn, được tổ chức vào ngày 9 tháng 8 âm lịch. Những con trâu mạnh mẽ được chăm sóc cẩn thận và thi đấu trước sự cổ vũ của hàng nghìn người.",
    // Susan Q Yin – street red lanterns china new year (verified Unsplash – festival night atmosphere)
    // Akira – bunch chinese lanterns festival (verified Unsplash)
    // Ries Bosch – white paper lanterns festival (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1735221007540-eb80a4f4dd77?w=1200&q=80",
      "https://images.unsplash.com/photo-1738063789843-2fb50a4e4e3f?w=1200&q=80",
      "https://images.unsplash.com/photo-1504195432915-c0a219e7a1e3?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 2, rating: 4, content: "Lễ hội truyền thống độc đáo của Đồ Sơn. Không khí sôi động, tiếng cổ vũ rộn ràng của người dân địa phương." },
      { userIdx: 6, rating: 5, content: "Trải nghiệm văn hóa dân gian hiếm gặp. Nghi lễ trước cuộc thi rất trang trọng và đặc sắc." },
      { userIdx: 1, rating: 4, content: "Nên đến sớm để có chỗ đứng tốt. Mang theo mũ che nắng vì trời khá nóng vào tháng 9." },
      { userIdx: 4, rating: 5, content: "Ngoài chọi trâu còn có chợ hàng thủ công mỹ nghệ địa phương rất phong phú. Mua được nhiều đồ lưu niệm đẹp." },
    ],
  },

  {
    name: "Lễ Hội Diều Quốc Tế Vũng Tàu",
    region: "Bà Rịa - Vũng Tàu, Việt Nam",
    category: "FESTIVALS" as const,
    featureLabel: "Tháng 6 hàng năm",
    averageRating: 4.4, ratingCount: 420, priceLevel: 25000,
    latitude: 10.3462, longitude: 107.0843,
    about: "Lễ hội Diều Quốc tế Vũng Tàu thu hút các đội thi đến từ nhiều quốc gia với những con diều khổng lồ nhiều hình dáng và màu sắc độc đáo. Bầu trời Vũng Tàu rực rỡ và sôi động trong suốt những ngày diễn ra lễ hội.",
    // Melanie Magdalena – paper lanterns flying sky (verified Unsplash)
    // B C – luminous lanterns neon signs night (verified Unsplash)
    // Tsuyoshi Kozu – many illuminated lanterns hang wall night Japan (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1521412644187-c49fa049e84d?w=1200&q=80",
      "https://images.unsplash.com/photo-1556745757-8d76bdb6984b?w=1200&q=80",
      "https://images.unsplash.com/photo-1793020023975-7c52e10cde87?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 0, rating: 4, content: "Lễ hội diều quốc tế rất độc đáo - bầu trời đầy diều đủ hình thù từ cá mập đến rồng, khủng long. Rất ấn tượng." },
      { userIdx: 1, rating: 5, content: "Trẻ em thích mê khi nhìn những con diều khổng lồ bay lượn. Sự kiện gia đình hoàn hảo cuối tuần." },
      { userIdx: 6, rating: 4, content: "Kết hợp với đi biển Vũng Tàu rất tiện. Buổi sáng xem diều, buổi chiều tắm biển, tối ăn hải sản." },
    ],
  },

  {
    name: "Lễ Hội Oóc Om Bóc - Đua Ghe Ngo",
    region: "Sóc Trăng, Việt Nam",
    category: "FESTIVALS" as const,
    featureLabel: "Tháng 10 âm lịch",
    averageRating: 4.7, ratingCount: 640, priceLevel: 30000,
    latitude: 9.6028, longitude: 105.9739,
    about: "Lễ hội Oóc Om Bóc là lễ hội lớn nhất của người Khmer Nam Bộ, diễn ra vào ngày rằm tháng 10 âm lịch. Đua ghe Ngo trên sông là hoạt động hấp dẫn nhất với những chiếc ghe dài 24m được trang trí rực rỡ.",
    // Hai Nguyen – Vietnam Can Tho riverside (verified Unsplash)
    // Melanie Magdalena – paper lanterns flying (verified Unsplash)
    // B C – luminous lanterns neon signs street night (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=1200&q=80",
      "https://images.unsplash.com/photo-1531058020387-3be344556be6?w=1200&q=80",
      "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 5, rating: 5, content: "Đua ghe Ngo sôi động với tiếng trống rộn ràng. Tinh thần đồng đội của mỗi đội đua rất ấn tượng." },
      { userIdx: 1, rating: 4, content: "Văn hóa Khmer Nam Bộ rất đặc sắc. Trang phục, âm nhạc và nghi lễ dâng trăng đều rất độc đáo." },
      { userIdx: 7, rating: 5, content: "Ít khách du lịch quốc tế biết đến nhưng đây là lễ hội rất chân thực và hoành tráng." },
      { userIdx: 0, rating: 4, content: "Kết hợp tham quan chùa Khmer cổ kính ở Sóc Trăng rất xứng đáng. Nghệ thuật kiến trúc Khmer độc đáo." },
    ],
  },

  {
    name: "Lễ Hội Cầu Ngư Khánh Hòa",
    region: "Khánh Hòa, Việt Nam",
    category: "FESTIVALS" as const,
    featureLabel: "Tháng Giêng âm lịch",
    averageRating: 4.6, ratingCount: 480, priceLevel: 20000,
    latitude: 12.2388, longitude: 109.1967,
    about: "Lễ hội Cầu Ngư là lễ hội truyền thống của ngư dân ven biển Khánh Hòa, cầu mong biển bình yên, tôm cá đầy khoang. Lễ hội có những nghi thức trang nghiêm, đua thuyền và hát bả trạo đặc sắc.",
    // OnBird Phu Quoc – fishing boat ocean sunset Vietnam (verified Unsplash)
    // Lily Tran – Phu Quoc beach pier (verified Unsplash)
    // Vivu Vietnam – crowd Sunset Town Phu Quoc (verified Unsplash)
    images: [
      "https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=1200&q=80",
      "https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=1200&q=80",
      "https://images.unsplash.com/photo-1544551763-77ef2d0cfc6c?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 3, rating: 5, content: "Lễ hội Cầu Ngư giúp tôi hiểu hơn về văn hóa và đời sống ngư dân miền Trung. Trang trọng và cảm động." },
      { userIdx: 6, rating: 4, content: "Màn hát bả trạo trên thuyền rất đặc sắc - loại hình nghệ thuật dân gian độc đáo của ngư dân Khánh Hòa." },
      { userIdx: 2, rating: 5, content: "Nghi lễ tế thần ở đình làng biển rất trang nghiêm. Du khách được chào đón và mời ăn tiệc làng." },
      { userIdx: 4, rating: 4, content: "Đua thuyền trên biển Nha Trang sôi động. Cổ vũ cùng người dân địa phương tạo cảm giác hòa nhập tuyệt vời." },
    ],
  },
];

const REMOVED_PLACE_NAMES = new Set([
  "Mũi Né - Đồi Cát Bay",
  "Hồ Tây & Đền Quán Thánh",
  "Phở Thìn Lò Đúc",
  "Bún Chả Hương Liên",
  "Bánh Mì Phượng Hội An",
  "Cơm Tấm Sườn Bì Chả Sài Gòn",
  "Mì Quảng Đặc Sản Đà Nẵng",
  "Hải Sản Tươi Sống Nha Trang",
  "Nhà Hàng Ngon Hà Nội",
  "Lẩu Cá Kèo Miền Tây",
  "Cà Phê Trứng Giảng Hà Nội",
  "Lễ Hội Đèn Lồng Hội An",
  "Lễ Hội Hoa Đà Lạt",
  "Tết Nguyên Đán Hà Nội",
  "Lễ Hội Pháo Hoa Quốc Tế Đà Nẵng",
  "Carnival Đường Phố Đà Nẵng",
  "Lễ Hội Chọi Trâu Đồ Sơn",
  "Lễ Hội Diều Quốc Tế Vũng Tàu",
  "Lễ Hội Oóc Om Bóc - Đua Ghe Ngo",
  "Lễ Hội Cầu Ngư Khánh Hòa",
]);

const ADDED_PLACES_DATA = [
  {
    name: "Khách Sạn Hội An Riverside",
    region: "Quảng Nam, Việt Nam",
    category: "STAYS" as const,
    featureLabel: "Khách sạn ven sông",
    averageRating: 4.7, ratingCount: 620, priceLevel: 1450000,
    latitude: 15.8794, longitude: 108.3352,
    about: "Khách sạn ven sông với phòng nghỉ sáng sủa, hồ bơi nhỏ và vị trí thuận tiện để đi bộ vào phố cổ Hội An.",
    images: [
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80",
      "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=1200&q=80",
      "https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 0, rating: 5, content: "Phòng sạch, nhân viên hỗ trợ nhanh và đi bộ ra phố cổ rất tiện. Buổi sáng nhìn ra sông khá thư giãn." },
      { userIdx: 2, rating: 4, content: "Bữa sáng ổn, vị trí đẹp. Nên đặt phòng hướng sông nếu đi cùng gia đình." },
      { userIdx: 5, rating: 5, content: "Không gian yên tĩnh, phù hợp nghỉ lại sau một ngày dạo phố Hội An." },
      { userIdx: 6, rating: 2, content: "Trải nghiệm không như mong đợi, dịch vụ hơi chậm và thông tin tại chỗ chưa rõ ràng." },
      { userIdx: 7, rating: 1, content: "Không hài lòng với chuyến tham quan này, khu vực đông đúc và chất lượng chưa xứng với giá." },
    ],
  },
  {
    name: "Motel Đà Lạt Pine Hill",
    region: "Lâm Đồng, Việt Nam",
    category: "STAYS" as const,
    featureLabel: "Motel đồi thông",
    averageRating: 4.4, ratingCount: 310, priceLevel: 520000,
    latitude: 11.9404, longitude: 108.4583,
    about: "Motel nhỏ trên đồi thông, giá dễ chịu, phù hợp nhóm bạn cần chỗ nghỉ gọn gàng gần trung tâm Đà Lạt.",
    images: [
      "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=1200&q=80",
      "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1200&q=80",
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 3, rating: 4, content: "Giá hợp lý, phòng đủ dùng và chủ motel thân thiện. Tối hơi lạnh nên nhớ mang áo ấm." },
      { userIdx: 6, rating: 5, content: "Đi nhóm bạn rất ổn, có chỗ để xe và gần nhiều quán cà phê đẹp." },
      { userIdx: 8, rating: 4, content: "Không quá sang nhưng sạch sẽ, đúng kiểu nghỉ nhanh sau lịch trình săn mây." },
    ],
  },
  {
    name: "Motel Biển Mỹ Khê",
    region: "Đà Nẵng, Việt Nam",
    category: "STAYS" as const,
    featureLabel: "Motel gần biển",
    averageRating: 4.3, ratingCount: 280, priceLevel: 480000,
    latitude: 16.0618, longitude: 108.2460,
    about: "Motel gần bãi biển Mỹ Khê, phòng cơ bản, dễ di chuyển tới biển, cầu Rồng và các khu ăn uống đêm.",
    images: [
      "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=1200&q=80",
      "https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=1200&q=80",
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 1, rating: 4, content: "Đi bộ ra biển nhanh, phòng vừa đủ cho chuyến ngắn ngày. Nhân viên chỉ đường ăn hải sản rất nhiệt tình." },
      { userIdx: 4, rating: 4, content: "Giá tốt so với vị trí gần biển. Phù hợp du lịch tiết kiệm." },
      { userIdx: 7, rating: 5, content: "Sáng ra biển ngắm bình minh cực tiện, gửi xe máy miễn phí." },
    ],
  },
  {
    name: "Chợ Bến Thành",
    region: "Hồ Chí Minh, Việt Nam",
    category: "SHOPPING" as const,
    featureLabel: "Biểu tượng mua sắm",
    averageRating: 4.5, ratingCount: 1600, priceLevel: 300000,
    latitude: 10.7725, longitude: 106.6980,
    about: "Khu chợ trung tâm nổi tiếng với quầy lưu niệm, vải vóc, đặc sản và ẩm thực đường phố Sài Gòn.",
    images: [
      "https://images.unsplash.com/photo-1582275018660-7ee1d49afc1c?w=1200&q=80",
      "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&q=80",
      "https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 0, rating: 5, content: "Rất nhiều món quà nhỏ dễ mua, nên hỏi giá trước và đi buổi chiều cho đỡ đông." },
      { userIdx: 3, rating: 4, content: "Không khí chợ nhộn nhịp, đồ ăn nhanh và đặc sản khá đa dạng." },
      { userIdx: 6, rating: 4, content: "Một điểm nên ghé nếu muốn mua quà Sài Gòn trong thời gian ngắn." },
      { userIdx: 6, rating: 2, content: "Trải nghiệm không như mong đợi, dịch vụ hơi chậm và thông tin tại chỗ chưa rõ ràng." },
      { userIdx: 7, rating: 1, content: "Không hài lòng với chuyến tham quan này, khu vực đông đúc và chất lượng chưa xứng với giá." },
    ],
  },
  {
    name: "Vincom Center Đồng Khởi",
    region: "Hồ Chí Minh, Việt Nam",
    category: "SHOPPING" as const,
    featureLabel: "Trung tâm thương mại",
    averageRating: 4.6, ratingCount: 980, priceLevel: 650000,
    latitude: 10.7781, longitude: 106.7017,
    about: "Trung tâm mua sắm hiện đại ở khu Đồng Khởi, có nhiều thương hiệu, nhà hàng và không gian tránh nóng giữa trung tâm thành phố.",
    images: [
      "https://images.unsplash.com/photo-1519567241046-7f570eee3ce6?w=1200&q=80",
      "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=1200&q=80",
      "https://images.unsplash.com/photo-1481437156560-3205f6a55735?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 2, rating: 5, content: "Dễ tìm nhà hàng và quán cà phê, vị trí trung tâm nên kết hợp dạo phố rất tiện." },
      { userIdx: 5, rating: 4, content: "Nhiều lựa chọn mua sắm, không gian sạch và mát." },
      { userIdx: 8, rating: 4, content: "Phù hợp nghỉ chân giữa lịch trình tham quan quận 1." },
    ],
  },
  {
    name: "Chợ Đêm Phú Quốc",
    region: "Kiên Giang, Việt Nam",
    category: "SHOPPING" as const,
    featureLabel: "Quà biển buổi tối",
    averageRating: 4.6, ratingCount: 1240, priceLevel: 420000,
    latitude: 10.2165, longitude: 103.9598,
    about: "Chợ đêm nhộn nhịp với hải sản, đặc sản đảo, đồ lưu niệm và các món ăn vặt phù hợp dạo tối ở Phú Quốc.",
    images: [
      "https://images.unsplash.com/photo-1532635241-17e820acc59f?w=1200&q=80",
      "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&q=80",
      "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=1200&q=80",
    ],
    reviews: [
      { userIdx: 1, rating: 5, content: "Buổi tối rất vui, nhiều món ăn vặt và quà từ ngọc trai, hải sản khô." },
      { userIdx: 4, rating: 4, content: "Nên đi chậm để chọn quán, giá cả khá đa dạng." },
      { userIdx: 7, rating: 5, content: "Không khí đảo về đêm rất đáng thử, đặc biệt là các món nướng." },
    ],
  },
];

const SEEDED_PLACES_DATA = [
  ...PLACES_DATA.filter((place) => !REMOVED_PLACE_NAMES.has(place.name)),
  ...ADDED_PLACES_DATA,
];
const PENDING_SEED_PLACE_COUNT = 4;
const MULTI_IMAGE_SEED_PLACE_INDEXES = new Set([0, 1]);
const PROMOTED_OWNER_REVIEW_TIMELINE_COUNTS = [
  { before: 0, after: 10 },
  { before: 1, after: 8 },
  { before: 0, after: 7 },
  { before: 2, after: 6 },
  { before: 1, after: 5 },
];

function getRegularReviewSeedCount(placeIndex: number) {
  return 2 + (placeIndex % 2);
}

function getSeedPlaceImages(place: { images: string[] }, placeIndex: number) {
  return MULTI_IMAGE_SEED_PLACE_INDEXES.has(placeIndex)
    ? place.images.slice(0, 4)
    : place.images.slice(0, 1);
}

function getReviewSeedContent(place: { reviews: { content: string }[] }, reviewIndex: number) {
  const fallbackReviews = [
    "Tráº£i nghiá»‡m ráº¥t á»•n, khÃ´ng gian Ä‘Ã¡ng ghÃ© vÃ  phÃ¹ há»£p cho lá»‹ch trÃ¬nh du lá»‹ch.",
    "Dá»‹ch vá»¥ tá»‘t, vá»‹ trÃ­ thuáº­n tiá»‡n vÃ  nhÃ¢n viÃªn há»— trá»£ nhiá»‡t tÃ¬nh.",
    "MÃ¬nh sáº½ quay láº¡i náº¿u cÃ³ dá»‹p, Ä‘áº·c biá»‡t lÃ  sau khi cÃ³ chÆ°Æ¡ng trÃ¬nh Æ°u Ä‘Ã£i.",
  ];
  return place.reviews[reviewIndex % place.reviews.length]?.content ?? fallbackReviews[reviewIndex % fallbackReviews.length];
}

function getReviewSeedRating(reviewIndex: number) {
  const ratings = [5, 5, 4, 5, 4, 3];
  return ratings[reviewIndex % ratings.length];
}

async function syncSeededPlaceStats(placeIds: string[]) {
  for (const placeId of placeIds) {
    const agg = await prisma.review.aggregate({
      where: { placeId, deletedAt: null },
      _avg: { rating: true },
      _count: true,
    });
    const avg = agg._avg.rating ?? 0;
    await prisma.place.update({
      where: { id: placeId },
      data: {
        averageRating: Math.round(avg * 10) / 10,
        ratingCount: agg._count,
      },
    });
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const storage = requireSupabaseConfig();
  const bucket = env.supabaseStorageBucket;

  console.log("🗑️  Clearing existing data...");
  await prisma.promotion.deleteMany();
  await prisma.reviewLike.deleteMany();
  await prisma.reviewImage.deleteMany();
  await prisma.placeImage.deleteMany();
  await prisma.notificationRecipient.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.tripActivity.deleteMany();
  await prisma.tripDay.deleteMany();
  await prisma.tripMember.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.review.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.place.deleteMany();
  await prisma.user.deleteMany();

  // ── Users ──────────────────────────────────────────────────────────────────
  console.log("👥 Creating users...");
  const seededUsers = await Promise.all(
    SEEDED_USERS_DATA.map(async (u) => {
      const rawPassword = (u as { password?: string }).password ?? "demo1234";
      const passwordHash = await bcrypt.hash(rawPassword, 10);
      if (!u.avatarUrl) return { ...u, passwordHash, avatarUrl: null };
      const avatarKey = u.username ?? u.email.split("@")[0] ?? "user";
      const avatarUrl = await uploadSeedImage({
        storage,
        bucket,
        objectPath: buildSeedObjectPath(`seed/users/${avatarKey}`, u.avatarUrl),
        imageUrl: u.avatarUrl,
      });
      return { ...u, passwordHash, avatarUrl };
    })
  );
  const createdUsers = await Promise.all(
    seededUsers.map((u) =>
      prisma.user.create({
        data: {
          email: u.email, passwordHash: u.passwordHash,
          role: u.role, fullName: u.fullName, username: u.username,
          location: u.location, avatarUrl: u.avatarUrl ?? null,
        },
      })
    )
  );
  const travelerUsers = createdUsers.filter((user) => user.role === "TRAVELER");
  const ownerUser = createdUsers.find((user) => user.email === "owner@example.com");
  const secondOwnerUser = createdUsers.find((user) => user.email === "owner2@example.com");
  if (!ownerUser || !secondOwnerUser) {
    throw new Error("Seed owner users were not created");
  }
  const secondOwnerPlaceIndexes = new Set(
    Array.from({ length: 7 }, (_, offset) => SEEDED_PLACES_DATA.length - 7 + offset),
  );
  console.log(`✅ Created ${createdUsers.length} users`);

  // ── Places + Images + Reviews ──────────────────────────────────────────────
  const createdPlaces: string[] = [];
  const createdPlaceCoverImages: string[] = [];

  for (let i = 0; i < SEEDED_PLACES_DATA.length; i++) {
    const p = SEEDED_PLACES_DATA[i];
    const status =
      i >= SEEDED_PLACES_DATA.length - PENDING_SEED_PLACE_COUNT
        ? "PENDING"
        : "APPROVED";
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 30);
    console.log(`🏝️  [${i + 1}/${SEEDED_PLACES_DATA.length}] Seeding: ${p.name}`);

    const uploadedImages = await uploadSeedImages({
      storage, bucket,
      prefix: `seed/places/${slug}`,
      imageUrls: getSeedPlaceImages(p, i),
    });

    const place = await prisma.place.create({
      data: {
        ownerId: secondOwnerPlaceIndexes.has(i) ? secondOwnerUser.id : ownerUser.id,
        name: p.name, region: p.region, category: p.category,
        coverImageUrl: uploadedImages[0],
        featureLabel: p.featureLabel,
        averageRating: p.averageRating, ratingCount: p.ratingCount,
        priceLevel: p.priceLevel,
        latitude: p.latitude ?? null, longitude: p.longitude ?? null,
        about: p.about,
        status,
      },
    });
    createdPlaces.push(place.id);
    createdPlaceCoverImages.push(place.coverImageUrl);

    if (uploadedImages.length > 1) {
      await prisma.placeImage.createMany({
        data: uploadedImages.slice(1).map((url) => ({ placeId: place.id, url })),
      });
    }

  }

  const favoritePlaceIndexesByTraveler = [
    [0, 1, 2, 3, 4, 5],
    [6, 22],
    [7, 23],
    [],
    [],
    [],
    [],
    [],
    [],
    [],
  ];
  const favoriteSaveAt = (userIdx: number, placeIdx: number) =>
    new Date(Date.UTC(2026, 4, 20 + userIdx, 8 + (placeIdx % 8), 0, 0));
  const prePromotionFavoriteSaveAtByKey = new Map<string, Date>([
    ["0:0", new Date("2026-05-30T09:00:00.000Z")],
  ]);

  for (let userIdx = 0; userIdx < travelerUsers.length; userIdx++) {
    for (const placeIdx of favoritePlaceIndexesByTraveler[userIdx] ?? []) {
      const placeId = createdPlaces[placeIdx];
      if (!placeId) continue;
      await prisma.favorite.create({
        data: {
          userId: travelerUsers[userIdx].id,
          placeId,
          saveAt: prePromotionFavoriteSaveAtByKey.get(`${userIdx}:${placeIdx}`) ?? favoriteSaveAt(userIdx, placeIdx),
        },
      });
    }
  }

  // ── Promotions ─────────────────────────────────────────────────────────────
  console.log("🎫 Creating promotions...");
  const promoTemplates = [
    { title: "Giảm 20% Tour Khám Phá",        isActive: true,  startDate: "01/06/2026", endDate: "30/06/2026", days: ["T2","T3","T4","T5","T6"], startTime: "08:00 AM", endTime: "05:00 PM", specificTime: true  },
    { title: "Combo Gia Đình - Tiết Kiệm 30%", isActive: true,  startDate: "15/06/2026", endDate: "15/08/2026", days: ["T7","CN"],                startTime: "09:00 AM", endTime: "06:00 PM", specificTime: true  },
    { title: "Khuyến Mãi Mùa Hè Rực Rỡ",      isActive: false, startDate: "01/07/2026", endDate: "31/08/2026", days: ["T2","T3","T4","T5","T6","T7","CN"], startTime: "", endTime: "", specificTime: false },
    { title: "Giảm 15% Đặt Sớm",              isActive: false, startDate: "01/05/2026", endDate: "31/12/2026", days: ["T2","T3","T4","T5","T6"], startTime: "10:00 AM", endTime: "02:00 PM", specificTime: true  },
    { title: "Happy Hour Cuối Tuần",           isActive: false, startDate: "01/06/2026", endDate: "30/09/2026", days: ["T7","CN"],                startTime: "04:00 PM", endTime: "08:00 PM", specificTime: true  },
    { title: "Ưu Đãi Nhóm Bạn",                isActive: false, startDate: "10/06/2026", endDate: "10/10/2026", days: ["T6","T7","CN"],           startTime: "03:00 PM", endTime: "09:00 PM", specificTime: true  },
    { title: "Voucher Khách Quay Lại",         isActive: false, startDate: "01/08/2026", endDate: "31/12/2026", days: ["T2","T3","T4","T5"],      startTime: "", endTime: "", specificTime: false },
    { title: "Ưu Đãi Nghỉ Dưỡng Cuối Tuần",    isActive: true,  startDate: "01/06/2026", endDate: "31/08/2026", days: ["T6","T7","CN"],           startTime: "02:00 PM", endTime: "10:00 PM", specificTime: true  },
    { title: "Mua Sắm Tặng Voucher",           isActive: false, startDate: "01/07/2026", endDate: "30/09/2026", days: ["T2","T3","T4","T5","T6"], startTime: "10:00 AM", endTime: "09:00 PM", specificTime: true  },
    { title: "Giảm Giá Quà Địa Phương",        isActive: false, startDate: "15/07/2026", endDate: "15/10/2026", days: ["T7","CN"],                startTime: "", endTime: "", specificTime: false },
  ];

  const ownerOnePromotionPlaceIndexes = [0, 0, 0, 1, 2, 3, 4];
  const ownerOnePromotedPlaceIndexes = Array.from(new Set(ownerOnePromotionPlaceIndexes));
  const ownerTwoPromotionPlaceIndexes = Array.from(secondOwnerPlaceIndexes).slice(0, 3);
  const promotionPlaceIndexes = [...ownerOnePromotionPlaceIndexes, ...ownerTwoPromotionPlaceIndexes];
  const promotionActiveAtByIndex: Record<number, Date> = {
    0: new Date("2026-06-01T01:00:00.000Z"),
    1: new Date("2026-06-15T02:00:00.000Z"),
    7: new Date("2026-06-01T03:00:00.000Z"),
  };
  const createdPromotions: Prisma.PromotionGetPayload<Record<string, never>>[] = [];
  for (let idx = 0; idx < promoTemplates.length; idx++) {
    const activeAt = promoTemplates[idx].isActive
      ? promotionActiveAtByIndex[idx] ?? new Date("2026-06-01T00:00:00.000Z")
      : null;
    const startDate = parseSeedDate(promoTemplates[idx].startDate);
    createdPromotions.push(
      await prisma.promotion.create({
        data: {
          placeId: createdPlaces[promotionPlaceIndexes[idx]],
          activeAt,
          createdAt: activeAt ?? startDate,
          ...promoTemplates[idx],
          startDate,
          endDate: parseSeedDate(promoTemplates[idx].endDate, true),
        },
      }),
    );
  }

  const promotionStartByPlaceId = new Map<string, Date>();
  for (const promotion of createdPromotions) {
    const currentStart = promotionStartByPlaceId.get(promotion.placeId);
    const candidateStart = promotion.activeAt ?? promotion.startDate;
    if (!currentStart || candidateStart.getTime() > currentStart.getTime()) {
      promotionStartByPlaceId.set(promotion.placeId, candidateStart);
    }
  }

  const ownerOnePromotedPlaceIndexSet = new Set(ownerOnePromotedPlaceIndexes);
  const expectedReviewCountByPlaceId = new Map<string, number>();
  let prePromotionReviewCount = 0;
  let postPromotionReviewCount = 0;
  const seededReviewData: Prisma.ReviewCreateManyInput[] = createdPlaces.flatMap((_, placeIdx) => {
    const placeId = createdPlaces[placeIdx];
    const place = SEEDED_PLACES_DATA[placeIdx];
    const promotedOwnerIndex = ownerOnePromotedPlaceIndexes.indexOf(placeIdx);

    if (ownerOnePromotedPlaceIndexSet.has(placeIdx)) {
      const timeline = PROMOTED_OWNER_REVIEW_TIMELINE_COUNTS[promotedOwnerIndex];
      const promotionStart = promotionStartByPlaceId.get(placeId) ?? new Date("2026-06-01T00:00:00.000Z");
      prePromotionReviewCount += timeline.before;
      postPromotionReviewCount += timeline.after;
      expectedReviewCountByPlaceId.set(placeId, timeline.before + timeline.after);

      const beforeReviews = Array.from({ length: timeline.before }, (_, reviewIdx) => ({
        placeId,
        userId: travelerUsers[reviewIdx % travelerUsers.length].id,
        rating: getReviewSeedRating(reviewIdx),
        content: getReviewSeedContent(place, reviewIdx),
        createdAt: new Date(promotionStart.getTime() - (timeline.before - reviewIdx) * 6 * 60 * 60 * 1000),
      }));
      const afterReviews = Array.from({ length: timeline.after }, (_, reviewIdx) => {
        const contentIndex = reviewIdx + timeline.before;
        return {
          placeId,
          userId: travelerUsers[contentIndex % travelerUsers.length].id,
          rating: getReviewSeedRating(contentIndex),
          content: getReviewSeedContent(place, contentIndex),
          createdAt: new Date(promotionStart.getTime() + (reviewIdx + 1) * 6 * 60 * 60 * 1000),
        };
      });
      return [...beforeReviews, ...afterReviews];
    }

    const reviewCount = getRegularReviewSeedCount(placeIdx);
    expectedReviewCountByPlaceId.set(placeId, reviewCount);
    const reviewStart = new Date(Date.UTC(2026, 4, 20 + (placeIdx % 10), 7, 0, 0));
    return Array.from({ length: reviewCount }, (_, reviewIdx) => ({
      placeId,
      userId: travelerUsers[(placeIdx + reviewIdx) % travelerUsers.length].id,
      rating: getReviewSeedRating(reviewIdx),
      content: getReviewSeedContent(place, reviewIdx),
      createdAt: new Date(reviewStart.getTime() + reviewIdx * 4 * 60 * 60 * 1000),
    }));
  });
  await prisma.review.createMany({ data: seededReviewData });

  const demoReviewAtFirstPlace = await prisma.review.findFirstOrThrow({
    where: { placeId: createdPlaces[0], userId: travelerUsers[0].id },
    select: { id: true },
  });
  const demoReviewAtThirdPlace = await prisma.review.findFirstOrThrow({
    where: { placeId: createdPlaces[2], userId: travelerUsers[0].id },
    select: { id: true },
  });
  await prisma.reviewLike.createMany({
    data: [
      { reviewId: demoReviewAtFirstPlace.id, userId: ownerUser.id },
      { reviewId: demoReviewAtThirdPlace.id, userId: travelerUsers[2].id },
    ],
    skipDuplicates: true,
  });
  const postActiveFavoriteSeeds = [
    { promotionIdx: 0, userIndexes: [1, 2, 3, 4] },
    { promotionIdx: 7, userIndexes: [0, 3, 5, 6] },
  ];
  let postActiveFavoriteCount = 0;
  for (const seed of postActiveFavoriteSeeds) {
    const promotion = createdPromotions[seed.promotionIdx];
    const activeAt = promotion?.activeAt;
    const placeId = promotion?.placeId;
    if (!activeAt || !placeId) continue;

    const result = await prisma.favorite.createMany({
      data: seed.userIndexes.map((userIdx, offset) => ({
        userId: travelerUsers[userIdx].id,
        placeId,
        saveAt: new Date(activeAt.getTime() + (offset + 1) * 6 * 60 * 60 * 1000),
      })),
      skipDuplicates: true,
    });
    postActiveFavoriteCount += result.count;
  }

  const expectedPromotionFavoriteTimelines = [
    { promotionIdx: 0, beforeActive: 1, afterActive: 4 },
    { promotionIdx: 7, beforeActive: 0, afterActive: 4 },
  ];
  for (const expected of expectedPromotionFavoriteTimelines) {
    const promotion = createdPromotions[expected.promotionIdx];
    if (!promotion.activeAt) {
      throw new Error(`Promotion index ${expected.promotionIdx} must be active for favorite timeline seed`);
    }

    const [beforeActive, afterActive, demoFavorite] = await Promise.all([
      prisma.favorite.count({
        where: { placeId: promotion.placeId, saveAt: { lt: promotion.activeAt } },
      }),
      prisma.favorite.count({
        where: { placeId: promotion.placeId, saveAt: { gt: promotion.activeAt } },
      }),
      prisma.favorite.findUnique({
        where: { userId_placeId: { userId: travelerUsers[0].id, placeId: promotion.placeId } },
      }),
    ]);
    if (
      beforeActive !== expected.beforeActive ||
      afterActive !== expected.afterActive ||
      !demoFavorite
    ) {
      throw new Error(
        `Promotion index ${expected.promotionIdx} favorite seed mismatch: ` +
        `before=${beforeActive}/${expected.beforeActive}, ` +
        `after=${afterActive}/${expected.afterActive}, ` +
        `demoFavorite=${Boolean(demoFavorite)}`,
      );
    }
  }

  for (let promotionIdx = 0; promotionIdx < ownerOnePromotionPlaceIndexes.length; promotionIdx++) {
    const placeIdx = ownerOnePromotionPlaceIndexes[promotionIdx];
    const promotedOwnerIndex = ownerOnePromotedPlaceIndexes.indexOf(placeIdx);
    const timeline = PROMOTED_OWNER_REVIEW_TIMELINE_COUNTS[promotedOwnerIndex];
    const promotion = createdPromotions[promotionIdx];
    const promotionStart = promotion.activeAt ?? promotion.createdAt;
    const [beforePromotion, afterPromotion] = await Promise.all([
      prisma.review.count({
        where: { placeId: promotion.placeId, createdAt: { lt: promotionStart } },
      }),
      prisma.review.count({
        where: { placeId: promotion.placeId, createdAt: { gte: promotionStart } },
      }),
    ]);
    if (beforePromotion !== timeline.before || afterPromotion !== timeline.after) {
      throw new Error(
        `Promotion review seed mismatch for promotion ${promotionIdx}: ` +
        `before=${beforePromotion}/${timeline.before}, after=${afterPromotion}/${timeline.after}`,
      );
    }
  }

  const reviewCountsByPlace = await prisma.review.groupBy({
    by: ["placeId"],
    _count: true,
  });
  const reviewCountMap = new Map(reviewCountsByPlace.map((row) => [row.placeId, row._count]));
  for (const placeId of createdPlaces) {
    const expectedCount = expectedReviewCountByPlaceId.get(placeId) ?? 0;
    const actualCount = reviewCountMap.get(placeId) ?? 0;
    if (actualCount !== expectedCount) {
      throw new Error(`Review seed mismatch for place ${placeId}: ${actualCount}/${expectedCount}`);
    }
  }
  await syncSeededPlaceStats(createdPlaces);

  // Trips for GET /api/v1/users/me/trips
  console.log("Creating sample trips...");
  const demoUser = travelerUsers[0];
  const seedToday = startOfUtcDay(new Date());
  const sampleTripStartDate = addUtcDays(seedToday, 7);
  const weekendTripStartDate = addUtcDays(seedToday, 5);
  const pendingInviteTripStartDate = addUtcDays(seedToday, 30);
  const inviteCreatedAt = withUtcTime(seedToday, 3, 30);
  const upcomingSampleCreatedAt = withUtcTime(seedToday, 1);
  const upcomingWeekendCreatedAt = withUtcTime(seedToday, 2);
  let sampleTrip: Prisma.TripGetPayload<Record<string, never>>;

  try {
  sampleTrip = await prisma.trip.create({
    data: {
      userId: demoUser.id,
      title: "Hành trình di sản Việt Nam",
      destination: "Quảng Ninh - Quảng Nam - Huế - Hà Giang - Yên Bái",
      currentHotelName: "Khách sạn Hội An Riverside",
      currentHotelPlaceId: createdPlaces[1],
      startDate: sampleTripStartDate,
      endDate: addUtcDays(sampleTripStartDate, 6),
      budget: 8000000,
      totalBudgetPerPerson: 8000000,
      coverImageUrl: createdPlaceCoverImages[1],
      currency: "VND",
      members: {
        create: [
          { userId: travelerUsers[0].id, status: "ACTIVE", joinedAt: sampleTripStartDate, inviteAcceptedAt: sampleTripStartDate },
          { userId: travelerUsers[1].id, status: "ACTIVE", joinedAt: sampleTripStartDate, inviteAcceptedAt: sampleTripStartDate },
          { userId: travelerUsers[2].id, status: "ACTIVE", joinedAt: sampleTripStartDate, inviteAcceptedAt: sampleTripStartDate },
        ],
      },
      days: {
        create: [
          {
            dayNumber: 1,
            title: "Ngày 1: Khám phá Quảng Ninh và Hội An",
            date: sampleTripStartDate,
            estimatedBudget: 625000,
            isExpanded: true,
            activities: {
              create: [
                {
                  placeId: createdPlaces[0],
                  title: SEEDED_PLACES_DATA[0].name,
                  description: "Điểm tham quan nổi bật được chọn cho lịch trình di sản.",
                  imageUrl: createdPlaceCoverImages[0],
                  period: "MORNING",
                  scheduledTime: "09:00",
                  estimatedCost: 0,
                  rating: SEEDED_PLACES_DATA[0].averageRating,
                  sortOrder: 1,
                },
                {
                  placeId: createdPlaces[1],
                  title: SEEDED_PLACES_DATA[1].name,
                  description: "Điểm dạo chơi văn hóa được chọn cho lịch trình di sản.",
                  imageUrl: createdPlaceCoverImages[1],
                  period: "AFTERNOON",
                  scheduledTime: "12:00",
                  estimatedCost: 625000,
                  rating: SEEDED_PLACES_DATA[1].averageRating,
                  sortOrder: 2,
                },
              ],
            },
          },
          {
            dayNumber: 2,
            title: "Ngày 2: Cố đô Huế và cao nguyên đá",
            date: addUtcDays(sampleTripStartDate, 1),
            estimatedBudget: 1750000,
            isExpanded: true,
            activities: {
              create: [
                {
                  placeId: createdPlaces[2],
                  title: SEEDED_PLACES_DATA[2].name,
                  description: "Điểm đến lịch sử được chọn cho ngày khám phá văn hóa.",
                  imageUrl: createdPlaceCoverImages[2],
                  period: "MORNING",
                  scheduledTime: "08:30",
                  estimatedCost: 875000,
                  rating: SEEDED_PLACES_DATA[2].averageRating,
                  sortOrder: 1,
                },
                {
                  placeId: createdPlaces[3],
                  title: SEEDED_PLACES_DATA[3].name,
                  description: "Cung đường cảnh quan được chọn cho lịch trình trải nghiệm.",
                  imageUrl: createdPlaceCoverImages[3],
                  period: "AFTERNOON",
                  scheduledTime: "14:00",
                  estimatedCost: 875000,
                  rating: SEEDED_PLACES_DATA[3].averageRating,
                  sortOrder: 2,
                },
              ],
            },
          },
          {
            dayNumber: 3,
            title: "Ngày 3: Mùa vàng vùng cao",
            date: addUtcDays(sampleTripStartDate, 2),
            estimatedBudget: 750000,
            isExpanded: true,
            activities: {
              create: [
                {
                  placeId: createdPlaces[4],
                  title: SEEDED_PLACES_DATA[4].name,
                  description: "Điểm ngắm cảnh ruộng bậc thang được chọn cho ngày thư giãn.",
                  imageUrl: createdPlaceCoverImages[4],
                  period: "MORNING",
                  scheduledTime: "08:30",
                  estimatedCost: 750000,
                  rating: SEEDED_PLACES_DATA[4].averageRating,
                  sortOrder: 1,
                },
              ],
            },
          },
          {
            dayNumber: 4,
            title: "Ngày 4: Trải nghiệm ẩm thực địa phương",
            date: addUtcDays(sampleTripStartDate, 3),
            estimatedBudget: 875000,
            isExpanded: true,
            activities: {
              create: [
                {
                  placeId: createdPlaces[5],
                  title: SEEDED_PLACES_DATA[5].name,
                  description: "Điểm ăn uống được chọn để trải nghiệm hương vị địa phương.",
                  imageUrl: createdPlaceCoverImages[5],
                  period: "AFTERNOON",
                  scheduledTime: "12:30",
                  estimatedCost: 875000,
                  rating: SEEDED_PLACES_DATA[5].averageRating,
                  sortOrder: 1,
                },
              ],
            },
          },
          {
            dayNumber: 5,
            title: "Ngày 5: Vùng cao mùa vàng",
            date: addUtcDays(sampleTripStartDate, 4),
            estimatedBudget: 1000000,
            isExpanded: true,
            activities: {
              create: [
                {
                  placeId: createdPlaces[4],
                  title: SEEDED_PLACES_DATA[4].name,
                  description: "Điểm ngắm cảnh được chọn cho hành trình vùng cao.",
                  imageUrl: createdPlaceCoverImages[4],
                  period: "MORNING",
                  scheduledTime: "09:30",
                  estimatedCost: 1000000,
                  rating: SEEDED_PLACES_DATA[4].averageRating,
                  sortOrder: 1,
                },
              ],
            },
          },
          {
            dayNumber: 6,
            title: "Ngày 6: Điểm hẹn địa phương",
            date: addUtcDays(sampleTripStartDate, 5),
            estimatedBudget: 750000,
            isExpanded: true,
            activities: {
              create: [
                {
                  placeId: createdPlaces[6],
                  title: SEEDED_PLACES_DATA[6].name,
                  description: "Điểm đến được yêu thích được chọn cho lịch trình trong ngày.",
                  imageUrl: createdPlaceCoverImages[6],
                  period: "AFTERNOON",
                  scheduledTime: "15:00",
                  estimatedCost: 750000,
                  rating: SEEDED_PLACES_DATA[6].averageRating,
                  sortOrder: 1,
                },
              ],
            },
          },
          {
            dayNumber: 7,
            title: "Ngày 7: Kết thúc hành trình",
            date: addUtcDays(sampleTripStartDate, 6),
            estimatedBudget: 625000,
            isExpanded: true,
            activities: {
              create: [
                {
                  placeId: createdPlaces[8],
                  title: SEEDED_PLACES_DATA[8].name,
                  description: "Điểm dừng cuối được chọn để khép lại chuyến đi.",
                  imageUrl: createdPlaceCoverImages[8],
                  period: "MORNING",
                  scheduledTime: "09:00",
                  estimatedCost: 625000,
                  rating: SEEDED_PLACES_DATA[8].averageRating,
                  sortOrder: 1,
                },
              ],
            },
          },
        ],
      },
    },
  });
  } catch (error) {
    console.log("=== Lỗi tạo sampleTrip ===");
    console.error(error);
    process.exit(1);
  }

  const weekendTrip = await prisma.trip.create({
    data: {
      userId: demoUser.id,
      title: "Cuối tuần khám phá ẩm thực Việt",
      destination: "Việt Nam",
      currentHotelName: "Khách sạn Trung Tâm Boutique",
      startDate: weekendTripStartDate,
      endDate: addUtcDays(weekendTripStartDate, 2),
      budget: 4500000,
      totalBudgetPerPerson: 4500000,
      coverImageUrl: createdPlaceCoverImages[5],
      currency: "VND",
      members: {
        create: [
          { userId: travelerUsers[0].id, status: "ACTIVE", joinedAt: weekendTripStartDate, inviteAcceptedAt: weekendTripStartDate },
          { userId: travelerUsers[3].id, status: "ACTIVE", joinedAt: weekendTripStartDate, inviteAcceptedAt: weekendTripStartDate },
        ],
      },
      days: {
        create: [
          {
            dayNumber: 1,
            title: "Ngày 1: Bữa tối địa phương",
            date: weekendTripStartDate,
            estimatedBudget: 1125000,
            isExpanded: true,
            activities: {
              create: [
                {
                  placeId: createdPlaces[5],
                  title: SEEDED_PLACES_DATA[5].name,
                  description: "Quán ăn địa phương được chọn cho bữa tối đầu tiên.",
                  imageUrl: createdPlaceCoverImages[5],
                  period: "EVENING",
                  scheduledTime: "18:30",
                  estimatedCost: 1125000,
                  rating: SEEDED_PLACES_DATA[5].averageRating,
                  sortOrder: 1,
                },
              ],
            },
          },
          {
            dayNumber: 2,
            title: "Ngày 2: Ăn trưa và dạo phố",
            date: addUtcDays(weekendTripStartDate, 1),
            estimatedBudget: 875000,
            isExpanded: true,
            activities: {
              create: [
                {
                  placeId: createdPlaces[7],
                  title: SEEDED_PLACES_DATA[7].name,
                  description: "Điểm dừng ẩm thực được chọn cho buổi trưa.",
                  imageUrl: createdPlaceCoverImages[7],
                  period: "AFTERNOON",
                  scheduledTime: "13:00",
                  estimatedCost: 875000,
                  rating: SEEDED_PLACES_DATA[7].averageRating,
                  sortOrder: 1,
                },
              ],
            },
          },
          {
            dayNumber: 3,
            title: "Ngày 3: Cà phê và mua quà",
            date: addUtcDays(weekendTripStartDate, 2),
            estimatedBudget: 700000,
            isExpanded: true,
            activities: {
              create: [
                {
                  placeId: createdPlaces[9],
                  title: SEEDED_PLACES_DATA[9].name,
                  description: "Điểm dừng nhẹ nhàng được chọn trước khi kết thúc chuyến đi.",
                  imageUrl: createdPlaceCoverImages[9],
                  period: "MORNING",
                  scheduledTime: "10:00",
                  estimatedCost: 700000,
                  rating: SEEDED_PLACES_DATA[9].averageRating,
                  sortOrder: 1,
                },
              ],
            },
          },
        ],
      },
    },
  });

  const pendingInviteTrip = await prisma.trip.create({
    data: {
      userId: travelerUsers[3].id,
      title: "Rủ rê săn mây Đà Lạt",
      destination: "Đà Lạt, Lâm Đồng",
      currentHotelName: "Homestay Đồi Thông",
      startDate: pendingInviteTripStartDate,
      endDate: addUtcDays(pendingInviteTripStartDate, 2),
      budget: 3600000,
      totalBudgetPerPerson: 1800000,
      coverImageUrl: createdPlaceCoverImages[6],
      currency: "VND",
      members: {
        create: [
          { userId: travelerUsers[3].id, status: "ACTIVE", joinedAt: inviteCreatedAt, inviteAcceptedAt: inviteCreatedAt },
          { userId: demoUser.id, invitedById: travelerUsers[3].id, status: "PENDING" },
        ],
      },
    },
  });

  console.log("Creating sample notifications...");
  const notificationData: Prisma.NotificationCreateInput[] = [
    {
      type: "invited",
      actor: { connect: { id: travelerUsers[3].id } },
      targetId: pendingInviteTrip.id,
      title: "Trip invitation",
      body: "You have been invited to a trip.",
      data: {
        tripId: pendingInviteTrip.id,
        username: travelerUsers[3].fullName ?? travelerUsers[3].username ?? travelerUsers[3].email,
        itineraryName: pendingInviteTrip.title,
        days: 3,
      },
      createdAt: inviteCreatedAt,
      recipients: {
        create: {
          userId: demoUser.id,
          isRead: false,
          createdAt: inviteCreatedAt,
        },
      },
    },
    {
      type: "like_comment",
      actor: { connect: { id: ownerUser.id } },
      targetId: createdPlaces[0],
      title: "Review liked",
      body: "Someone liked your review.",
      data: {
        placeName: SEEDED_PLACES_DATA[0].name,
        reviewId: demoReviewAtFirstPlace.id,
      },
      createdAt: withUtcTime(seedToday, 9, 15),
      recipients: {
        create: {
          userId: demoUser.id,
          isRead: false,
          createdAt: withUtcTime(seedToday, 9, 15),
        },
      },
    },
    {
      type: "upcoming",
      targetId: sampleTrip.id,
      title: "Upcoming trip",
      body: "Your trip is coming up.",
      data: {
        itineraryName: sampleTrip.title,
        days: 7,
      },
      createdAt: upcomingSampleCreatedAt,
      recipients: {
        create: {
          userId: demoUser.id,
          isRead: true,
          readAt: upcomingSampleCreatedAt,
          createdAt: upcomingSampleCreatedAt,
        },
      },
    },
    {
      type: "like_comment",
      actor: { connect: { id: travelerUsers[2].id } },
      targetId: createdPlaces[2],
      title: "Review liked",
      body: "Someone liked your review.",
      data: {
        placeId: createdPlaces[2],
        placeName: SEEDED_PLACES_DATA[2].name,
        reviewId: demoReviewAtThirdPlace.id,
      },
      createdAt: withUtcTime(seedToday, 11, 10),
      recipients: {
        create: {
          userId: demoUser.id,
          isRead: false,
          createdAt: withUtcTime(seedToday, 11, 10),
        },
      },
    },
    {
      type: "upcoming",
      targetId: weekendTrip.id,
      title: "Hotel reminder",
      body: "Review your hotel details before the weekend trip.",
      data: {
        tripId: weekendTrip.id,
        itineraryName: weekendTrip.title,
        hotelName: weekendTrip.currentHotelName,
        days: 5,
      },
      createdAt: upcomingWeekendCreatedAt,
      recipients: {
        create: {
          userId: demoUser.id,
          isRead: true,
          readAt: withUtcTime(seedToday, 2, 30),
          createdAt: upcomingWeekendCreatedAt,
        },
      },
    },
  ];
  let createdNotificationCount = 0;
  for (const notification of notificationData) {
    await prisma.notification.create({ data: notification });
    createdNotificationCount++;
  }

  const activePromotions = createdPromotions.filter((promotion) => promotion.isActive);
  for (let idx = 0; idx < activePromotions.length; idx++) {
    const promotion = activePromotions[idx];
    const placeIdx = promotionPlaceIndexes[createdPromotions.findIndex((p) => p.id === promotion.id)];
    const favorites = await prisma.favorite.findMany({
      where: { placeId: promotion.placeId },
      select: { userId: true },
    });
    if (favorites.length === 0) continue;

    await prisma.notification.create({
      data: {
        type: "promotion",
        actor: { connect: { id: secondOwnerPlaceIndexes.has(placeIdx) ? secondOwnerUser.id : ownerUser.id } },
        targetId: promotion.placeId,
        title: promotion.title,
        body: "A place you saved has a new promotion.",
        data: {
          promotionId: promotion.id,
          placeId: promotion.placeId,
          placeName: SEEDED_PLACES_DATA[placeIdx].name,
        },
        createdAt: new Date(Date.UTC(2026, 5, 3, 8 + idx, 0, 0)),
        recipients: {
          create: favorites.map((favorite) => ({
            userId: favorite.userId,
            isRead: false,
            createdAt: new Date(Date.UTC(2026, 5, 3, 8 + idx, 0, 0)),
          })),
        },
      },
    });
    createdNotificationCount++;
  }

  const tripStats = {
    trips: 3,
    days: 10,
    activities: 12,
    members: 7,
    notifications: createdNotificationCount,
  };
  const [totalReviews, totalFavorites] = await Promise.all([
    prisma.review.count(),
    prisma.favorite.count(),
  ]);
  const countCategory = (category: string) =>
    SEEDED_PLACES_DATA.filter(p => String(p.category) === category).length;
  const attractions  = countCategory("ATTRACTIONS");
  const dining       = countCategory("DINING");
  const festivals    = countCategory("FESTIVALS");
  const stays        = countCategory("STAYS");
  const shopping     = countCategory("SHOPPING");

  console.log("\n✅ Seed completed successfully!");
  console.log(`📊 Summary:`);
  console.log(`   👥 ${createdUsers.length} users (${travelerUsers.length} travelers + 2 owners + 1 admin)`);
  console.log(`   🏝️  ${SEEDED_PLACES_DATA.length} places (${attractions} ATTRACTIONS · ${dining} DINING · ${festivals} FESTIVALS · ${stays} STAYS · ${shopping} SHOPPING)`);
  console.log(`   ⭐ ${totalReviews} reviews (${prePromotionReviewCount} before owner promotions, ${postPromotionReviewCount} after owner promotions)`);
  console.log(`   🎫 ${createdPromotions.length} promotions (${activePromotions.length} active)`);
  console.log(`   ❤️  ${totalFavorites} favorites`);
  console.log(`   trips: ${tripStats.trips} (${sampleTrip.title}, ${weekendTrip.title}, ${pendingInviteTrip.title})`);
  console.log(`   trip days: ${tripStats.days}, activities: ${tripStats.activities}, members: ${tripStats.members}`);
  console.log(`   notifications: ${tripStats.notifications} total notification rows`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });

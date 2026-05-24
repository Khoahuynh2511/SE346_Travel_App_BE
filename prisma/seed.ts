import "dotenv/config";
import { createHash } from "node:crypto";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { env } from "../src/config/env.js";

const prisma = new PrismaClient();

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
];

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
    averageRating: 4.9, ratingCount: 3200, priceLevel: 150,
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
    averageRating: 4.8, ratingCount: 2850, priceLevel: 50,
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
    ],
  },

  {
    name: "Kinh Thành Huế",
    region: "Thừa Thiên Huế, Việt Nam",
    category: "ATTRACTIONS" as const,
    featureLabel: "Di sản lịch sử",
    averageRating: 4.7, ratingCount: 1950, priceLevel: 80,
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
    ],
  },

  {
    name: "Cao Nguyên Đá Đồng Văn",
    region: "Hà Giang, Việt Nam",
    category: "ATTRACTIONS" as const,
    featureLabel: "Công viên địa chất UNESCO",
    averageRating: 4.9, ratingCount: 1200, priceLevel: 90,
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
    averageRating: 4.8, ratingCount: 980, priceLevel: 70,
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
    averageRating: 4.9, ratingCount: 1650, priceLevel: 120,
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
    averageRating: 4.7, ratingCount: 2100, priceLevel: 110,
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
    ],
  },

  {
    name: "Đảo Phú Quốc",
    region: "Kiên Giang, Việt Nam",
    category: "ATTRACTIONS" as const,
    featureLabel: "Đảo Ngọc",
    averageRating: 4.8, ratingCount: 2700, priceLevel: 200,
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
    ],
  },

  {
    name: "Mũi Né - Đồi Cát Bay",
    region: "Bình Thuận, Việt Nam",
    category: "ATTRACTIONS" as const,
    featureLabel: "Sa mạc Việt Nam",
    averageRating: 4.6, ratingCount: 1400, priceLevel: 85,
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
    averageRating: 4.5, ratingCount: 1100, priceLevel: 30,
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
    averageRating: 4.8, ratingCount: 1800, priceLevel: 35,
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
    ],
  },

  {
    name: "Bún Chả Hương Liên",
    region: "Hà Nội, Việt Nam",
    category: "DINING" as const,
    featureLabel: "Obama từng ghé",
    averageRating: 4.8, ratingCount: 1500, priceLevel: 25,
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
    averageRating: 4.9, ratingCount: 2000, priceLevel: 15,
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
    averageRating: 4.7, ratingCount: 1200, priceLevel: 35,
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
    averageRating: 4.6, ratingCount: 750, priceLevel: 30,
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
    averageRating: 4.7, ratingCount: 1100, priceLevel: 80,
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
    ],
  },

  {
    name: "Nhà Hàng Ngon Hà Nội",
    region: "Hà Nội, Việt Nam",
    category: "DINING" as const,
    featureLabel: "Đang mở cửa",
    averageRating: 4.6, ratingCount: 890, priceLevel: 45,
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
    averageRating: 4.6, ratingCount: 680, priceLevel: 40,
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
    averageRating: 4.7, ratingCount: 960, priceLevel: 20,
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
    averageRating: 4.9, ratingCount: 2200, priceLevel: 20,
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
    averageRating: 4.7, ratingCount: 1100, priceLevel: 60,
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
    ],
  },

  {
    name: "Tết Nguyên Đán Hà Nội",
    region: "Hà Nội, Việt Nam",
    category: "FESTIVALS" as const,
    featureLabel: "Hàng năm - Tháng 1/2",
    averageRating: 4.8, ratingCount: 1800, priceLevel: 10,
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
    ],
  },

  {
    name: "Lễ Hội Pháo Hoa Quốc Tế Đà Nẵng",
    region: "Đà Nẵng, Việt Nam",
    category: "FESTIVALS" as const,
    featureLabel: "Tháng 6-7 hàng năm",
    averageRating: 4.9, ratingCount: 3100, priceLevel: 120,
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
    averageRating: 4.6, ratingCount: 920, priceLevel: 35,
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
    averageRating: 4.8, ratingCount: 560, priceLevel: 40,
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
    averageRating: 4.5, ratingCount: 780, priceLevel: 50,
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
    averageRating: 4.4, ratingCount: 420, priceLevel: 25,
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
    averageRating: 4.7, ratingCount: 640, priceLevel: 30,
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
    averageRating: 4.6, ratingCount: 480, priceLevel: 20,
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

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  const storage = requireSupabaseConfig();
  const bucket = env.supabaseStorageBucket;

  console.log("🗑️  Clearing existing data...");
  await prisma.promotion.deleteMany();
  await prisma.reviewLike.deleteMany();
  await prisma.reviewImage.deleteMany();
  await prisma.placeImage.deleteMany();
  await prisma.review.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.place.deleteMany();
  await prisma.user.deleteMany();

  // ── Users ──────────────────────────────────────────────────────────────────
  console.log("👥 Creating users...");
  const passwordHash = await bcrypt.hash("demo1234", 10);
  const seededUsers = await Promise.all(
    USERS_DATA.map(async (u) => {
      if (!u.avatarUrl) return { ...u, avatarUrl: null };
      const avatarKey = u.username ?? u.email.split("@")[0] ?? "user";
      const avatarUrl = await uploadSeedImage({
        storage,
        bucket,
        objectPath: buildSeedObjectPath(`seed/users/${avatarKey}`, u.avatarUrl),
        imageUrl: u.avatarUrl,
      });
      return { ...u, avatarUrl };
    })
  );
  const createdUsers = await Promise.all(
    seededUsers.map((u) =>
      prisma.user.create({
        data: {
          email: u.email, passwordHash,
          role: u.role, fullName: u.fullName, username: u.username,
          location: u.location, avatarUrl: u.avatarUrl ?? null,
        },
      })
    )
  );
  const ownerUser    = createdUsers[9];
  const travelerUsers = createdUsers.slice(0, 9);
  console.log(`✅ Created ${createdUsers.length} users`);

  // ── Places + Images + Reviews ──────────────────────────────────────────────
  const createdPlaces: string[] = [];

  for (let i = 0; i < PLACES_DATA.length; i++) {
    const p = PLACES_DATA[i];
    const slug = p.name.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 30);
    console.log(`🏝️  [${i + 1}/${PLACES_DATA.length}] Seeding: ${p.name}`);

    const uploadedImages = await uploadSeedImages({
      storage, bucket,
      prefix: `seed/places/${slug}`,
      imageUrls: p.images,
    });

    const place = await prisma.place.create({
      data: {
        ownerId: ownerUser.id,
        name: p.name, region: p.region, category: p.category,
        coverImageUrl: uploadedImages[0],
        featureLabel: p.featureLabel,
        averageRating: p.averageRating, ratingCount: p.ratingCount,
        priceLevel: p.priceLevel,
        latitude: p.latitude ?? null, longitude: p.longitude ?? null,
        about: p.about,
      },
    });
    createdPlaces.push(place.id);

    if (uploadedImages.length > 1) {
      await prisma.placeImage.createMany({
        data: uploadedImages.slice(1).map((url) => ({ placeId: place.id, url })),
      });
    }

    for (const rev of p.reviews) {
      await prisma.review.create({
        data: {
          placeId: place.id,
          userId: travelerUsers[rev.userIdx].id,
          rating: rev.rating,
          content: rev.content,
        },
      });
    }

    // First 3 travelers favorite every place
    for (let fi = 0; fi < Math.min(3, travelerUsers.length); fi++) {
      await prisma.favorite.create({
        data: { userId: travelerUsers[fi].id, placeId: place.id },
      });
    }
  }

  // ── Promotions ─────────────────────────────────────────────────────────────
  console.log("🎫 Creating promotions...");
  const promoTemplates = [
    { title: "Giảm 20% Tour Khám Phá",   isActive: true,  startDate: "01/06/2025", endDate: "30/06/2025", days: ["T2","T3","T4","T5","T6"], startTime: "08:00 AM", endTime: "05:00 PM", specificTime: true  },
    { title: "Combo Gia Đình - Tiết Kiệm 30%", isActive: true,  startDate: "15/06/2025", endDate: "15/08/2025", days: ["T7","CN"],            startTime: "09:00 AM", endTime: "06:00 PM", specificTime: true  },
    { title: "Khuyến Mãi Mùa Hè Rực Rỡ", isActive: false, startDate: "01/07/2025", endDate: "31/08/2025", days: ["T2","T3","T4","T5","T6","T7","CN"], startTime: "", endTime: "", specificTime: false },
    { title: "Giảm 15% Đặt Sớm",          isActive: true,  startDate: "01/05/2025", endDate: "31/12/2025", days: ["T2","T3","T4","T5","T6"], startTime: "10:00 AM", endTime: "02:00 PM", specificTime: true  },
    { title: "Happy Hour Cuối Tuần",       isActive: true,  startDate: "01/06/2025", endDate: "30/09/2025", days: ["T7","CN"],                startTime: "04:00 PM", endTime: "08:00 PM", specificTime: true  },
  ];

  await prisma.promotion.createMany({
    data: createdPlaces.slice(0, 5).map((placeId, idx) => ({
      placeId,
      ...promoTemplates[idx],
    })),
  });

  const totalReviews = PLACES_DATA.reduce((a, p) => a + p.reviews.length, 0);
  const attractions  = PLACES_DATA.filter(p => p.category === "ATTRACTIONS").length;
  const dining       = PLACES_DATA.filter(p => p.category === "DINING").length;
  const festivals    = PLACES_DATA.filter(p => p.category === "FESTIVALS").length;

  console.log("\n✅ Seed completed successfully!");
  console.log(`📊 Summary:`);
  console.log(`   👥 ${createdUsers.length} users (${createdUsers.length - 1} travelers + 1 owner)`);
  console.log(`   🏝️  ${PLACES_DATA.length} places (${attractions} ATTRACTIONS · ${dining} DINING · ${festivals} FESTIVALS)`);
  console.log(`   ⭐ ${totalReviews} reviews`);
  console.log(`   🎫 5 promotions`);
  console.log(`   ❤️  ${createdPlaces.length * 3} favorites`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
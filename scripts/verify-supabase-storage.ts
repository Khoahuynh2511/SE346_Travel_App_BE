import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "review-images";

async function main() {
  if (!url || !key) {
    console.error("Thieu SUPABASE_URL hoac SUPABASE_SERVICE_ROLE_KEY trong .env");
    process.exit(1);
  }

  if (key.startsWith("sb_publishable")) {
    console.error(
      "SUPABASE_SERVICE_ROLE_KEY dang la publishable key (sb_publishable_*).\n" +
        "Vao Supabase Dashboard -> Project Settings -> API -> service_role (secret, bat dau eyJ...)\n" +
        "Dan key do vao .env, KHONG dung publishable key cho upload server-side."
    );
    process.exit(1);
  }

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: buckets, error: listErr } = await client.storage.listBuckets();
  if (listErr) {
    console.error("Khong ket noi Storage:", listErr.message);
    process.exit(1);
  }

  const exists = buckets?.some((b) => b.name === bucketName);
  if (!exists) {
    const { error: createErr } = await client.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
    });
    if (createErr) {
      console.error(`Khong tao duoc bucket "${bucketName}":`, createErr.message);
      process.exit(1);
    }
    console.log(`Da tao bucket public: ${bucketName}`);
  } else {
    console.log(`Bucket "${bucketName}" da ton tai`);
  }

  const testPath = `_healthcheck/${Date.now()}.txt`;
  const body = new TextEncoder().encode("ok");
  const { error: upErr } = await client.storage
    .from(bucketName)
    .upload(testPath, body, { contentType: "text/plain", upsert: true });
  if (upErr) {
    console.error("Upload test that bai:", upErr.message);
    process.exit(1);
  }

  const { data: pub } = client.storage.from(bucketName).getPublicUrl(testPath);
  await client.storage.from(bucketName).remove([testPath]);

  console.log("Supabase Storage san sang.");
  console.log("Public URL mau:", pub.publicUrl);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

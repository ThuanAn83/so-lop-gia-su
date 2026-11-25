// Tạo / cập nhật tài khoản phụ huynh (đăng nhập bằng số điện thoại + mật khẩu).
// Chỉ gia sư (admin) gọi được, và chỉ cho học sinh của chính họ.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const phoneEmail = (phone: string) => `${phone}@phuhuynh.solop.local`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Chỉ hỗ trợ POST" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: who, error: whoErr } = await admin.auth.getUser(token);
  if (whoErr || !who?.user) return json({ error: "Bạn cần đăng nhập lại." }, 401);
  const callerId = who.user.id;

  const { data: prof } = await admin.from("profiles").select("role").eq("id", callerId).single();
  if (prof?.role !== "admin") return json({ error: "Chỉ gia sư mới tạo được tài khoản phụ huynh." }, 403);

  let body: { action?: string; student_id?: string; phone?: string; password?: string; parent_name?: string };
  try { body = await req.json(); } catch { return json({ error: "Dữ liệu gửi lên không hợp lệ." }, 400); }
  const action = body.action || "link";

  const { data: student } = await admin.from("students").select("id,tutor_id,parent_id").eq("id", body.student_id || "").single();
  if (!student || student.tutor_id !== callerId) return json({ error: "Không tìm thấy học sinh này trong sổ của bạn." }, 404);

  if (action === "unlink") {
    await admin.from("students").update({ parent_id: null }).eq("id", student.id);
    return json({ ok: true });
  }

  const phone = String(body.phone || "").replace(/\D/g, "").replace(/^84/, "0");
  if (!/^0\d{9,10}$/.test(phone)) return json({ error: "Số điện thoại chưa đúng. Hãy nhập 10 số, ví dụ 0901234567." }, 400);
  const password = String(body.password || "");
  if (password && password.length < 6) return json({ error: "Mật khẩu cần ít nhất 6 ký tự." }, 400);

  // Tìm tài khoản phụ huynh đã có với số điện thoại này
  const { data: existing } = await admin.from("profiles").select("id").eq("role", "parent").eq("phone", phone).maybeSingle();
  let parentId = existing?.id as string | undefined;

  if (!parentId) {
    if (!password) return json({ error: "Hãy đặt mật khẩu cho tài khoản phụ huynh mới." }, 400);
    const { data: created, error } = await admin.auth.admin.createUser({
      email: phoneEmail(phone),
      password,
      email_confirm: true,
      app_metadata: { role: "parent", phone },
      user_metadata: { full_name: body.parent_name || "" },
    });
    if (error || !created?.user) return json({ error: "Chưa tạo được tài khoản: " + (error?.message || "lỗi không rõ") }, 400);
    parentId = created.user.id;
  } else if (password) {
    // Chỉ được đổi mật khẩu nếu mọi học sinh gắn với tài khoản này đều thuộc sổ của bạn
    const { data: kids } = await admin.from("students").select("tutor_id").eq("parent_id", parentId);
    if ((kids || []).some((k) => k.tutor_id !== callerId))
      return json({ error: "Số điện thoại này đã có tài khoản do gia sư khác tạo. Bạn vẫn gắn được học sinh, nhưng không đổi được mật khẩu." }, 403);
    const { error } = await admin.auth.admin.updateUserById(parentId, { password });
    if (error) return json({ error: "Chưa đổi được mật khẩu: " + error.message }, 400);
  }

  await admin.from("students").update({ parent_id: parentId, phone }).eq("id", student.id);
  return json({ ok: true, phone, existed: !!existing });
});

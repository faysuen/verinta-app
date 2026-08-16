import { createClient } from '@supabase/supabase-js';

// 用请求里带来的用户 access token，建一个"以该用户身份"访问的 Supabase 客户端，
// 这样查询会自动遵守 RLS（用户只能碰到自己的数据），不需要额外手写权限判断
export function createSupabaseServerClient(accessToken) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {}
      }
    }
  );
}

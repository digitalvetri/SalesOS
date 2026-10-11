// Verify the owner can actually sign in with the known credentials.
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const email = process.argv[2] ?? "team.digitalvetri@gmail.com";
const password = process.argv[3] ?? "Sales@2026";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

console.log(`Attempting sign-in: ${email} / ${password}`);
const { data, error } = await sb.auth.signInWithPassword({ email, password });
if (error) {
  console.log(`\nFAILED: ${error.message}`);
  console.log(`Status: ${error.status}`);
  process.exit(1);
}
console.log(`\nOK — session created for ${data.user?.email}`);
console.log(`  user id: ${data.user?.id}`);

// Verify the owner can actually sign in with the known credentials.
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

function required(name, value) {
  if (!value) {
    console.error(`Missing ${name}. Set it in the environment (see .env.example).`);
    process.exit(1);
  }
  return value;
}
const email = required("email (arg 1)", process.argv[2]);
const password = required("password (arg 2)", process.argv[3]);

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

console.log(`Attempting sign-in: ${email}`);
const { data, error } = await sb.auth.signInWithPassword({ email, password });
if (error) {
  console.log(`\nFAILED: ${error.message}`);
  console.log(`Status: ${error.status}`);
  process.exit(1);
}
console.log(`\nOK — session created for ${data.user?.email}`);
console.log(`  user id: ${data.user?.id}`);

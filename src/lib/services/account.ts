import type { createAdminClient } from "@/lib/supabase-admin";

type AdminClientType = NonNullable<ReturnType<typeof createAdminClient>>;

export async function deleteAccount(admin: AdminClientType, userId: string): Promise<void> {
  // FK cascades from auth.users wipe all app data (decks, cards, SR state,
  // review logs) — deleting the auth user is the only call needed.
  const { error } = await admin.auth.admin.deleteUser(userId);

  if (error) {
    throw new Error(error.message);
  }
}

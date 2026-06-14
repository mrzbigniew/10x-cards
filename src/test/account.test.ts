import { describe, it, expect, vi, beforeEach } from "vitest";
import { deleteAccount } from "@/lib/services/account";
import type { createAdminClient } from "@/lib/supabase-admin";

type AdminClientType = NonNullable<ReturnType<typeof createAdminClient>>;

const USER_ID = "user-uuid";
const CONFIRMATION = "USUŃ KONTO";

// ---------------------------------------------------------------------------
// deleteAccount — serwis
// ---------------------------------------------------------------------------

describe("deleteAccount: usuwanie konta przez API administracyjne", () => {
  const deleteUserFn = vi.fn();

  function makeAdmin(): AdminClientType {
    return {
      auth: { admin: { deleteUser: deleteUserFn } },
    } as unknown as AdminClientType;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("kończy się powodzeniem gdy API administracyjne nie zwraca błędu", async () => {
    deleteUserFn.mockResolvedValueOnce({ data: { user: null }, error: null });

    await expect(deleteAccount(makeAdmin(), USER_ID)).resolves.toBeUndefined();
    expect(deleteUserFn).toHaveBeenCalledWith(USER_ID);
  });

  it("rzuca błąd z oryginalnym komunikatem gdy API administracyjne zwraca błąd", async () => {
    deleteUserFn.mockResolvedValueOnce({ data: { user: null }, error: { message: "User not found" } });

    await expect(deleteAccount(makeAdmin(), USER_ID)).rejects.toThrow("User not found");
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/account — handler trasy
// ---------------------------------------------------------------------------

const mockCreateAdminClient = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  createAdminClient: (...args: unknown[]) => mockCreateAdminClient(...args),
}));

const mockCreateClient = vi.fn();
vi.mock("@/lib/supabase", () => ({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

import { DELETE } from "@/pages/api/account";

describe("DELETE /api/account: macierz statusów", () => {
  const deleteUserFn = vi.fn();
  const signOutFn = vi.fn();

  function makeContext(options: { user?: { id: string } | null; body?: unknown; invalidJson?: boolean }) {
    return {
      locals: { user: options.user ?? null },
      request: {
        headers: new Headers(),
        json: options.invalidJson
          ? vi.fn().mockRejectedValue(new SyntaxError("Unexpected token"))
          : vi.fn().mockResolvedValue(options.body),
      },
      cookies: {},
    } as unknown as Parameters<typeof DELETE>[0];
  }

  beforeEach(() => {
    vi.clearAllMocks();
    deleteUserFn.mockResolvedValue({ data: { user: null }, error: null });
    signOutFn.mockResolvedValue({ error: null });
    mockCreateAdminClient.mockReturnValue({ auth: { admin: { deleteUser: deleteUserFn } } });
    mockCreateClient.mockReturnValue({ auth: { signOut: signOutFn } });
  });

  it("zwraca 401 gdy brak zalogowanego użytkownika", async () => {
    const res = await DELETE(makeContext({ user: null, body: { confirmation: CONFIRMATION } }));

    expect(res.status).toBe(401);
    expect(deleteUserFn).not.toHaveBeenCalled();
  });

  it("zwraca 400 gdy body nie jest poprawnym JSON-em", async () => {
    const res = await DELETE(makeContext({ user: { id: USER_ID }, invalidJson: true }));

    expect(res.status).toBe(400);
    expect(deleteUserFn).not.toHaveBeenCalled();
  });

  it("zwraca 400 gdy brakuje frazy potwierdzającej", async () => {
    const res = await DELETE(makeContext({ user: { id: USER_ID }, body: {} }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain("USUŃ KONTO");
    expect(deleteUserFn).not.toHaveBeenCalled();
  });

  it("zwraca 400 gdy fraza potwierdzająca jest błędna", async () => {
    const res = await DELETE(makeContext({ user: { id: USER_ID }, body: { confirmation: "usuń konto" } }));

    expect(res.status).toBe(400);
    expect(deleteUserFn).not.toHaveBeenCalled();
  });

  it("zwraca 503 gdy klient administracyjny nie jest skonfigurowany", async () => {
    mockCreateAdminClient.mockReturnValueOnce(null);

    const res = await DELETE(makeContext({ user: { id: USER_ID }, body: { confirmation: CONFIRMATION } }));

    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("Baza danych nie jest skonfigurowana");
  });

  it("zwraca 200 gdy klient sesyjny nie jest skonfigurowany — usuwa konto, pomija signOut", async () => {
    mockCreateClient.mockReturnValueOnce(null);

    const res = await DELETE(makeContext({ user: { id: USER_ID }, body: { confirmation: CONFIRMATION } }));

    expect(res.status).toBe(200);
    expect(deleteUserFn).toHaveBeenCalledWith(USER_ID);
    expect(signOutFn).not.toHaveBeenCalled();
  });

  it("zwraca 500 z komunikatem błędu gdy usunięcie użytkownika się nie powiedzie", async () => {
    deleteUserFn.mockResolvedValueOnce({ data: { user: null }, error: { message: "boom" } });

    const res = await DELETE(makeContext({ user: { id: USER_ID }, body: { confirmation: CONFIRMATION } }));

    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("boom");
  });

  it("zwraca 200 po pomyślnym usunięciu konta", async () => {
    const res = await DELETE(makeContext({ user: { id: USER_ID }, body: { confirmation: CONFIRMATION } }));

    expect(res.status).toBe(200);
    expect(deleteUserFn).toHaveBeenCalledWith(USER_ID);
    expect(signOutFn).toHaveBeenCalled();
  });

  it("zwraca 200 nawet gdy signOut() rzuca błąd (konto już usunięte)", async () => {
    signOutFn.mockRejectedValueOnce(new Error("session gone"));

    const res = await DELETE(makeContext({ user: { id: USER_ID }, body: { confirmation: CONFIRMATION } }));

    expect(res.status).toBe(200);
    expect(deleteUserFn).toHaveBeenCalledWith(USER_ID);
  });

  it("usuwa wyłącznie użytkownika z sesji, nigdy id podane w body", async () => {
    const res = await DELETE(
      makeContext({
        user: { id: USER_ID },
        body: { confirmation: CONFIRMATION, userId: "attacker-supplied-id" },
      }),
    );

    expect(res.status).toBe(200);
    expect(deleteUserFn).toHaveBeenCalledTimes(1);
    expect(deleteUserFn).toHaveBeenCalledWith(USER_ID);
    expect(deleteUserFn).not.toHaveBeenCalledWith("attacker-supplied-id");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("astro:middleware", () => ({
  defineMiddleware: <T>(fn: T): T => fn,
}));

const mockGetUser = vi.fn();
const mockCreateClient = vi.fn();
vi.mock("@/lib/supabase", () => ({
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  createClient: (...args: unknown[]) => mockCreateClient(...args),
}));

import { onRequest } from "@/middleware";

interface MockContext {
  url: URL;
  locals: Record<string, unknown>;
  request: { headers: Headers };
  cookies: Record<string, unknown>;
  redirect: ReturnType<typeof vi.fn>;
}

function makeContext(path: string): MockContext {
  return {
    url: new URL(path, "http://localhost"),
    locals: {},
    request: { headers: new Headers() },
    cookies: {},
    redirect: vi.fn().mockReturnValue(new Response(null, { status: 302 })),
  };
}

const next = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

beforeEach(() => {
  vi.resetAllMocks();
  mockCreateClient.mockReturnValue({ auth: { getUser: mockGetUser } });
  next.mockResolvedValue(new Response(null, { status: 200 }));
});

describe("middleware: bramka uwierzytelniania", () => {
  it("nieuwhentykowany użytkownik wywołujący /api/decks otrzymuje 401", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const ctx = makeContext("/api/decks");

    const response = await onRequest(ctx as never, next);

    expect((response as Response).status).toBe(401);
  });

  it("nieuwhentykowany użytkownik odwiedzający /dashboard jest przekierowany na /auth/signin", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const ctx = makeContext("/dashboard");

    await onRequest(ctx as never, next);

    expect(ctx.redirect).toHaveBeenCalledWith("/auth/signin");
  });

  it("uwierzytelniony użytkownik wywołujący /api/decks przechodzi dalej (next wywołany)", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: "user-1" } } });
    const ctx = makeContext("/api/decks");

    await onRequest(ctx as never, next);

    expect(next).toHaveBeenCalled();
  });

  it("nieuwhentykowany użytkownik wywołujący /api/auth/signin przechodzi dalej (publiczna trasa API)", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const ctx = makeContext("/api/auth/signin");

    await onRequest(ctx as never, next);

    expect(next).toHaveBeenCalled();
  });

  it("nieuwhentykowany użytkownik odwiedzający /auth/signin przechodzi dalej (publiczna strona)", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const ctx = makeContext("/auth/signin");

    await onRequest(ctx as never, next);

    expect(next).toHaveBeenCalled();
  });

  it("strażnik prefiksu /api/auth/: nieuwhentykowany użytkownik wywołujący /api/auth2 otrzymuje 401", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const ctx = makeContext("/api/auth2");

    const response = await onRequest(ctx as never, next);

    expect((response as Response).status).toBe(401);
  });

  it("nieautoryzowany użytkownik otrzymuje 401 gdy createClient zwraca null (brak konfiguracji sesji)", async () => {
    mockCreateClient.mockReturnValueOnce(null);
    const ctx = makeContext("/api/decks");

    const response = await onRequest(ctx as never, next);

    expect((response as Response).status).toBe(401);
  });
});

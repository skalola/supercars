type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

type Session = {
  user: SessionUser;
} | null;

export async function auth(): Promise<Session> {
  return null;
}

export async function signIn(_provider?: string, _options?: { redirectTo?: string }) {
  return null;
}

export async function signOut() {
  return null;
}

export const GET = async () => new Response("auth handler", { status: 200 });
export const POST = async () => new Response("auth handler", { status: 200 });
export const handlers = { GET, POST };

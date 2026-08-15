import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { ensureDefaultClubMembership } from "@/lib/clubs/default-club";
import { prisma } from "@/lib/prisma";
import { enforceActionRateLimit, hashRateLimitIdentifier } from "@/lib/security/action-rate-limit";
import { verifyPassword } from "@/lib/auth/password";

const credentialUserSelect = {
  id: true,
  email: true,
  name: true,
  image: true,
  role: true,
};

const accountCredentialProvider = Credentials({
  id: "credentials",
  name: "Username or Email",
  credentials: {
    identifier: { label: "Username or email", type: "text" },
    password: { label: "Password", type: "password" },
  },
  async authorize(credentials) {
    const identifier = String(credentials?.identifier || "").trim().toLowerCase();
    const password = String(credentials?.password || "");

    await enforceActionRateLimit({
      actorId: hashRateLimitIdentifier(identifier || "missing-identifier"),
      action: "credential_login",
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });

    const user = identifier
      ? await prisma.user.findFirst({
          where: {
            OR: [
              { email: { equals: identifier, mode: "insensitive" } },
              { username: { equals: identifier, mode: "insensitive" } },
            ],
          },
          select: { ...credentialUserSelect, passwordHash: true },
        })
      : null;

    if (!(await verifyPassword(password, user?.passwordHash))) return null;
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      role: user.role || "USER",
    };
  },
});

const adminTestEmail = process.env.ADMIN_TEST_EMAIL?.trim().toLowerCase() || "";
const adminTestPassword = process.env.ADMIN_TEST_PASSWORD || "";
const userTestEmail = process.env.USER_TEST_EMAIL?.trim().toLowerCase() || "";
const userTestPassword = process.env.USER_TEST_PASSWORD || "";
const testCredentialsConfigured = Boolean(
  adminTestEmail && adminTestPassword && userTestEmail && userTestPassword,
);

export const testCredentialsEnabled = testCredentialsConfigured && (
  process.env.NODE_ENV !== "production" || process.env.ENABLE_TEST_CREDENTIALS === "true"
);

const testCredentialProviders = testCredentialsEnabled
  ? [
      Credentials({
        id: "admin-test",
        name: "Admin Test Login",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          const email = String(credentials?.email || "").trim().toLowerCase();
          const password = String(credentials?.password || "");

          await enforceActionRateLimit({
            actorId: hashRateLimitIdentifier(email || "missing-email"),
            action: "credential_login",
            limit: 10,
            windowMs: 15 * 60 * 1000,
          });

          if (email !== adminTestEmail || password !== adminTestPassword) {
            return null;
          }

          const user = await getOrCreateCredentialUser({
            email,
            name: "SUPERCARS Admin",
            role: "ADMIN",
          });

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            role: user.role || "ADMIN",
          };
        },
      }),
      Credentials({
        id: "user-test",
        name: "Regular Test Login",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          const email = String(credentials?.email || "").trim().toLowerCase();
          const password = String(credentials?.password || "");

          await enforceActionRateLimit({
            actorId: hashRateLimitIdentifier(email || "missing-email"),
            action: "credential_login",
            limit: 10,
            windowMs: 15 * 60 * 1000,
          });

          if (email !== userTestEmail || password !== userTestPassword) {
            return null;
          }

          const user = await getOrCreateCredentialUser({
            email,
            name: "SUPERCARS Test User",
            role: "USER",
          });

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            role: user.role || "USER",
          };
        },
      }),
    ]
  : [];

export const { handlers: { GET, POST }, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  providers: [
    Google,
    accountCredentialProvider,
    ...testCredentialProviders,
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user) {
        token.id = user.id;
        token.role = "role" in user ? user.role : "USER";
      }
      return token;
    },
    session: ({ session, token, user }) => {
      if (session.user) {
        session.user.id = (token.id as string) || user?.id;
        session.user.role = (token.role as string) || "USER";
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (!user.id) return;

      await ensureDefaultClubMembership(user.id).catch((error) => {
        console.error("Failed to ensure default club membership after sign-in", error);
      });
    },
  },
});

async function getOrCreateCredentialUser({
  email,
  name,
  role,
}: {
  email: string;
  name: string;
  role: "ADMIN" | "USER";
}) {
  const existing = await prisma.user.findUnique({
    where: { email },
    select: credentialUserSelect,
  });

  if (!existing) {
    return prisma.user.create({
      data: { email, name, role },
      select: credentialUserSelect,
    });
  }

  if (existing.name !== name || existing.role !== role) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { name, role },
      select: credentialUserSelect,
    });
  }

  return existing;
}

export type Session = ReturnType<typeof auth>;

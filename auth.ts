import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { ensureDefaultClubMembership } from "@/lib/clubs/default-club";
import { prisma } from "@/lib/prisma";

const credentialUserSelect = {
  id: true,
  email: true,
  name: true,
  image: true,
  role: true,
};

export const { handlers: { GET, POST }, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  providers: [
    Google,
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
        const expectedEmail = (process.env.ADMIN_TEST_EMAIL || "admin@supercars.test").toLowerCase();
        const expectedPassword = process.env.ADMIN_TEST_PASSWORD || "supercars-admin";

        if (email !== expectedEmail || password !== expectedPassword) {
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
        const expectedEmail = (process.env.USER_TEST_EMAIL || "user@supercars.test").toLowerCase();
        const expectedPassword = process.env.USER_TEST_PASSWORD || "supercars-user";

        if (email !== expectedEmail || password !== expectedPassword) {
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

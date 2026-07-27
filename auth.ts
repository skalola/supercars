import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

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

        const user = await prisma.user.upsert({
          where: { email },
          update: {
            name: "SUPERCARS Admin",
            role: "ADMIN",
          },
          create: {
            email,
            name: "SUPERCARS Admin",
            role: "ADMIN",
          },
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

        const user = await prisma.user.upsert({
          where: { email },
          update: {
            name: "SUPERCARS Test User",
            role: "USER",
          },
          create: {
            email,
            name: "SUPERCARS Test User",
            role: "USER",
          },
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
});

export type Session = ReturnType<typeof auth>;

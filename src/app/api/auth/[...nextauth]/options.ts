import { findOrCreateUser, isUserAuthorized } from "@lib/prisma/prismaFunctions";
import prisma from "@lib/prisma/prismaClient";
import GoogleProvider from "next-auth/providers/google";

export const options = {
  providers: [
    GoogleProvider({
      profile(profile) {
        let userRole = "Google User";
        return {
          ...profile,
          id: profile.sub,
          role: userRole,
        };
      },
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  callbacks: {
    async jwt({ token, user }: any) {
      if (user) token.role = user.role;
      return token;
    },
    async session({ session, token }: any) {
      if (session?.user){
        const res = await isUserAuthorized(prisma, session.user.email);
        const accounts = res?.data && await findOrCreateUser(prisma, session.user.email);
        session.user.authorized = res?.data || false;
        session.user.accounts = accounts || [];
        session.user.role = token.role;
      }
      return session;
    },
  },
};

import NextAuth from "next-auth";
import GitHubProvider from "next-auth/providers/github";

declare module "next-auth" {
    interface Session {
        user: {
            id?: string;
            name?: string | null;
            email?: string | null;
            image?: string | null;
        };
    }
}

const handler = NextAuth({
    providers: [
        GitHubProvider({
            clientId: process.env.GITHUB_ID!,
            clientSecret: process.env.GITHUB_SECRET!,
        }),
    ],
    pages: {
        signIn: "/login",
    },
    callbacks: {
        async session({ session, token }) {
            console.log(session, token);
            if (session.user) {
                session.user.id = token.sub;
                session.user.email = token.email;
            }
            return session;
        },
    },
});

export { handler as GET, handler as POST };

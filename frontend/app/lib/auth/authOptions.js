import CredentialsProvider from "next-auth/providers/credentials";
import dbConnect from "@/app/lib/dbconnect";
import User from "@/app/lib/schema/userschema";
import { verifyPassword } from "@/app/lib/auth/password-utils";

/**
 * Where this deployment thinks it lives.
 *
 * next-auth builds its sign-in callback out of NEXTAUTH_URL, so a wrong value does not
 * fail loudly — it succeeds, then sends the user somewhere that isn't the app. The
 * commonest way to get that wrong is to copy a local .env into a hosting dashboard,
 * where `http://localhost:3000` is both a perfectly valid string and completely wrong.
 *
 * Vercel already tells us the answer, so we ask it rather than asking the operator:
 *
 *   VERCEL_PROJECT_PRODUCTION_URL  the stable production domain
 *   VERCEL_URL                     this specific deployment, unique per preview build
 *
 * Preview branches each get their own hostname, which is exactly why hardcoding one
 * production URL breaks them. An explicitly configured NEXTAUTH_URL still wins — except
 * when it points at localhost while we are demonstrably not on localhost, because that
 * combination is never what anyone intended.
 */
function resolveAuthUrl() {
  const configured = (process.env.NEXTAUTH_URL || "").trim();
  const onVercel = Boolean(process.env.VERCEL || process.env.VERCEL_URL);
  const looksLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(configured);

  if (configured && !(onVercel && looksLocal)) {
    return configured;
  }

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const deploymentHost = process.env.VERCEL_URL;

  if (process.env.VERCEL_ENV === "production" && productionHost) {
    return `https://${productionHost}`;
  }
  if (deploymentHost) {
    return `https://${deploymentHost}`;
  }
  if (productionHost) {
    return `https://${productionHost}`;
  }

  return `http://localhost:${process.env.PORT || "3000"}`;
}

process.env.NEXTAUTH_URL = resolveAuthUrl();

if (process.env.VERCEL && /localhost/i.test(process.env.NEXTAUTH_URL)) {
  console.warn("[auth] Running on Vercel but could not resolve a public URL for callbacks.");
}

const RESOLVED_NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
if (!RESOLVED_NEXTAUTH_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("NEXTAUTH_SECRET (or AUTH_SECRET) must be set in production");
}

if (!RESOLVED_NEXTAUTH_SECRET && process.env.NODE_ENV !== "production") {
  console.warn("[auth] NEXTAUTH_SECRET is missing. Using a local development fallback secret.");
}

const NEXTAUTH_SECRET =
  RESOLVED_NEXTAUTH_SECRET || "dev-only-secret-change-before-production";

const STATIC_ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const STATIC_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";
const STATIC_ADMIN_ID = "000000000000000000000001";

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Login ID", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const loginId =
          typeof credentials?.username === "string" ? credentials.username.trim() : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";

        if (!loginId || !password) {
          throw new Error("Login ID and password are required");
        }

        if (loginId === STATIC_ADMIN_USERNAME && password === STATIC_ADMIN_PASSWORD) {
          return {
            id: STATIC_ADMIN_ID,
            name: "System Admin",
            email: "admin@local.healthsystem",
            role: "ADMIN",
            status: "APPROVED",
            location: null,
            workerId: null,
          };
        }

        await dbConnect();

        const normalizedEmail = loginId.toLowerCase();
        const normalizedWorkerId = loginId.toUpperCase();

        const user = await User.findOne({
          $or: [{ email: normalizedEmail }, { workerId: normalizedWorkerId }],
        });

        if (!user) {
          throw new Error("Invalid credentials");
        }

        const isPasswordValid = await verifyPassword(password, user.password);

        if (!isPasswordValid) {
          throw new Error("Invalid credentials");
        }

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          location: user.location || null,
          workerId: user.role === "ASHA" ? user.workerId || null : null,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.status = user.status;
        token.location = user.location || null;
        token.workerId = user.workerId || null;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.status = token.status;
        session.user.location = token.location || null;
        session.user.workerId = token.workerId || null;
      }

      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: NEXTAUTH_SECRET,
};

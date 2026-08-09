import dbConnect from "@/app/lib/dbconnect";
import User from "@/app/lib/schema/userschema";
import { buildLocation } from "@/app/lib/location-utils";
import { hashPassword } from "@/app/lib/auth/password-utils";
import { parseJsonBody, normalizeEmail, normalizeRequiredString } from "@/app/lib/request-utils";
import { logServerError } from "@/app/lib/server-log";

/**
 * Public signup for ordinary residents.
 *
 * Unlike a medical shop this needs no approval — a resident only reads guidance and
 * books medicine for themselves, and nothing they do moves stock until a shop confirms
 * the pickup. The account exists so chat history and order cooldowns can be tracked
 * against a person rather than a browser session.
 */
export async function POST(request) {
  try {
    const { body, error: parseError } = await parseJsonBody(request);
    if (parseError) return parseError;

    const name = normalizeRequiredString(body?.name);
    const email = normalizeEmail(body?.email);
    const password = normalizeRequiredString(body?.password);

    if (!name || !email || !password) {
      return Response.json(
        { message: "Naam, email aur password teeno chahiye." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return Response.json(
        { message: "Password kam se kam 6 characters ka rakhiye." },
        { status: 400 }
      );
    }

    // Village/district drive which shop fulfils an order and which area guide is
    // shown, so location is required here even though it is optional for admins.
    const { location: normalizedLocation, error: locationError } = buildLocation(body?.location);
    if (locationError) {
      return Response.json({ message: locationError }, { status: 400 });
    }

    if (!normalizedLocation?.district || !normalizedLocation?.village) {
      return Response.json(
        { message: "Gaon aur zila dono bhariye — isi se aapke area ka medical aur health guide milega." },
        { status: 400 }
      );
    }

    await dbConnect();

    const existingUser = await User.findOne({ email }).select("_id");
    if (existingUser) {
      return Response.json({ message: "Ye email pehle se registered hai." }, { status: 409 });
    }

    const hashedPassword = await hashPassword(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "USER",
      location: normalizedLocation,
      status: "APPROVED",
    });

    return Response.json(
      {
        message: "Registration ho gaya. Ab login karke Sehat Sahayak se baat kar sakte hain.",
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          location: user.location,
          status: user.status,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logServerError("api/user/register", error);
    return Response.json({ message: "Registration nahi ho paaya." }, { status: 500 });
  }
}

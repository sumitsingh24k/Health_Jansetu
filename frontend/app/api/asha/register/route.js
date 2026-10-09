import dbConnect from "@/app/lib/dbconnect";
import User from "@/app/lib/schema/userschema";
import { buildLocation } from "@/app/lib/location-utils";
import { hashPassword } from "@/app/lib/auth/password-utils";
import { parseJsonBody, normalizeEmail, normalizeRequiredString } from "@/app/lib/request-utils";
import { logServerError } from "@/app/lib/server-log";
import { createAshaUser } from "@/app/lib/auth/worker-id";

/** Self-signup for ASHA workers with an automatically assigned worker ID. */
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

    const { location: normalizedLocation, error: locationError } = buildLocation(body?.location);
    if (locationError) {
      return Response.json({ message: locationError }, { status: 400 });
    }

    if (!normalizedLocation?.district || !normalizedLocation?.village) {
      return Response.json(
        { message: "Apna gaon aur zila bhariye — aapki report isi area par darj hogi." },
        { status: 400 }
      );
    }

    await dbConnect();

    const existingUser = await User.findOne({ email }).select("_id");
    if (existingUser) {
      return Response.json({ message: "Ye email pehle se registered hai." }, { status: 409 });
    }

    const hashedPassword = await hashPassword(password, 10);

    const user = await createAshaUser({
      name,
      email,
      password: hashedPassword,
      location: normalizedLocation,
      status: "APPROVED",
    });

    return Response.json(
      {
        message: `Account ban gaya. Aapka worker ID ${user.workerId} hai. Ab email ya worker ID se login kijiye.`,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          workerId: user.workerId,
          location: user.location,
          status: user.status,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logServerError("api/asha/register", error);
    return Response.json({ message: "Registration nahi ho paaya." }, { status: 500 });
  }
}

import User from "@/app/lib/schema/userschema";

/**
 * Allocates the next ASHA_### id by reading the highest existing sequence.
 *
 * Shared by admin creation and self-registration. The unique index on `workerId` is
 * the real guard against collisions — callers retry on a duplicate-key error rather
 * than relying on this read being race-free.
 */
export async function generateWorkerId() {
  const [latest] = await User.aggregate([
    {
      $match: {
        role: "ASHA",
        workerId: { $type: "string" },
      },
    },
    {
      $addFields: {
        workerSequence: {
          $cond: [
            { $regexMatch: { input: "$workerId", regex: /^ASHA_\d+$/ } },
            {
              $toInt: {
                $arrayElemAt: [{ $split: ["$workerId", "_"] }, 1],
              },
            },
            null,
          ],
        },
      },
    },
    { $match: { workerSequence: { $ne: null } } },
    { $sort: { workerSequence: -1 } },
    { $limit: 1 },
    { $project: { _id: 0, workerSequence: 1 } },
  ]);

  const nextNumber =
    Number.isInteger(latest?.workerSequence) && latest.workerSequence > 0
      ? latest.workerSequence + 1
      : 1;

  return `ASHA_${String(nextNumber).padStart(3, "0")}`;
}

/**
 * Creates an ASHA account, retrying if two signups race for the same workerId.
 * @returns the created user document
 */
export async function createAshaUser(fields) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const workerId = await generateWorkerId();

    try {
      return await User.create({ ...fields, role: "ASHA", workerId });
    } catch (error) {
      const duplicateWorkerId = error?.code === 11000 && error?.keyPattern?.workerId;
      if (!duplicateWorkerId) throw error;
    }
  }

  throw new Error("Could not allocate a unique ASHA workerId.");
}

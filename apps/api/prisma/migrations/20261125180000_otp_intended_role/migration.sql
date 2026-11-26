-- AlterTable
ALTER TABLE "OtpChallenge" ADD COLUMN "intendedRole" TEXT;
ALTER TABLE "OtpChallenge" ADD COLUMN "bootstrapGranted" BOOLEAN NOT NULL DEFAULT false;

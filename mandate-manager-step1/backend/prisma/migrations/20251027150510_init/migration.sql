-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'AGENT');

-- CreateEnum
CREATE TYPE "MandateStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SIGNED');

-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('RESERVED', 'DRAFT', 'SIGNED', 'RELEASED');

-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('DRAFT', 'SIGNED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "firstName" TEXT,
    "lastName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MandateNumber" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "status" "MandateStatus" NOT NULL DEFAULT 'AVAILABLE',

    CONSTRAINT "MandateNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MandateAllocation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mandateNumberId" TEXT NOT NULL,
    "status" "AllocationStatus" NOT NULL DEFAULT 'RESERVED',
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadlineAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "MandateAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MandateFile" (
    "id" TEXT NOT NULL,
    "allocationId" TEXT NOT NULL,
    "kind" "FileKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,

    CONSTRAINT "MandateFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MandateNumber_code_key" ON "MandateNumber"("code");

-- CreateIndex
CREATE INDEX "MandateNumber_status_year_seq_idx" ON "MandateNumber"("status", "year", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "MandateNumber_year_seq_key" ON "MandateNumber"("year", "seq");

-- CreateIndex
CREATE INDEX "MandateAllocation_status_deadlineAt_idx" ON "MandateAllocation"("status", "deadlineAt");

-- AddForeignKey
ALTER TABLE "MandateAllocation" ADD CONSTRAINT "MandateAllocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MandateAllocation" ADD CONSTRAINT "MandateAllocation_mandateNumberId_fkey" FOREIGN KEY ("mandateNumberId") REFERENCES "MandateNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MandateFile" ADD CONSTRAINT "MandateFile_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "MandateAllocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

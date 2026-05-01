-- CreateEnum
CREATE TYPE "public"."NotificationLevel" AS ENUM ('WARNING_70', 'REACHED_100', 'EXCEEDED');

-- CreateEnum
CREATE TYPE "public"."NotificationChannel" AS ENUM ('EMAIL', 'PUSH');

-- CreateTable
CREATE TABLE "public"."ExpenseThreshold" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "foodAndDrink" DOUBLE PRECISION NOT NULL DEFAULT 400,
    "groceries" DOUBLE PRECISION NOT NULL DEFAULT 400,
    "entertainment" DOUBLE PRECISION NOT NULL DEFAULT 400,
    "shopping" DOUBLE PRECISION NOT NULL DEFAULT 300,
    "billsAndUtilities" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "car" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "healthAndWellness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "personal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "feesAndAdjustments" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "others" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "foster" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseThreshold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NotificationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "level" "public"."NotificationLevel" NOT NULL,
    "month" TEXT NOT NULL,
    "channel" "public"."NotificationChannel" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseThreshold_userId_key" ON "public"."ExpenseThreshold"("userId");

-- CreateIndex
CREATE INDEX "NotificationLog_userId_month_idx" ON "public"."NotificationLog"("userId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_userId_category_level_month_key" ON "public"."NotificationLog"("userId", "category", "level", "month");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "public"."PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_userId_idx" ON "public"."PushToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_userId_deviceId_key" ON "public"."PushToken"("userId", "deviceId");

-- AddForeignKey
ALTER TABLE "public"."ExpenseThreshold" ADD CONSTRAINT "ExpenseThreshold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NotificationLog" ADD CONSTRAINT "NotificationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PushToken" ADD CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

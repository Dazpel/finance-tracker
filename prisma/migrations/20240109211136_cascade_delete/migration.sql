-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "plaidAccessToken" TEXT,
    "plaidItemId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "reportName" TEXT NOT NULL,
    "foodAndDrink" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "billsAndUtilities" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "entertainment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "groceries" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "healthAndWellness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "personal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shopping" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "feesAndAdjustments" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "others" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expenses" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" SERIAL NOT NULL,
    "reportId" INTEGER NOT NULL,
    "account_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TEXT NOT NULL,
    "category" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

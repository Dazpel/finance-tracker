-- CreateIndex
CREATE INDEX "Note_userId_idx" ON "public"."Note"("userId");

-- CreateIndex
CREATE INDEX "PlaidAccount_userId_idx" ON "public"."PlaidAccount"("userId");

-- CreateIndex
CREATE INDEX "RecurringReport_userId_idx" ON "public"."RecurringReport"("userId");

-- CreateIndex
CREATE INDEX "RecurringTransaction_userId_idx" ON "public"."RecurringTransaction"("userId");

-- CreateIndex
CREATE INDEX "RecurringTransaction_outflowReportId_idx" ON "public"."RecurringTransaction"("outflowReportId");

-- CreateIndex
CREATE INDEX "RecurringTransaction_inflowReportId_idx" ON "public"."RecurringTransaction"("inflowReportId");

-- CreateIndex
CREATE INDEX "Report_userId_reportType_idx" ON "public"."Report"("userId", "reportType");

-- CreateIndex
CREATE INDEX "Report_parentReportId_idx" ON "public"."Report"("parentReportId");

-- CreateIndex
CREATE INDEX "Transaction_userId_date_idx" ON "public"."Transaction"("userId", "date");

-- CreateIndex
CREATE INDEX "Transaction_reportId_idx" ON "public"."Transaction"("reportId");

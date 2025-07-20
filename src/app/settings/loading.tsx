import React from "react";
import { Card, Skeleton } from "@heroui/react";

export default function loading() {
  return (
    <Card className="p-4" aria-label="Skeleton table">
      <Skeleton className="h-10 w-full rounded-lg mb-4" />
      <div className="w-full flex flex-col gap-2">
        {[...Array(3)].map((_, index) => (
          <Skeleton key={index} className="h-5 w-4/5 rounded-lg" />
        ))}
      </div>
    </Card>
  );
}

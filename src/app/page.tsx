import React, { Suspense } from "react";
import { Content } from "@components/home/content";
import PageLoader from "@components/PageLoader/PageLoader";

export default function Home() {
  return (
    <div className="h-full">
      <Suspense fallback={<PageLoader />}>
        <Content />
      </Suspense>
    </div>
  );
}

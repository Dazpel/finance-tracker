import React from "react";

type HomeGreetingProps = {
  firstName: string | null;
};

export const HomeGreeting = ({ firstName }: HomeGreetingProps) => (
  <div className="flex flex-col gap-1">
    <h1 className="text-2xl font-semibold tracking-tight">
      Welcome back{firstName ? `, ${firstName}` : ""}
    </h1>
    <p className="text-sm text-default-500">Here's where things stand today.</p>
  </div>
);

"use client";

import React from "react";
import Link from "next/link";
import { Card, CardBody } from "@heroui/react";
import { QUICK_LINKS } from "./constants";

export const JumpBackIn = () => (
  <div className="flex flex-col gap-3">
    <h2 className="text-xs font-semibold uppercase tracking-wide text-default-500">
      Jump back in
    </h2>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {QUICK_LINKS.map((link) => (
        <Link key={link.href} href={link.href} className="group">
          <Card
            isHoverable
            shadow="sm"
            className="h-full transition-transform group-hover:-translate-y-0.5"
          >
            <CardBody className="gap-1">
              <span className="text-lg" aria-hidden="true">
                {link.icon}
              </span>
              <span className="font-semibold">{link.label}</span>
              <span className="text-xs text-default-500">{link.description}</span>
            </CardBody>
          </Card>
        </Link>
      ))}
    </div>
  </div>
);

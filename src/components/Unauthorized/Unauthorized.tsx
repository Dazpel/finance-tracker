"use client";

import EyeLogo from "@components/navbar/EyeLogo";
import { Button, Card, CardBody, CardHeader } from "@nextui-org/react";
import { signOut } from "next-auth/react";
import React from "react";

function Unauthorized() {
  return (
    <div className="bg-darkTheme box-border grid h-full m-0 p-0 place-items-center absolute w-full">
      <Card className="flex flex-col justify-center items-center w-fit bg-[#0d1117] p-4">
        <CardBody className="flex flex-col gap-4 items-center">
          <h1 className="text-white">You are not authorized, please contact an admin</h1>
          <Button onPress={() => signOut()} color="primary">
            Sign Out
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}

export default Unauthorized;

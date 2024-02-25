import React from "react";
import eyeImg from "./eyeImg.png";
import Image from "next/image";

interface Company {
  name: string;
  logo: React.ReactNode;
}

export const CompaniesDropdown = () => {
  return (
    <div className="flex justify-center items-center gap-2">
      <Image height={50} width={50} src={eyeImg} alt="Company Logo" />
      <h3 className="text-xl font-medium m-0 text-default-900 whitespace-nowrap">
        MoneyEye
      </h3>
    </div>
  );
};

import React, { useState } from "react";
import { AcmeIcon } from "../icons/acme-icon";

interface Company {
  name: string;
  logo: React.ReactNode;
}

export const CompaniesDropdown = () => {
  const [company, setCompany] = useState<Company>({
    name: "MoneyEye",
    logo: <AcmeIcon />,
  });
  return (
    <div className="flex justify-center items-center gap-2">
      {company.logo}
      <h3 className="text-xl font-medium m-0 text-default-900 whitespace-nowrap">
        {company.name}
      </h3>
    </div>
  );
};

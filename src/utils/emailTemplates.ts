import sgMail from "@sendgrid/mail";

type SpendingBreakdown = {
    name: string;
    spending: number;
};

export const sendUpdateAccountEmail = async (email: string) => {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY || "");
    console.log("-----------------------------------");
    console.log("------- Sending sendUpdateAccountEmail  -------");
    console.log("-----------------------------------");
    const msg = {
      templateId: "d-3f227b02e3b749ee9a30f87180ac6793",
      from: process.env.SENDGRID_SENDER_EMAIL || "",
      personalizations:[
          {
              to: email
          },
      ]
    };
  
    try {
      await sgMail.send(msg);
    } catch (error) {
      console.error(error);
    }
}

export const sendBiweekReportEmail = async (
    email: string,
    spendingBreakdown: SpendingBreakdown[],
    expenses: number,
    revenue: number
  ) => {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY || "");
    console.log("-----------------------------------");
    console.log("------- Sending sendBiweekReportEmail  -------");
    console.log("-----------------------------------");
    const msg = {
      templateId: "d-44079ab6dafa436ab355b868a5420031",
      from: process.env.SENDGRID_SENDER_EMAIL || "",
      personalizations:[
          {
              to: email,
              dynamic_template_data: {
                  categories: spendingBreakdown,
                  expenses,
                  revenue,
              },
          },
      ]
    };
  
    try {
      await sgMail.send(msg);
    } catch (error) {
      console.error(error);
    }
  };
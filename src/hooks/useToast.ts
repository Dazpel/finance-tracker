import { addToast } from "@heroui/react";

export const useToast = () => {
  const successToast = (message: string, title?: string) => {
    addToast({
      title: title || "Success",
      description: message,
      color: "success",
      variant: "flat",
    });
  };

  const errorToast = (message: string, title?: string) => {
    addToast({
      title: title || "Error",
      description: message,
      color: "danger",
      variant: "flat",
    });
  };

  const warningToast = (message: string, title?: string) => {
    addToast({
      title: title || "Warning",
      description: message,
      color: "warning",
      variant: "flat",
    });
  };

  const infoToast = (message: string, title?: string) => {
    addToast({
      title: title || "Info",
      description: message,
      color: "primary",
      variant: "flat",
    });
  };

  return {
    successToast,
    errorToast,
    warningToast,
    infoToast,
  };
};

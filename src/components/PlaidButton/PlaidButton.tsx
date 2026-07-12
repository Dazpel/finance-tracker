import React, { useCallback, useState } from "react";
import { Button, Skeleton, Tooltip } from "@heroui/react";
import { useRouter, usePathname } from "next/navigation";
import { useToast } from "../../hooks/useToast";
import {
  usePlaidLink,
  PlaidLinkOnSuccess,
  PlaidLinkOnEvent,
  PlaidLinkOnExit,
  PlaidLinkOptions,
} from "react-plaid-link";
import { useQuery } from "@tanstack/react-query";
import { addAccountAction } from "app/accounts/actions";

type PlaidButtonProps = {
  updateMode?: boolean;
  plaidAccountId?: string;
  buttonText?: string;
  variant?: "default" | "update" | "reconnect";
  size?: "sm" | "md" | "lg";
  className?: string;
  onSuccessCallback?: () => void;
};

function PlaidButton({
  updateMode = false,
  plaidAccountId,
  buttonText,
  variant = "default",
  size = "md",
  className = "",
  onSuccessCallback
}: PlaidButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { successToast, errorToast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);
  
  // Enhanced query with better error handling
  const { 
    data: token, 
    isLoading: isTokenLoading, 
    error: tokenError,
    refetch: refetchToken 
  } = useQuery({
    queryKey: ['plaidToken', updateMode, plaidAccountId],
    queryFn: async () => {
      const response = await fetch("/api/plaid/createLink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updateMode, plaidAccountId }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create link token: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.link_token;
    },
    retry: 2,
    retryDelay: 1000,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      setIsConnecting(true);

      try {
        if (!updateMode) {
          const result = await addAccountAction(
            publicToken,
            metadata?.institution?.name || "Connected Institution"
          );

          if (result.success) {
            successToast("Bank account connected successfully!");
            router.refresh();
          } else {
            errorToast(result.error || "Failed to connect account");
          }
        } else {
          successToast("Account updated successfully!");
          router.refresh();
        }
      } catch (error) {
        errorToast("Connection failed. Please try again.");
        console.error("Plaid connection error:", error);
      } finally {
        onSuccessCallback && onSuccessCallback();
        setIsConnecting(false);
      }
    },
    [updateMode, router, successToast, errorToast, onSuccessCallback]
  );
  const onEvent = useCallback<PlaidLinkOnEvent>((eventName, metadata) => {
    // Enhanced event logging
    console.log(`Plaid Link Event: ${eventName}`, metadata);
  }, []);

  const onExit = useCallback<PlaidLinkOnExit>((error, metadata) => {
    if (error) {
      console.error('Plaid Link Exit Error:', error, metadata);
      errorToast(`Connection failed: ${error.error_message || 'Unknown error'}`);
    }
    setIsConnecting(false);
  }, [errorToast]);

  const config: PlaidLinkOptions = {
    token,
    onSuccess,
    onEvent,
    onExit,
    // Enhanced configuration
    countryCodes: ['US'],
    language: 'en',
  };

  const { open, ready } = usePlaidLink(config);

  // Enhanced loading states
  if (isTokenLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-[150px] rounded-lg" />
        <Skeleton className="h-4 w-[120px] rounded" />
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="flex flex-col gap-2">
        <Button
          color="danger"
          variant="flat"
          size={size}
          onPress={() => refetchToken()}
          className={className}
        >
          Retry Connection
        </Button>
        <p className="text-sm text-danger">
          Failed to initialize connection. Please try again.
        </p>
      </div>
    );
  }

  const getButtonVariant = () => {
    switch (variant) {
      case "update": return "secondary";
      case "reconnect": return "warning";
      default: return "primary";
    }
  };

  const getButtonText = () => {
    if (buttonText) return buttonText;
    
    switch (variant) {
      case "update": return "Update Account";
      case "reconnect": return "Reconnect Account";
      default: return "Connect a Bank Account";
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Tooltip 
        content={!ready ? "Initializing connection..." : ""}
        placement="top"
      >
        <Button
          color={getButtonVariant()}
          size={size}
          className={`w-fit ${className}`}
          onPress={() => open()}
          isDisabled={!ready || isConnecting}
          isLoading={isConnecting}
          startContent={
            !ready && !isConnecting && (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            )
          }
        >
          {getButtonText()}
        </Button>
      </Tooltip>
      
      {!ready && (
        <p className="text-xs text-gray-500 text-center">
          Setting up secure connection...
        </p>
      )}
    </div>
  );
}

export default PlaidButton;

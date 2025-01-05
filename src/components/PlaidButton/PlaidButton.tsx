import React, { useCallback, useState } from "react";
import { Button, Skeleton } from "@nextui-org/react";
import { useRouter } from "next/navigation";

import {
  usePlaidLink,
  PlaidLinkOnSuccess,
  PlaidLinkOnEvent,
  PlaidLinkOnExit,
  PlaidLinkOptions,
} from "react-plaid-link";
import { useQuery } from "@tanstack/react-query";

type PlaidButtonProps = {
  updateMode?: Boolean;
  accessToken?: string;
  buttonText?: string;
};

function PlaidButton({ updateMode = false, accessToken, buttonText }: PlaidButtonProps) {
  const [error, setError] = useState<boolean>(false);
  const router = useRouter();
  
  const { isFetching, isLoading, isError: queryError, data: token } = useQuery({
    queryKey: ['plaidToken'],
    queryFn: async () => {
      const response = await fetch("/api/plaid/createLink", {
        method: "POST",
        body: JSON.stringify({ updateMode, accessToken }),
      });
      const { link_token } = await response.json();

      return link_token;
    },
  })
  
  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      if (!updateMode){
        const body = { publicToken, institutionName: metadata?.institution?.name };
        const res = await fetch("/api/plaid/getAccessToken", {
          method: "POST",
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data?.success) {
          router.refresh();
        } else {
          setError(true);
        }
      }

      updateMode && router.refresh();
    },
    []
  );
  const onEvent = useCallback<PlaidLinkOnEvent>((eventName, metadata) => {
    // log onEvent callbacks from Link
    // https://plaid.com/docs/link/web/#onevent
    console.log(eventName, metadata);
  }, []);
  const onExit = useCallback<PlaidLinkOnExit>((error, metadata) => {
    // log onExit callbacks from Link, handle errors
    // https://plaid.com/docs/link/web/#onexit
    console.log(error, metadata);
    setError(true);
  }, []);

  const config: PlaidLinkOptions = {
    token,
    onSuccess,
    onEvent,
    onExit,
  };

  const {
    open,
    ready,
    // error,
    // exit
  } = usePlaidLink(config);

  if (isFetching || isLoading) {
    return <Skeleton className="h-10 w-[150px] rounded-lg mb-4" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <Button
        color="primary"
        className="w-fit"
        onPress={() => open()}
        disabled={!ready}
      >
        {buttonText || "Connect a bank account"}
      </Button>
      {(error || queryError) && <p className="mb-4 text-danger">Error connecting accounts</p>}
    </div>
  );
}

export default PlaidButton;

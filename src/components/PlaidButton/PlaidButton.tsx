import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@nextui-org/react";
import { useRouter } from "next/navigation";

import {
  usePlaidLink,
  PlaidLinkOnSuccess,
  PlaidLinkOnEvent,
  PlaidLinkOnExit,
  PlaidLinkOptions,
} from "react-plaid-link";

type PlaidButtonProps = {
  updateMode?: Boolean;
  accessToken?: string;
  buttonText?: string;
};

function PlaidButton({ updateMode = false, accessToken, buttonText }: PlaidButtonProps) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<boolean>(false);
  const router = useRouter();

  // get a link_token from your API when component mounts
  useEffect(() => {
    const createLinkToken = async () => {
      const response = await fetch("/api/plaid/createLink", {
        method: "POST",
        body: JSON.stringify({ updateMode, accessToken }),
      });
      const { link_token } = await response.json();
      setToken(link_token);
    };
    createLinkToken();
  }, []);

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

  return (
    <div className="flex flex-col gap-4">
      <Button
        color="primary"
        className="w-fit"
        onClick={() => open()}
        disabled={!ready}
      >
        {buttonText || "Connect a bank account"}
      </Button>
      {error && <p className="mb-4 text-danger">Error connecting accounts</p>}
    </div>
  );
}

export default PlaidButton;

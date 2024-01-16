import * as React from "react"
const RedoIcon = (props:any) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={24}
    height={24}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={2}
    className="icon icon-tabler icon-tabler-arrow-forward-up"
    {...props}
  >
    <path stroke="none" d="M0 0h24v24H0z" />
    <path d="m15 14 4-4-4-4" />
    <path d="M19 10H8a4 4 0 1 0 0 8h1" />
  </svg>
)
export default RedoIcon
